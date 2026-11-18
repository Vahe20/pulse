"use client";
import { categories, issueStates, priorities } from "@pulse/shared";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Analysis, call, Issue, Survey, User } from "../lib/client";
import {
  Badge,
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
type Props = { user: User; done: (m: string) => void };
const named = (values: readonly string[]) =>
  values.map((id) => ({ id, name: nice(id) }));
function Create({ user, done }: Props) {
  const router = useRouter();
  const all = useChoices<Survey>("surveys");
  const staff = useChoices("users");
  const params = useSearchParams();
  const [source, setSource] = useState(params.get("survey") ?? "");
  const [theme, setTheme] = useState(params.get("theme") ?? "");
  const analysis = useApi<Analysis | null>(
    "surveys/" + source + "/analysis",
    !!source,
  );
  const picked = analysis.data?.themes.find((t) => t.id === theme);
  const a = useAction();
  return (
    <>
      <h1>Create issue</h1>
      <Card title="Issue details">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.currentTarget));
            void a.run(async () => {
              const r = await call<Issue>("issues", "POST", {
                ...data,
                surveyId: source,
                ...(theme ? { themeId: theme } : {}),
                dueAt: new Date(String(data.dueAt)).toISOString(),
              });
              done("Issue created");
              router.push("/issues/" + r.id);
            });
          }}
        >
          <Select
            label="Source survey"
            items={(all.data ?? [])
              .filter((i) => i.status !== "DRAFT")
              .map((i) => ({ id: i.id, name: i.title }))}
            value={source}
            onChange={(id) => {
              setSource(id);
              setTheme("");
            }}
          />
          <Select
            label="Published theme"
            optional
            items={
              analysis.data?.status === "PUBLISHED"
                ? analysis.data.themes.map((t) => ({ id: t.id, name: t.title }))
                : []
            }
            value={theme}
            onChange={setTheme}
          />
          <label>
            Title
            <input
              key={picked?.id ?? "manual"}
              name="title"
              defaultValue={picked?.title}
              required
              maxLength={180}
            />
          </label>
          <label>
            Description
            <textarea
              key={picked?.id ?? "manual"}
              name="description"
              defaultValue={picked?.suggestedAction}
            />
          </label>
          <div className={s.grid}>
            <Select
              label="Category"
              name="category"
              items={named(
                categories.filter((c) =>
                  user.role === "EDU_LEAD"
                    ? c === "Education"
                    : user.role === "ADMIN_LEAD"
                      ? c !== "Education"
                      : true,
                ),
              )}
            />
            <Select
              label="Priority"
              name="priority"
              items={named(priorities)}
            />
            <Select
              label="Assignee"
              name="assigneeId"
              items={(staff.data ?? []).filter(
                (u) => u.role?.name !== "STUDENT",
              )}
            />
            <label>
              Due date
              <input required name="dueAt" type="date" />
            </label>
          </div>
          <p role="alert">{a.error}</p>
          <button disabled={a.busy} className={s.primary}>
            Create issue
          </button>
        </form>
      </Card>
    </>
  );
}
function Detail({ id, user, done }: { id: string } & Props) {
  const q = useApi<Issue>("issues/" + id);
  const x = q.data;
  const staff = useChoices("users", user.role !== "LECTURER");
  const a = useAction();
  const comparison = useApi<
    { criterion: string; before: number; after: number; title: string }[]
  >("issues/" + id + "/followup");
  if (!x) return <Load error={q.error} />;
  return (
    <>
      <h1>{x.title}</h1>
      <div className={s.actions}>
        <Badge value={x.status} />
        <Badge value={x.priority} />
        <span>
          {x.category} · {x.assignee.name} · Due {when(x.dueAt)}
        </span>
      </div>
      <Card title="Source">
        <Link href={"/surveys/" + x.survey.id}>{x.survey.title}</Link>
        {x.theme && <p>{x.theme.title}</p>}
        <p>{x.description}</p>
      </Card>
      <Card title="Update issue">
        <form
          key={x.updatedAt}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const changes = Object.fromEntries(
              [...f.entries()].filter(([, v]) => v !== ""),
            );
            void a.run(async () => {
              await call("issues/" + id, "PUT", {
                ...changes,
                ...(changes.dueAt
                  ? { dueAt: new Date(String(changes.dueAt)).toISOString() }
                  : {}),
                updatedAt: x.updatedAt,
              });
              done("Issue updated");
            });
          }}
        >
          <div className={s.grid}>
            <label>
              Status
              <select name="status" defaultValue={x.status}>
                {issueStates.map((v) => (
                  <option value={v} key={v}>
                    {nice(v)}
                  </option>
                ))}
              </select>
            </label>
            {user.role !== "LECTURER" &&
              !(
                (user.role === "EDU_LEAD" && x.category !== "Education") ||
                (user.role === "ADMIN_LEAD" && x.category === "Education")
              ) && (
                <>
                  <label>
                    Priority
                    <select name="priority" defaultValue={x.priority}>
                      {priorities.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Assignee
                    <select name="assigneeId" defaultValue={x.assigneeId}>
                      {staff.data
                        ?.filter((u) => u.role?.name !== "STUDENT")
                        .map((o) => (
                          <option value={o.id} key={o.id}>
                            {o.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Due date
                    <input
                      name="dueAt"
                      type="date"
                      defaultValue={x.dueAt.slice(0, 10)}
                    />
                  </label>
                  <label>
                    Related issue ID
                    <input name="relatedId" placeholder="Optional UUID" />
                  </label>
                </>
              )}
          </div>
          <label>
            Comment
            <textarea name="comment" maxLength={2000} />
          </label>
          <p role="alert">{a.error}</p>
          <button className={s.primary} disabled={a.busy}>
            Save update
          </button>
        </form>
      </Card>
      <Card title="Follow-up results">
        {comparison.data?.length ? (
          comparison.data.map((r) => (
            <p key={r.criterion}>
              {r.title} · {r.criterion}: {r.before.toFixed(2)} →{" "}
              {r.after.toFixed(2)}
            </p>
          ))
        ) : (
          <Empty>
            {comparison.error?.message ??
              "Awaiting comparable results from a later survey."}
          </Empty>
        )}
      </Card>
      <Card title="Related issues">
        {[...x.outgoing.map((l) => l.to), ...x.incoming.map((l) => l.from)].map(
          (r) => (
            <Link key={r.id} href={"/issues/" + r.id}>
              {r.title}
            </Link>
          ),
        )}
      </Card>
      <Card title="Activity">
        {x.history.map((h) => (
          <div key={h.id} className={s.row}>
            <strong>
              {h.actor.name} · {h.event}
            </strong>
            {Object.entries(h.detail).map(([k, v]) => (
              <p key={k}>
                {k}: {v}
              </p>
            ))}
          </div>
        ))}
      </Card>
    </>
  );
}
export function IssuePage({ id, user, done }: { id?: string } & Props) {
  const [page, setPage] = useState(1),
    [status, setStatus] = useState(""),
    [sort, setSort] = useState("asc"),
    [late, setLate] = useState(false);
  const q = useApi<Issue[]>(
    "issues?page=" +
      page +
      "&sort=" +
      sort +
      (status ? "&status=" + status : "") +
      (late ? "&overdue=true" : ""),
    !id,
  );
  if (id === "new" && user.role !== "LECTURER")
    return <Create user={user} done={done} />;
  if (id) return <Detail id={id} user={user} done={done} />;
  return (
    <>
      <div className={s.heading}>
        <h1>Issue tracker</h1>
        {user.role !== "LECTURER" && (
          <Link className={s.actionLink} href="/issues/new">
            Create issue
          </Link>
        )}
      </div>
      <div className={s.filters}>
        <Select
          label="Status"
          items={named(issueStates)}
          value={status}
          optional
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <label>
          Sort by deadline
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="asc">Earliest first</option>
            <option value="desc">Latest first</option>
          </select>
        </label>
        <label>
          <span>
            <input
              type="checkbox"
              checked={late}
              onChange={(e) => setLate(e.target.checked)}
            />{" "}
            Overdue only
          </span>
        </label>
      </div>
      <Card title="Tracked issues">
        {!q.data ? (
          <Load error={q.error} />
        ) : q.data.length ? (
          <table>
            <thead>
              <tr>
                <th>Issue</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link href={"/issues/" + i.id}>{i.title}</Link>
                  </td>
                  <td>{i.assignee.name}</td>
                  <td>
                    <Badge value={i.status} />
                  </td>
                  <td>{nice(i.priority)}</td>
                  <td>{when(i.dueAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No issues match these filters.</Empty>
        )}
        <Pages page={page} size={q.data?.length ?? 0} set={setPage} />
      </Card>
    </>
  );
}
