import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { roleNames } from "@pulse/shared";
import { z } from "zod";

import {
  Actor,
  allow,
  Current,
  Db,
  hashPassword,
  httpUser,
  paging,
  parse,
  SessionGuard,
  uuid,
} from "./core";
const name = z.string().trim().min(1).max(120);
@Controller()
@UseGuards(SessionGuard)
export class Directory {
  constructor(private db: Db) {}
  @Get("users") users(@Current() a: Actor, @Query() q: unknown) {
    allow(a, "SYSTEM_ADMIN", "EDU_LEAD", "ADMIN_LEAD", "DIRECTOR");
    const p = paging(q);
    return this.db.user.findMany({
      where: {
        name: { contains: p.search, mode: "insensitive" },
        ...(a.role === "SYSTEM_ADMIN"
          ? {}
          : { role: { name: { not: "STUDENT" } } }),
      },
      select:
        a.role === "SYSTEM_ADMIN"
          ? httpUser
          : { id: true, name: true, role: { select: { name: true } } },
      skip: p.skip,
      take: p.take,
      orderBy: [{ name: p.sort }, { id: "asc" }],
    });
  }
  @Post("users") async user(@Current() a: Actor, @Body() raw: unknown) {
    allow(a, "SYSTEM_ADMIN");
    const b = parse(
      z
        .object({
          name,
          email: z.string().email().toLowerCase(),
          password: z.string().min(12).max(256),
          role: z.enum(roleNames),
          groupId: z.string().uuid().optional(),
        })
        .refine(
          (x) => (x.role === "STUDENT" ? !!x.groupId : !x.groupId),
          "Select a group for each student",
        ),
      raw,
    );
    return this.db.user.create({
      data: {
        name: b.name,
        email: b.email,
        passwordHash: await hashPassword(b.password),
        role: { connect: { name: b.role } },
        ...(b.role === "LECTURER" ? { lecturer: { create: {} } } : {}),
        ...(b.groupId
          ? { memberships: { create: { groupId: b.groupId } } }
          : {}),
      },
      select: httpUser,
    });
  }
  @Put("users/:id")
  async updateUser(
    @Current() actor: Actor,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    allow(actor, "SYSTEM_ADMIN");
    uuid(id);
    const changes = parse(
      z
        .object({
          name,
          email: z.string().email().toLowerCase(),
          role: z.enum(roleNames),
          password: z.string().min(12).max(256).optional(),
          groupId: z.string().uuid().optional(),
        })
        .strict(),
      raw,
    );
    if (id === actor.id && changes.role !== "SYSTEM_ADMIN")
      throw new BadRequestException(
        "You cannot remove your own administrator role",
      );
    const passwordHash = changes.password
      ? await hashPassword(changes.password)
      : undefined;
    return this.db.$transaction(async (tx) => {
      const current = await tx.user.findUniqueOrThrow({
        where: { id },
        include: {
          role: true,
          lecturer: { include: { _count: { select: { surveys: true } } } },
          _count: { select: { assigned: true, memberships: true } },
        },
      });
      if (current.lecturer?._count.surveys && changes.role !== "LECTURER")
        throw new BadRequestException("This lecturer has assigned surveys");
      if (changes.role === "STUDENT" && current._count.assigned)
        throw new BadRequestException(
          "Reassign owned issues before changing this role",
        );
      if (
        changes.role === "STUDENT" &&
        !current._count.memberships &&
        !changes.groupId
      )
        throw new BadRequestException("Select a student group");
      if (changes.role !== "STUDENT" && changes.groupId)
        throw new BadRequestException("Only students have group membership");
      if (changes.role === "LECTURER")
        await tx.lecturer.upsert({
          where: { userId: id },
          create: { userId: id },
          update: {},
        });
      else if (current.lecturer)
        await tx.lecturer.delete({ where: { userId: id } });
      if (changes.role !== "STUDENT")
        await tx.groupMembership.deleteMany({ where: { studentId: id } });
      if (changes.groupId)
        await tx.groupMembership.upsert({
          where: {
            studentId_groupId: { studentId: id, groupId: changes.groupId },
          },
          create: { studentId: id, groupId: changes.groupId },
          update: {},
        });
      if (
        passwordHash ||
        changes.role !== current.role.name ||
        changes.email !== current.email
      )
        await tx.refreshSession.updateMany({
          where: { userId: id },
          data: { revoked: true },
        });
      const user = await tx.user.update({
        where: { id },
        data: {
          name: changes.name,
          email: changes.email,
          role: { connect: { name: changes.role } },
          passwordHash,
        },
        select: httpUser,
      });
      await tx.auditLog.create({
        data: { actorId: actor.id, resourceId: id, action: "user.updated" },
      });
      return user;
    });
  }
  @Put("courses/:id") renameCourse(
    @Current() a: Actor,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    allow(a, "SYSTEM_ADMIN");
    return this.db.course.update({
      where: { id: uuid(id) },
      data: parse(z.object({ name }), raw),
    });
  }
  @Put("groups/:id") renameGroup(
    @Current() a: Actor,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    allow(a, "SYSTEM_ADMIN");
    return this.db.studentGroup.update({
      where: { id: uuid(id) },
      data: parse(z.object({ name }), raw),
    });
  }
  @Get("courses") courses(@Current() a: Actor, @Query() q: unknown) {
    allow(a, "SYSTEM_ADMIN", "EDU_LEAD", "ADMIN_LEAD", "DIRECTOR");
    const p = paging(q);
    return this.db.course.findMany({
      where: { name: { contains: p.search, mode: "insensitive" } },
      skip: p.skip,
      take: p.take,
      orderBy: { name: p.sort },
    });
  }
  @Post("courses") course(@Current() a: Actor, @Body() raw: unknown) {
    allow(a, "SYSTEM_ADMIN");
    return this.db.course.create({ data: parse(z.object({ name }), raw) });
  }
  @Get("groups") groups(@Current() a: Actor, @Query() q: unknown) {
    allow(a, "SYSTEM_ADMIN", "EDU_LEAD", "ADMIN_LEAD", "DIRECTOR");
    const p = paging(q);
    return this.db.studentGroup.findMany({
      where: { name: { contains: p.search, mode: "insensitive" } },
      include: { course: true, _count: { select: { members: true } } },
      skip: p.skip,
      take: p.take,
      orderBy: { name: p.sort },
    });
  }
  @Post("groups") group(@Current() a: Actor, @Body() raw: unknown) {
    allow(a, "SYSTEM_ADMIN");
    return this.db.studentGroup.create({
      data: parse(z.object({ name, courseId: z.string().uuid() }), raw),
    });
  }
  @Get("lecturers") lecturers(@Current() a: Actor, @Query() q: unknown) {
    allow(a, "SYSTEM_ADMIN", "EDU_LEAD", "ADMIN_LEAD", "DIRECTOR");
    const p = paging(q);
    return this.db.lecturer.findMany({
      select: { id: true, user: { select: { id: true, name: true } } },
      where: { user: { name: { contains: p.search, mode: "insensitive" } } },
      skip: p.skip,
      take: p.take,
      orderBy: { user: { name: p.sort } },
    });
  }
  @Get("settings") async settings(@Current() a: Actor) {
    allow(a, "SYSTEM_ADMIN");
    return {
      threshold:
        (await this.db.setting.findUnique({ where: { key: "drop" } }))?.value ??
        0.4,
    };
  }
  @Put("settings") settingsUpdate(@Current() a: Actor, @Body() raw: unknown) {
    allow(a, "SYSTEM_ADMIN");
    const { threshold: value } = parse(
      z.object({ threshold: z.number().positive().max(4) }),
      raw,
    );
    return this.db.setting.upsert({
      where: { key: "drop" },
      create: { key: "drop", value },
      update: { value },
    });
  }
  @Get("notifications") notifications(
    @Current() a: Actor,
    @Query() q: unknown,
  ) {
    const p = paging(q);
    return this.db.notification.findMany({
      where: { invitation: { studentId: a.id } },
      select: {
        id: true,
        status: true,
        sequence: true,
        createdAt: true,
        invitation: {
          select: { survey: { select: { id: true, title: true } } },
        },
      },
      skip: p.skip,
      take: p.take,
      orderBy: { createdAt: p.sort },
    });
  }
  @Post("groups/:id/members") async member(
    @Current() a: Actor,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    allow(a, "SYSTEM_ADMIN");
    const { studentId } = parse(z.object({ studentId: z.string().uuid() }), b);
    await this.db.user.findFirstOrThrow({
      where: { id: studentId, role: { name: "STUDENT" } },
    });
    return this.db.groupMembership.upsert({
      where: { studentId_groupId: { studentId, groupId: uuid(id) } },
      create: { studentId, groupId: id },
      update: {},
    });
  }
}
