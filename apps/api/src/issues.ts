import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { issueSchema, issueStates, priorities } from "@pulse/shared";
import { z } from "zod";

import {
  Actor,
  allow,
  Current,
  Db,
  paging,
  parse,
  SessionGuard,
  uuid,
} from "./core";
export function issueScope(a: Actor): Prisma.IssueWhereInput {
  allow(a, "EDU_LEAD", "ADMIN_LEAD", "DIRECTOR", "SYSTEM_ADMIN", "LECTURER");
  if (a.role === "LECTURER")
    return { assigneeId: a.id, survey: { lecturer: { userId: a.id } } };
  if (a.role === "ADMIN_LEAD")
    return {
      OR: [
        { category: { in: ["Administration", "Technology"] } },
        { assigneeId: a.id },
      ],
    };
  if (a.role === "EDU_LEAD")
    return { OR: [{ category: "Education" }, { assigneeId: a.id }] };
  return {};
}
async function ensureOwner(
  tx: Prisma.TransactionClient,
  id: string,
  surveyId: string,
) {
  const owner = await tx.user.findFirstOrThrow({
    where: { id, role: { name: { not: "STUDENT" } } },
    select: { role: { select: { name: true } } },
  });
  if (
    owner.role.name === "LECTURER" &&
    !(await tx.survey.findFirst({
      where: { id: surveyId, lecturer: { userId: id } },
      select: { id: true },
    }))
  )
    throw new BadRequestException(
      "Choose the source survey lecturer or another staff owner",
    );
}
const include = {
  assignee: { select: { id: true, name: true } },
  survey: { select: { id: true, title: true } },
  theme: { select: { id: true, title: true } },
} as const;
@Controller("issues")
@UseGuards(SessionGuard)
export class Issues {
  constructor(private db: Db) {}
  @Get() list(@Current() a: Actor, @Query() raw: unknown) {
    const p = paging(raw);
    const b = parse(
      z.object({
        status: z.enum(issueStates).optional(),
        surveyId: z.string().uuid().optional(),
        overdue: z.enum(["true", "false"]).optional(),
      }),
      raw,
    );
    return this.db.issue.findMany({
      where: {
        ...issueScope(a),
        title: { contains: p.search, mode: "insensitive" },
        surveyId: b.surveyId,
        status: b.status,
        ...(b.overdue === "true"
          ? {
              dueAt: { lt: new Date() },
              AND: { status: { notIn: ["RESOLVED", "CLOSED"] } },
            }
          : {}),
      },
      include,
      skip: p.skip,
      take: p.take,
      orderBy: [{ dueAt: p.sort }, { id: "asc" }],
    });
  }
  @Get(":id") detail(@Current() a: Actor, @Param("id") id: string) {
    return this.db.issue.findFirstOrThrow({
      where: { id: uuid(id), ...issueScope(a) },
      include: {
        ...include,
        history: {
          include: { actor: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
        outgoing: {
          where: { to: issueScope(a) },
          select: { to: { select: { id: true, title: true } } },
        },
        incoming: {
          where: { from: issueScope(a) },
          select: { from: { select: { id: true, title: true } } },
        },
      },
    });
  }
  @Get(":id/followup") async followup(
    @Current() a: Actor,
    @Param("id") id: string,
  ) {
    const issue = await this.db.issue.findFirstOrThrow({
      where: { id: uuid(id), ...issueScope(a) },
      select: { surveyId: true, resolvedAt: true },
    });
    const shape = {
      targets: { select: { groupId: true } },
      questions: {
        where: { kind: "RATING" as const, criterion: { not: null } },
        include: { answers: { select: { value: true } } },
      },
    };
    const source = await this.db.survey.findUniqueOrThrow({
      where: { id: issue.surveyId },
      include: shape,
    });
    const later = await this.db.survey.findMany({
      where: {
        startAt: {
          gte:
            issue.resolvedAt && issue.resolvedAt > source.endAt
              ? issue.resolvedAt
              : source.endAt,
        },
        lecturerId: source.lecturerId,
        status: { in: ["ACTIVE", "CLOSED", "ARCHIVED"] },
      },
      include: shape,
      orderBy: { startAt: "asc" },
    });
    const groupKey = (items: { groupId: string }[]) =>
      items
        .map((t) => t.groupId)
        .sort()
        .join("/");
    const average = (items: { value: Prisma.JsonValue }[], min: number) => {
      const values = items.flatMap((v) =>
        typeof v.value === "number" ? [v.value] : [],
      );
      return values.length >= min
        ? values.reduce((a, b) => a + b, 0) / values.length
        : null;
    };
    if (source.anonymous && source.status === "ACTIVE") return [];
    for (const next of later) {
      if (next.anonymous && next.status === "ACTIVE") continue;
      if (groupKey(next.targets) !== groupKey(source.targets)) continue;
      const results = source.questions.flatMap((old) => {
        const q = next.questions.find((v) => v.criterion === old.criterion);
        if (!q) return [];
        const before = average(old.answers, source.minimum),
          after = average(q.answers, next.minimum);
        return before === null || after === null
          ? []
          : [{ criterion: old.criterion, before, after, title: next.title }];
      });
      if (results.length) return results;
    }
    return [];
  }
  @Post() async create(@Current() a: Actor, @Body() raw: unknown) {
    allow(a, "EDU_LEAD", "ADMIN_LEAD", "SYSTEM_ADMIN", "DIRECTOR");
    const b = parse(issueSchema, raw);
    if (
      (a.role === "EDU_LEAD" && b.category !== "Education") ||
      (a.role === "ADMIN_LEAD" && b.category === "Education")
    )
      throw new BadRequestException("Choose an authorized category");
    return this.db.$transaction(async (tx) => {
      await ensureOwner(tx, b.assigneeId, b.surveyId);
      await tx.survey.findFirstOrThrow({
        where: { id: b.surveyId, status: { not: "DRAFT" } },
      });
      if (b.themeId)
        await tx.theme.findFirstOrThrow({
          where: {
            id: b.themeId,
            analysis: { surveyId: b.surveyId, status: "PUBLISHED" },
          },
        });
      return tx.issue.create({
        data: {
          ...b,
          creatorId: a.id,
          history: {
            create: {
              actorId: a.id,
              event: "Created",
              detail: { assigneeId: b.assigneeId },
            },
          },
        },
        include,
      });
    });
  }
  @Put(":id") async change(
    @Current() a: Actor,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = parse(
      z
        .object({
          status: z.enum(issueStates).optional(),
          priority: z.enum(priorities).optional(),
          assigneeId: z.string().uuid().optional(),
          dueAt: z.string().datetime().optional(),
          comment: z.string().trim().min(1).max(2000).optional(),
          relatedId: z.string().uuid().optional(),
          updatedAt: z.string().datetime(),
        })
        .strict(),
      raw,
    );
    const { updatedAt, comment, relatedId, ...changes } = b;
    if (
      a.role === "LECTURER" &&
      (b.assigneeId || b.priority || b.dueAt || relatedId)
    )
      throw new BadRequestException("Owners may update status or add comments");
    return this.db.$transaction(async (tx) => {
      const current = await tx.issue.findFirstOrThrow({
        where: { id: uuid(id), ...issueScope(a) },
      });
      if (b.assigneeId) await ensureOwner(tx, b.assigneeId, current.surveyId);
      if (
        ((a.role === "EDU_LEAD" && current.category !== "Education") ||
          (a.role === "ADMIN_LEAD" && current.category === "Education")) &&
        (b.assigneeId || b.priority || b.dueAt || relatedId)
      )
        throw new BadRequestException(
          "Owners may update status or add comments",
        );
      const permitted = {
        OPEN: ["ASSIGNED", "IN_PROGRESS"],
        ASSIGNED: ["IN_PROGRESS", "OPEN"],
        IN_PROGRESS: ["RESOLVED", "ASSIGNED"],
        RESOLVED: ["CLOSED", "IN_PROGRESS"],
        CLOSED: ["OPEN"],
      } as Record<string, string[]>;
      if (
        b.status &&
        b.status !== current.status &&
        !permitted[current.status].includes(b.status)
      )
        throw new ConflictException("Invalid status transition");
      if (
        !(
          await tx.issue.updateMany({
            where: { id, updatedAt },
            data: {
              ...changes,
              updatedAt: new Date(),
              ...(b.status
                ? {
                    resolvedAt: ["RESOLVED", "CLOSED"].includes(b.status)
                      ? (current.resolvedAt ?? new Date())
                      : null,
                  }
                : {}),
            },
          })
        ).count
      )
        throw new ConflictException("Reload the issue and retry");
      if (relatedId) {
        if (relatedId === id) throw new BadRequestException();
        await tx.issue.findFirstOrThrow({
          where: { id: relatedId, ...issueScope(a) },
        });
        const [fromId, toId] = [id, relatedId].sort();
        await tx.issueLink.upsert({
          where: { fromId_toId: { fromId, toId } },
          create: { fromId, toId },
          update: {},
        });
      }
      await tx.issueHistory.create({
        data: {
          actorId: a.id,
          issueId: id,
          event: comment ? "Comment" : "Updated",
          detail: {
            ...changes,
            previousStatus: current.status,
            ...(relatedId ? { relatedId } : {}),
            ...(comment ? { comment } : {}),
          },
        },
      });
      return { ok: true };
    });
  }
}
