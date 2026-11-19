import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  submissionSchema,
  SurveyInput,
  surveySchema,
  validateAnswers,
} from "@pulse/shared";

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
export function surveyScope(a: Actor): Prisma.SurveyWhereInput {
  if (a.role === "STUDENT")
    return { invitations: { some: { studentId: a.id } } };
  if (a.role === "LECTURER")
    return { lecturer: { userId: a.id }, status: { not: "DRAFT" } };
  return {};
}
const questions = {
  orderBy: { position: "asc" },
  include: { options: { orderBy: { position: "asc" } } },
} as const;
function config(b: SurveyInput) {
  const { groupIds, questions: items, ...survey } = b;
  return {
    ...survey,
    targets: { create: groupIds.map((groupId) => ({ groupId })) },
    questions: {
      create: items.map(({ options, ...q }, position) => ({
        ...q,
        position,
        options: {
          create: options.map((label, i) => ({ label, position: i })),
        },
      })),
    },
  };
}
@Controller("surveys")
@UseGuards(SessionGuard)
export class Surveys {
  constructor(private db: Db) {}
  @Get() list(@Current() a: Actor, @Query() q: unknown) {
    const p = paging(q);
    return this.db.survey.findMany({
      where: {
        ...surveyScope(a),
        title: { contains: p.search, mode: "insensitive" },
      },
      select: {
        id: true,
        title: true,
        status: true,
        startAt: true,
        endAt: true,
        anonymous: true,
        ...(a.role === "STUDENT"
          ? {
              invitations: {
                where: { studentId: a.id },
                select: { completed: true },
              },
            }
          : { _count: { select: { invitations: true, responses: true } } }),
      },
      skip: p.skip,
      take: p.take,
      orderBy: [{ startAt: p.sort }, { id: "asc" }],
    });
  }
  @Get(":id") async detail(@Current() a: Actor, @Param("id") id: string) {
    const s = await this.db.survey.findFirst({
      where: { id: uuid(id), ...surveyScope(a) },
      include: {
        questions,
        targets: { include: { group: true } },
        lecturer: { select: { user: { select: { name: true } } } },
        ...(a.role === "STUDENT"
          ? {
              invitations: {
                where: { studentId: a.id },
                select: { completed: true },
              },
            }
          : { _count: { select: { invitations: true, responses: true } } }),
      },
    });
    if (!s) throw new NotFoundException();
    return s;
  }
  @Get(":id/invitations") async invitations(
    @Current() a: Actor,
    @Param("id") id: string,
    @Query() query: unknown,
  ) {
    allow(a, "EDU_LEAD", "SYSTEM_ADMIN");
    const p = paging(query);
    await this.db.survey.findFirstOrThrow({
      where: { id: uuid(id), anonymous: false, ...surveyScope(a) },
      select: { id: true },
    });
    return this.db.surveyInvitation.findMany({
      where: {
        surveyId: id,
        survey: { anonymous: false },
        student: { name: { contains: p.search, mode: "insensitive" } },
      },
      select: {
        id: true,
        completed: true,
        student: { select: { name: true } },
        notifications: {
          select: { sequence: true, status: true },
          orderBy: { sequence: "desc" },
          take: 1,
        },
      },
      orderBy: [{ student: { name: p.sort } }, { id: "asc" }],
      skip: p.skip,
      take: p.take,
    });
  }
  @Post() async create(@Current() a: Actor, @Body() raw: unknown) {
    allow(a, "SYSTEM_ADMIN", "EDU_LEAD");
    const b = parse(surveySchema, raw);
    return this.db.survey.create({
      data: { ...config(b), creatorId: a.id },
      select: { id: true },
    });
  }
  @Put(":id") async edit(
    @Current() a: Actor,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    allow(a, "SYSTEM_ADMIN", "EDU_LEAD");
    uuid(id);
    const b = parse(surveySchema, raw);
    return this.db.$transaction(async (tx) => {
      if (
        !(
          await tx.survey.updateMany({
            where: { id, status: "DRAFT" },
            data: { updatedAt: new Date() },
          })
        ).count
      )
        throw new ConflictException("Only draft surveys can be edited");
      await tx.surveyTarget.deleteMany({ where: { surveyId: id } });
      await tx.surveyQuestion.deleteMany({ where: { surveyId: id } });
      return tx.survey.update({
        where: { id },
        data: config(b),
        select: { id: true },
      });
    });
  }
  @Post(":id/publish") async publish(
    @Current() a: Actor,
    @Param("id") id: string,
  ) {
    allow(a, "SYSTEM_ADMIN", "EDU_LEAD");
    const result = await this.db.survey.updateMany({
      where: { id: uuid(id), status: "DRAFT", endAt: { gt: new Date() } },
      data: { status: "SCHEDULED" },
    });
    if (!result.count)
      throw new ConflictException("Publish an unexpired draft");
    return { status: "SCHEDULED" };
  }
  @Post(":id/archive") async archive(
    @Current() a: Actor,
    @Param("id") id: string,
  ) {
    allow(a, "SYSTEM_ADMIN", "EDU_LEAD");
    if (
      !(
        await this.db.survey.updateMany({
          where: { id: uuid(id), status: { in: ["CLOSED", "DRAFT"] } },
          data: { status: "ARCHIVED" },
        })
      ).count
    )
      throw new ConflictException("Archive a closed survey or draft");
    return { status: "ARCHIVED" };
  }
  @Post(":id/responses") async submit(
    @Current() a: Actor,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    allow(a, "STUDENT");
    uuid(id);
    const { answers } = parse(submissionSchema, raw);
    return this.db.$transaction(async (tx) => {
      const survey = await tx.survey.findFirstOrThrow({
        where: { id, ...surveyScope(a) },
        include: { questions },
      });
      const error = validateAnswers(survey.questions, answers);
      if (error) throw new BadRequestException(error);
      const accepted = await tx.surveyInvitation.updateMany({
        where: {
          surveyId: id,
          studentId: a.id,
          completed: false,
          survey: {
            status: "ACTIVE",
            startAt: { lte: new Date() },
            endAt: { gt: new Date() },
          },
        },
        data: {
          completed: true,
          nextReminder: null,
          ...(survey.anonymous ? { updatedAt: new Date(0) } : {}),
        },
      });
      if (!accepted.count)
        throw new ConflictException("Survey closed or already submitted");
      await tx.surveyResponse.create({
        data: {
          surveyId: id,
          studentId: survey.anonymous ? null : a.id,
          answers: {
            create: Object.entries(answers)
              .filter(([, v]) => v !== "" && !(Array.isArray(v) && !v.length))
              .map(([questionId, value]) => ({ questionId, value })),
          },
        },
      });
      return { submitted: true };
    });
  }
}
