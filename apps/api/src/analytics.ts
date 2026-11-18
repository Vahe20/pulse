import { Controller, Get, Param, Query, Res, UseGuards } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { difference, issueStates } from "@pulse/shared";
import type { Response } from "express";
import { z } from "zod";

import { Actor, allow, Current, Db, parse, SessionGuard, uuid } from "./core";
import { issueScope } from "./issues";
import { surveyScope } from "./surveys";
const filters = z.object({
  groupId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
  lecturerId: z.string().uuid().optional(),
  surveyId: z.string().uuid().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  status: z.enum(issueStates).optional(),
});
@Controller()
@UseGuards(SessionGuard)
export class Reports {
  constructor(private db: Db) {}
  @Get("reports") async report(@Current() a: Actor, @Query() raw: unknown) {
    allow(a, "LECTURER", "EDU_LEAD", "ADMIN_LEAD", "DIRECTOR", "SYSTEM_ADMIN");
    const q = parse(filters, raw);
    const where: Prisma.SurveyWhereInput = {
      ...surveyScope(a),
      status: { not: "DRAFT" },
      lecturerId: q.lecturerId,
      ...(q.groupId || q.courseId
        ? {
            targets: {
              some: { groupId: q.groupId, group: { courseId: q.courseId } },
            },
          }
        : {}),
    };
    const series = await this.db.survey.findMany({
      where,
      select: {
        id: true,
        title: true,
        startAt: true,
        endAt: true,
        status: true,
        minimum: true,
        anonymous: true,
        lecturerId: true,
        lecturer: { select: { user: { select: { name: true } } } },
        targets: {
          select: { groupId: true, group: { select: { name: true } } },
        },
        _count: { select: { invitations: true, responses: true } },
        questions: {
          where: { kind: "RATING" },
          select: { id: true, criterion: true, category: true },
        },
      },
      orderBy: { startAt: "asc" },
    });
    const idsForRatings = series.map((s) => s.id);
    const aggregates = idsForRatings.length
      ? await this.db.$queryRaw<
          { id: string; count: number; points: number }[]
        >(
          Prisma.sql`SELECT q.id, count(*)::int AS count, sum((a.value #>> '{}')::numeric)::float8 AS points FROM "Answer" a JOIN "SurveyQuestion" q ON q.id=a."questionId" JOIN "Survey" s ON s.id=q."surveyId" WHERE q.kind='RATING' AND jsonb_typeof(a.value)='number' AND s.id IN (${Prisma.join(idsForRatings.map((id) => Prisma.sql`${id}::uuid`))}) GROUP BY q.id,s.minimum HAVING count(*)>=s.minimum`,
        )
      : [];
    const ratingTotals = new Map(aggregates.map((r) => [r.id, r]));
    const eligible = series.filter(
      (s) =>
        ((!q.groupId && !q.courseId) || s.targets.length === 1) &&
        (!q.surveyId || s.id === q.surveyId) &&
        (!q.from || s.startAt.toISOString().slice(0, 10) >= q.from) &&
        (!q.to || s.startAt.toISOString().slice(0, 10) <= q.to),
    );
    const ids = eligible.map((s) => s.id);
    const issues = await this.db.issue.findMany({
      where: { ...issueScope(a), surveyId: { in: ids }, status: q.status },
      select: { status: true, dueAt: true },
    });
    const threshold =
      (await this.db.setting.findUnique({ where: { key: "drop" } }))?.value ??
      0.4;
    const history = new Map<
      string,
      { date: Date; score: number; title: string }[]
    >();
    const timeline = [];
    const trends = [];
    let sum = 0,
      count = 0,
      invited = 0,
      responses = 0;
    const cohorts = new Map<
      string,
      {
        dimension: string;
        period: string;
        criterion: string;
        id: string;
        name: string;
        points: number;
        ratings: number;
        invited: number;
      }
    >();
    const categoryTotals = new Map<string, { sum: number; count: number }>();
    for (const s of series) {
      const selected = ids.includes(s.id);
      if (selected) {
        invited += s._count.invitations;
        responses += s._count.responses;
      }
      if (
        s._count.responses < s.minimum ||
        (s.anonymous && !["CLOSED", "ARCHIVED"].includes(s.status))
      )
        continue;
      let total = 0,
        n = 0;
      for (const qn of s.questions) {
        const aggregate = ratingTotals.get(qn.id);
        if (!aggregate) continue;
        const { points, count: ratingCount } = aggregate;
        total += points;
        n += ratingCount;
        if (selected) {
          const cat = categoryTotals.get(qn.category) ?? { sum: 0, count: 0 };
          categoryTotals.set(qn.category, {
            sum: cat.sum + points,
            count: cat.count + ratingCount,
          });
        }
        if (!qn.criterion) continue;
        if (selected) {
          const period = s.startAt.toISOString().slice(0, 7);
          const entities = [
            {
              dimension: "Lecturer",
              id: s.lecturerId,
              name: s.lecturer.user.name,
            },
            ...(s.targets.length === 1
              ? [
                  {
                    dimension: "Group",
                    id: s.targets[0].groupId,
                    name: s.targets[0].group.name,
                  },
                ]
              : []),
          ];
          for (const entity of entities) {
            const k = [period, qn.criterion, entity.dimension, entity.id].join(
              "/",
            );
            const row = cohorts.get(k) ?? {
              ...entity,
              period,
              criterion: qn.criterion,
              points: 0,
              ratings: 0,
              invited: 0,
            };
            row.points += points;
            row.ratings += ratingCount;
            row.invited += s._count.invitations;
            cohorts.set(k, row);
          }
        }
        const key = [
          s.lecturerId,
          ...s.targets.map((t) => t.groupId).sort(),
          qn.criterion,
        ].join("/");
        const prior = history.get(key) ?? [];
        const old = prior
          .filter((p) => p.date <= s.startAt)
          .sort((a, b) => +b.date - +a.date)[0];
        const score = points / ratingCount;
        if (selected && old) {
          const diff = difference(old.score, score);
          trends.push({
            survey: s.title,
            surveyId: s.id,
            previous: old.title,
            criterion: qn.criterion,
            previousScore: old.score,
            score,
            ...diff,
            alert: diff.absolute <= -threshold + 1e-9,
          });
        }
        prior.push({ date: s.endAt, score, title: s.title });
        history.set(key, prior);
      }
      if (selected && n) {
        sum += total;
        count += n;
        timeline.push({
          id: s.id,
          title: s.title,
          date: s.startAt,
          score: total / n,
          lecturer: s.lecturer.user.name,
          groups: s.targets.map((t) => t.group.name).join(", "),
          responses: s._count.responses,
          invited: s._count.invitations,
        });
      }
    }
    const closed = issues.filter(
      (i) => i.status === "RESOLVED" || i.status === "CLOSED",
    ).length;
    const analyses = await this.db.aIAnalysis.findMany({
      where: { surveyId: { in: ids }, status: "PUBLISHED" },
      distinct: ["surveyId"],
      orderBy: [{ surveyId: "asc" }, { createdAt: "desc" }],
      select: {
        surveyId: true,
        source: true,
        themes: { select: { title: true, mentions: true, sentiment: true } },
      },
    });
    const comparisons = [...cohorts.values()]
      .filter((row) =>
        [...cohorts.values()].some(
          (other) =>
            other.dimension === row.dimension &&
            other.period === row.period &&
            other.criterion === row.criterion &&
            other.id !== row.id,
        ),
      )
      .map((row) => ({
        dimension: row.dimension,
        name: row.name,
        period: row.period,
        criterion: row.criterion,
        score: row.points / row.ratings,
        responses: row.ratings,
        invited: row.invited,
      }));
    return {
      comparisons,
      surveys: ids.length,
      active: eligible.filter((s) => s.status === "ACTIVE").length,
      invited,
      responses,
      responseRate: invited ? (100 * responses) / invited : null,
      score: count ? sum / count : null,
      openIssues: issues.length - closed,
      resolved: closed,
      overdue: issues.filter(
        (i) =>
          !["CLOSED", "RESOLVED"].includes(i.status) && i.dueAt < new Date(),
      ).length,
      threshold,
      timeline,
      trends,
      categories: [...categoryTotals].map(([category, v]) => ({
        category,
        score: v.sum / v.count,
      })),
      themes: analyses.flatMap((x) =>
        x.themes.map((t) => ({ ...t, source: x.source, surveyId: x.surveyId })),
      ),
      participation: eligible.map((s) => ({
        id: s.id,
        title: s.title,
        invited: s._count.invitations,
        responses: s._count.responses,
      })),
    };
  }
  @Get("surveys/:id/analytics") detail(
    @Current() a: Actor,
    @Param("id") id: string,
  ) {
    return this.report(a, { surveyId: uuid(id) });
  }
  @Get("reports/csv") async csv(
    @Current() a: Actor,
    @Query() raw: unknown,
    @Res() res: Response,
  ) {
    const d = await this.report(a, raw);
    const cell = (v: string | number | null) =>
      '"' +
      String(v ?? "")
        .replace(/^(\s*[=+@-])/, "'$1")
        .replaceAll('"', '""') +
      '"';
    const rows = [
      ["Metric", "Value"],
      ...Object.entries(d)
        .filter(([, v]) => typeof v === "number" || v === null)
        .map(([k, v]) => [k, v as number | null]),
      [],
      ["Survey", "Score", "Group", "Lecturer", "Responses", "Invited"],
      ...d.timeline.map((s) => [
        s.title,
        s.score,
        s.groups,
        s.lecturer,
        s.responses,
        s.invited,
      ]),
      [],
      ["Criterion", "Previous", "Current", "Difference", "Percent"],
      ...d.trends.map((t) => [
        t.criterion,
        t.previousScore,
        t.score,
        t.absolute,
        t.percent,
      ]),
    ];
    res
      .attachment("pulse-report.csv")
      .type("text/csv")
      .send("\ufeff" + rows.map((row) => row.map(cell).join(",")).join("\r\n"));
  }
}
