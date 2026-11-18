import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import {
  BadRequestException,
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  OnModuleDestroy,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaClient, RoleName } from "@prisma/client";
import type { Request } from "express";
import { z } from "zod";
@Injectable()
export class Db extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
export type Actor = {
  id: string;
  role: RoleName;
  name: string;
  sessionId: string;
};
export const Current = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<Request & { actor: Actor }>().actor,
);
export function allow(actor: Actor, ...roles: RoleName[]) {
  if (!roles.includes(actor.role)) throw new ForbiddenException();
}
export function parse<T extends z.ZodTypeAny>(
  schema: T,
  value: unknown,
): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues
        .map((i) => i.path.join(".") + " " + i.message)
        .join(", "),
    );
  return result.data;
}
export const uuid = (v: unknown) => parse(z.string().uuid(), v);
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().max(160).default(""),
  sort: z.enum(["asc", "desc"]).default("desc"),
});
export function paging(value: unknown) {
  const p = parse(pageSchema, value);
  return { ...p, skip: (p.page - 1) * p.limit, take: p.limit };
}
export const httpUser = {
  id: true,
  name: true,
  email: true,
  role: { select: { name: true } },
} as const;
const derive = promisify(scrypt);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return (
    salt + ":" + ((await derive(password, salt, 64)) as Buffer).toString("hex")
  );
}
export async function verify(password: string, hash: string) {
  const [salt, digest] = hash.split(":");
  return timingSafeEqual(
    (await derive(password, salt, 64)) as Buffer,
    Buffer.from(digest, "hex"),
  );
}
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private db: Db,
    private jwt: JwtService,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request & { actor: Actor }>();
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new UnauthorizedException();
    let claims: { sub: string; sid: string };
    try {
      claims = await this.jwt.verifyAsync(token, {
        algorithms: ["HS256"],
        audience: "pulse-web",
        issuer: "pulse-api",
      });
    } catch {
      throw new UnauthorizedException();
    }
    const session = await this.db.refreshSession.findFirst({
      where: {
        id: claims.sid,
        userId: claims.sub,
        revoked: false,
        expiresAt: { gt: new Date() },
      },
      include: { user: { include: { role: true } } },
    });
    if (!session) throw new UnauthorizedException();
    req.actor = {
      id: session.userId,
      sessionId: session.id,
      name: session.user.name,
      role: session.user.role.name,
    };
    return true;
  }
}
