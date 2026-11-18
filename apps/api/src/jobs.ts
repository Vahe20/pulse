import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import nodemailer from "nodemailer";

import { AnalysisRunner } from "./ai";
import { Db } from "./core";
@Injectable()
export class Jobs implements OnModuleInit, OnModuleDestroy {
  private connection = {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),
  };
  private queue = new Queue("pulse-work", {
    connection: this.connection,
    defaultJobOptions: {
      attempts: 4,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
    },
  });
  private worker?: Worker;
  private mail = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 1025),
    secure: process.env.SMTP_TLS === "true",
    ...(process.env.SMTP_USER
      ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }
      : {}),
  });
  constructor(
    private db: Db,
    private ai: AnalysisRunner,
  ) {}
  async onModuleInit() {
    this.worker = new Worker(
      "pulse-work",
      async (job) => {
        if (job.name === "tick") return this.tick();
        if (job.name === "mail") return this.deliver(job.data.id);
        if (job.name === "analysis") return this.ai.run(job.data.id);
        throw Error("Unknown job");
      },
      { connection: this.connection, concurrency: 4 },
    );
    this.worker.on("failed", async (job) => {
      if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
      try {
        if (job.name === "analysis")
          await this.db.aIAnalysis.updateMany({
            where: {
              id: job.data.id,
              status: { in: ["QUEUED", "PROCESSING"] },
            },
            data: { status: "FAILED" },
          });
        if (job.name === "mail")
          await this.db.notification.updateMany({
            where: { id: job.data.id, status: "PENDING" },
            data: { status: "FAILED" },
          });
        Logger.error({ event: "job.failed", job: job.name, id: job.id });
      } catch {
        Logger.error("Failed to persist job failure");
      }
    });
    this.worker.on("error", () => Logger.error("Queue connection error"));
    await this.queue.upsertJobScheduler(
      "survey-clock",
      { every: 3000 },
      { name: "tick" },
    );
  }
  async ready() {
    return this.queue.getJobCounts("waiting");
  }
  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
    this.mail.close();
  }
  async tick() {
    const now = new Date();
    for (const s of await this.db.survey.findMany({
      where: { status: "SCHEDULED", startAt: { lte: now }, endAt: { gt: now } },
      include: { targets: true },
    })) {
      await this.db.$transaction(async (tx) => {
        if (
          !(
            await tx.survey.updateMany({
              where: { id: s.id, status: "SCHEDULED" },
              data: { status: "ACTIVE" },
            })
          ).count
        )
          return;
        const members = await tx.groupMembership.findMany({
          where: {
            groupId: { in: s.targets.map((t) => t.groupId) },
            student: { role: { name: "STUDENT" } },
          },
          select: { studentId: true },
          distinct: ["studentId"],
        });
        await tx.surveyInvitation.createMany({
          data: members.map((m) => ({
            ...m,
            surveyId: s.id,
            nextReminder: new Date(+now + s.reminderHours * 3600000),
          })),
          skipDuplicates: true,
        });
        const invites = await tx.surveyInvitation.findMany({
          where: { surveyId: s.id },
          select: { id: true },
        });
        await tx.notification.createMany({
          data: invites.map((i) => ({ invitationId: i.id, sequence: 0 })),
          skipDuplicates: true,
        });
      });
    }
    for (const s of await this.db.survey.findMany({
      where: { status: { in: ["ACTIVE", "SCHEDULED"] }, endAt: { lte: now } },
      include: { _count: { select: { responses: true } } },
    })) {
      await this.db.$transaction(async (tx) => {
        if (
          !(
            await tx.survey.updateMany({
              where: { id: s.id, status: s.status },
              data: { status: "CLOSED" },
            })
          ).count
        )
          return;
        if (
          s._count.responses >= s.minimum &&
          (process.env.DEMO_MODE === "true" ||
            (process.env.ALLOW_EXTERNAL_AI === "true" &&
              process.env.OPENAI_API_KEY))
        )
          await tx.aIAnalysis.createMany({
            skipDuplicates: true,
            data: {
              surveyId: s.id,
              source: process.env.DEMO_MODE === "true" ? "DEMO" : "OPENAI",
            },
          });
      });
    }
    const due = await this.db.surveyInvitation.findMany({
      where: {
        completed: false,
        nextReminder: { lte: now },
        survey: { status: "ACTIVE", endAt: { gt: now } },
      },
      include: {
        survey: { include: { _count: { select: { responses: true } } } },
      },
      take: 500,
      orderBy: { nextReminder: "asc" },
    });
    for (const i of due) {
      const s = i.survey;
      const stop =
        i.reminders >= s.maxReminders || s._count.responses >= s.minimum;
      await this.db.$transaction(async (tx) => {
        const advanced = await tx.surveyInvitation.updateMany({
          where: {
            id: i.id,
            completed: false,
            reminders: i.reminders,
            nextReminder: i.nextReminder,
          },
          data: stop
            ? { nextReminder: null }
            : {
                reminders: { increment: 1 },
                nextReminder: new Date(+now + s.reminderHours * 3600000),
              },
        });
        if (advanced.count && !stop)
          await tx.notification.create({
            data: { invitationId: i.id, sequence: i.reminders + 1 },
          });
      });
    }
    for (const n of await this.db.notification.findMany({
      where: { status: "PENDING" },
      take: 500,
      orderBy: { createdAt: "asc" },
    }))
      await this.queue.add("mail", { id: n.id }, { jobId: "mail-" + n.id });
    for (const a of await this.db.aIAnalysis.findMany({
      where: { status: "QUEUED" },
      take: 100,
    }))
      await this.queue.add(
        "analysis",
        { id: a.id },
        { jobId: "analysis-" + a.id },
      );
  }
  async deliver(id: string) {
    const n = await this.db.notification.findUniqueOrThrow({
      where: { id },
      include: {
        invitation: {
          include: {
            survey: { include: { _count: { select: { responses: true } } } },
            student: { select: { email: true } },
          },
        },
      },
    });
    if (n.status !== "PENDING") return;
    const i = n.invitation;
    const s = i.survey;
    if (
      i.completed ||
      s.status !== "ACTIVE" ||
      s.endAt <= new Date() ||
      (n.sequence > 0 && s._count.responses >= s.minimum)
    ) {
      await this.db.notification.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
      return;
    }
    await this.mail.sendMail({
      from: process.env.MAIL_FROM,
      to: i.student.email,
      messageId: "<" + id + "@pulse.local>",
      subject:
        (n.sequence ? "Survey reminder: " : "Survey invitation: ") + s.title,
      text:
        "Please share your feedback by " +
        s.endAt.toISOString() +
        ". " +
        process.env.WEB_ORIGIN +
        "/surveys/" +
        s.id,
    });
    await this.db.notification.update({
      where: { id },
      data: { status: "DELIVERED" },
    });
  }
}
