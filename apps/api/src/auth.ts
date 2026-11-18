import { createHash, randomBytes } from "node:crypto";

import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpException,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { loginSchema } from "@pulse/shared";
import type { Request, Response } from "express";

import { Db, hashPassword, parse, verify } from "./core";
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const cookie = (req: Request) =>
  req.headers.cookie?.match(
    /(?:^|;\s*)pulse_refresh=([a-f0-9]{96})(?:;|$)/,
  )?.[1] ?? "";
const opts = () => ({
  httpOnly: true,
  secure: process.env.SECURE_COOKIES === "true",
  sameSite: "strict" as const,
  path: "/api/v1/auth",
});
@Controller("auth")
export class AuthController {
  private attempts = new Map<string, { count: number; until: number }>();
  private dummy = hashPassword(randomBytes(32).toString("hex"));
  constructor(
    private db: Db,
    private jwt: JwtService,
  ) {}
  private csrf(req: Request) {
    if (
      req.header("x-pulse-client") !== "web" ||
      (req.headers.origin && req.headers.origin !== process.env.WEB_ORIGIN)
    )
      throw new ForbiddenException();
  }
  private async result(
    user: { id: string; name: string; role: { name: string } },
    sid: string,
    refresh: string,
    res: Response,
  ) {
    res.cookie("pulse_refresh", refresh, { ...opts(), maxAge: 7 * 86400000 });
    return {
      accessToken: await this.jwt.signAsync(
        { sub: user.id, sid },
        { expiresIn: "10m", issuer: "pulse-api", audience: "pulse-web" },
      ),
      user: { id: user.id, name: user.name, role: user.role.name },
    };
  }
  @Post("login") @HttpCode(200) async login(
    @Body() raw: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.csrf(req);
    const b = parse(loginSchema, raw);
    const ip = req.ip ?? "local";
    const t = Date.now();
    for (const [k, v] of this.attempts)
      if (v.until < t) this.attempts.delete(k);
    const attempt = this.attempts.get(ip) ?? { count: 0, until: t + 60000 };
    if (attempt.count >= 20) throw new HttpException("Try again later", 429);
    const user = await this.db.user.findUnique({
      where: { email: b.email },
      include: { role: true },
    });
    if (
      !(await verify(b.password, user?.passwordHash ?? (await this.dummy))) ||
      !user
    ) {
      this.attempts.set(ip, { ...attempt, count: attempt.count + 1 });
      throw new UnauthorizedException("Invalid credentials");
    }
    const token = randomBytes(48).toString("hex");
    const session = await this.db.refreshSession.create({
      data: {
        userId: user.id,
        digest: digest(token),
        expiresAt: new Date(t + 7 * 86400000),
      },
    });
    return this.result(user, session.id, token, res);
  }
  @Post("refresh") @HttpCode(200) async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.csrf(req);
    const old = digest(cookie(req));
    const token = randomBytes(48).toString("hex");
    const session = await this.db.$transaction(async (tx) => {
      if (
        !(
          await tx.refreshSession.updateMany({
            where: {
              digest: old,
              revoked: false,
              expiresAt: { gt: new Date() },
            },
            data: { digest: digest(token) },
          })
        ).count
      )
        throw new UnauthorizedException();
      return tx.refreshSession.findUniqueOrThrow({
        where: { digest: digest(token) },
        include: { user: { include: { role: true } } },
      });
    });
    return this.result(session.user, session.id, token, res);
  }
  @Post("logout") @HttpCode(200) async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.csrf(req);
    await this.db.refreshSession.updateMany({
      where: { digest: digest(cookie(req)) },
      data: { revoked: true },
    });
    res.clearCookie("pulse_refresh", opts());
    return { ok: true };
  }
}
