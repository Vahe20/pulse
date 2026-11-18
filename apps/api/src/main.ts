import "reflect-metadata";

import {
  ArgumentsHost,
  Catch,
  ConsoleLogger,
  Controller,
  ExceptionFilter,
  Get,
  HttpException,
  Module,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Prisma } from "@prisma/client";
import type { Response } from "express";

import { Analyses, AnalysisRunner } from "./ai";
import { Reports } from "./analytics";
import { AuthController } from "./auth";
import { Db, SessionGuard } from "./core";
import { Directory } from "./directory";
import { Issues } from "./issues";
import { Jobs } from "./jobs";
import { documentContracts } from "./openapi";
import { Surveys } from "./surveys";
@Controller("health")
class Health {
  constructor(
    private db: Db,
    private jobs: Jobs,
  ) {}
  @Get() async check() {
    await this.db.$queryRaw`SELECT 1`;
    await this.jobs.ready();
    return { status: "ok" };
  }
}
@Catch()
class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const code =
      error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "";
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : code === "P2025"
          ? 404
          : code === "P2002"
            ? 409
            : code === "P2003"
              ? 400
              : 500;
    const message =
      error instanceof HttpException
        ? error.message
        : status === 404
          ? "Record unavailable"
          : status === 409
            ? "Record already exists"
            : status === 400
              ? "Invalid reference"
              : "Server error";
    if (status >= 500)
      console.error(
        JSON.stringify({ event: "request.failed", code: code || "internal" }),
      );
    res.status(status).json({ statusCode: status, message });
  }
}
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory() {
        const secret = process.env.JWT_SECRET;
        if (!secret || secret.length < 32)
          throw Error(
            "Set JWT_SECRET to a random value of at least 32 characters",
          );
        return { secret };
      },
    }),
  ],
  controllers: [
    Health,
    AuthController,
    Directory,
    Surveys,
    Analyses,
    Reports,
    Issues,
  ],
  providers: [Db, SessionGuard, AnalysisRunner, Jobs],
})
class AppModule {}
async function start() {
  if (
    process.env.NODE_ENV === "production" &&
    (process.env.DEMO_MODE === "true" ||
      process.env.SECURE_COOKIES !== "true" ||
      !process.env.WEB_ORIGIN?.startsWith("https://"))
  )
    throw Error(
      "Configure HTTPS, secure cookies and a live provider environment for production",
    );
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ json: true }),
  });
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new Errors());
  app.enableShutdownHooks();
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("Pulse API")
      .setVersion("1")
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup("api/v1/docs", app, documentContracts(doc));
  await app.listen(Number(process.env.API_PORT || 4100), "0.0.0.0");
}
void start();
