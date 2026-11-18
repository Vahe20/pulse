"use client";
import { roleNames } from "@pulse/shared";
import Link from "next/link";
import { useState } from "react";

import { call, Entry, User } from "../lib/client";
import {
  Card,
  Empty,
  Load,
  nice,
  Pages,
  Select,
  useAction,
  useApi,
  useChoices,
  when,
} from "./ui";
import s from "./workspace.module.scss";
function EditRecord({
  row,
  view,
  groups,
  done,
}: {
  row: Entry;
  view: string;
  groups: Entry[];
  done: (s: string) => void;
}) {
  const a = useAction();
  const [role, setRole] = useState(row.role?.name ?? "STUDENT");
  return (
    <details>
      <summary>Edit {row.name}</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const data = Object.fromEntries([...f].filter(([, v]) => v !== ""));
          void a.run(async () => {
            await call(view + "/" + row.id, "PUT", {
              ...data,
              ...(view === "users" ? { role } : {}),
            });
            done("Record updated");
          });
        }}
      >
        <label>
          Updated name
          <input name="name" required defaultValue={row.name} />
        </label>
        {view === "users" && (
          <>
            <label>
              Account email
              <input
                required
                type="email"
                name="email"
                defaultValue={row.email}
              />
            </label>
            <Select
              label="Account role"
              value={role}
              items={roleNames.map((id) => ({ id, name: nice(id) }))}
              onChange={setRole}
            />
            {role === "STUDENT" && (
              <Select
                label="Add group membership"
                optional
                name="groupId"
                items={groups}
              />
            )}
            <label>
              New password (optional)
              <input
                type="password"
                name="password"
                minLength={12}
                autoComplete="new-password"
              />
            </label>
          </>
        )}
        <button disabled={a.busy}>Save changes</button>
        <p role="alert">{a.error}</p>
      </form>
    </details>
  );
}
export function Directory({
  view,
  user,
  done,
}: {
  view: string;
  user: User;
  done: (v: string) => void;
}) {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [role, setRole] = useState("STUDENT");
  const q = useApi<Entry[]>(
    view + "?page=" + page + "&search=" + encodeURIComponent(search),
    !["settings", "notifications"].includes(view),
  );
  const courses = useChoices("courses", view === "groups");
  const groups = useChoices("groups", view === "users");
  const settings = useApi<{ threshold: number }>(
    "settings",
    view === "settings",
  );
  const notes = useApi<
    {
      id: string;
      createdAt: string;
      sequence: number;
      status: string;
      invitation: { survey: { id: string; title: string } };
    }[]
  >("notifications?page=" + page, view === "notifications");
  const a = useAction();
  if (view === "settings")
    return (
      <>
        <h1>Settings</h1>
        <Card title="Score-drop detection">
          {settings.data ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const threshold = Number(
                  new FormData(e.currentTarget).get("threshold"),
                );
                void a.run(async () => {
                  await call("settings", "PUT", { threshold });
                  done("Threshold saved");
                });
              }}
            >
              <label>
                Alert threshold in rating points
                <input
                  type="number"
                  step=".01"
                  min=".01"
                  max="4"
                  name="threshold"
                  defaultValue={settings.data.threshold}
                  required
                />
              </label>
              <button>Save settings</button>
              <p role="alert">{a.error}</p>
            </form>
          ) : (
            <Load error={settings.error} />
          )}
        </Card>
      </>
    );
  if (view === "notifications")
    return (
      <>
        <h1>Notifications</h1>
        <Card title="Inbox">
          {!notes.data ? (
            <Load error={notes.error} />
          ) : notes.data.length ? (
            notes.data.map((n) => (
              <div className={s.row} key={n.id}>
                <Link href={"/surveys/" + n.invitation.survey.id}>
                  {n.invitation.survey.title}
                </Link>
                <p>
                  {n.sequence ? "Reminder" : "Invitation"} · {when(n.createdAt)}{" "}
                  · {nice(n.status)}
                </p>
              </div>
            ))
          ) : (
            <Empty>Your inbox is empty.</Empty>
          )}
          <Pages page={page} size={notes.data?.length ?? 0} set={setPage} />
        </Card>
      </>
    );
  const singular: Record<string, string> = {
    users: "user",
    groups: "group",
    courses: "course",
    lecturers: "lecturer",
  };
  return (
    <>
      <h1>{nice(view)}</h1>
      {user.role === "SYSTEM_ADMIN" && view !== "lecturers" && (
        <Card title={"Add " + singular[view]}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const b = Object.fromEntries(new FormData(form));
              void a.run(async () => {
                await call(view, "POST", {
                  ...b,
                  ...(view === "users" ? { role } : {}),
                });
                form.reset();
                done("Record created");
              });
            }}
          >
            <label>
              Name
              <input required name="name" maxLength={120} />
            </label>
            {view === "groups" && (
              <Select
                label="Course"
                name="courseId"
                items={courses.data ?? []}
              />
            )}
            {view === "users" && (
              <div className={s.grid}>
                <label>
                  Email
                  <input type="email" required name="email" />
                </label>
                <label>
                  Initial password
                  <input
                    required
                    type="password"
                    name="password"
                    minLength={12}
                    autoComplete="new-password"
                  />
                </label>
                <Select
                  label="Role"
                  value={role}
                  onChange={setRole}
                  items={roleNames.map((id) => ({ id, name: nice(id) }))}
                />
                {role === "STUDENT" && (
                  <Select
                    label="Student group"
                    name="groupId"
                    items={groups.data ?? []}
                  />
                )}
              </div>
            )}
            <p role="alert">{a.error}</p>
            <button className={s.primary} disabled={a.busy}>
              Add {singular[view]}
            </button>
          </form>
        </Card>
      )}
      <Card title={nice(view) + " directory"}>
        <label>
          Search
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        {!q.data ? (
          <Load error={q.error} />
        ) : q.data.length ? (
          q.data.map((row) => (
            <div className={s.row} key={row.id}>
              <strong>{row.name ?? row.user?.name}</strong>
              {user.role === "SYSTEM_ADMIN" && view !== "lecturers" && (
                <EditRecord
                  row={row}
                  view={view}
                  groups={groups.data ?? []}
                  done={done}
                />
              )}
              <p>
                {[row.email, row.role?.name, row.course?.name]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          ))
        ) : (
          <Empty>No matching records.</Empty>
        )}
        <Pages page={page} size={q.data?.length ?? 0} set={setPage} />
      </Card>
    </>
  );
}
