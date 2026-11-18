"use client";
import {
  criteria,
  questionKinds,
  SurveyInput,
  surveySchema,
} from "@pulse/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Analysis, call, Survey, User } from "../lib/client";
import {
  Badge,
  Card,
  Confirm,
  Empty,
  Load,
  nice,
  Pages,
  useAction,
  useApi,
  useChoices,
  when,
} from "./ui";
import s from "./workspace.module.scss";
type Props = { user: User; done: (msg: string) => void };
const manage = (u: User) => ["SYSTEM_ADMIN", "EDU_LEAD"].includes(u.role);
const blankQuestion = (): SurveyInput["questions"][number] => ({
  kind: "RATING",
  prompt: criteria.practice,
  criterion: "practice",
  category: "Practice",
  options: [],
  required: true,
});
function Builder({ survey, done }: { survey?: Survey; done: Props["done"] }) {
  const router = useRouter();
  const groups = useChoices("groups"),
    lecturers = useChoices("lecturers");
  const [questions, set] = useState<SurveyInput["questions"]>(
    () =>
      survey?.questions.map((q) => ({
        ...q,
        criterion: q.criterion as keyof typeof criteria | null,
        options: q.options.map((o) => o.label),
      })) ?? [blankQuestion()],
  );
  const a = useAction();
  const update = (i: number, part: Partial<SurveyInput["questions"][number]>) =>
    set((prev) => prev.map((q, k) => (i === k ? { ...q, ...part } : q)));
  const move = (i: number, j: number) => {
    const next = [...questions];
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  };
  const local = (v: string | number) => {
    const d = new Date(v);
    return new Date(+d - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  return (
    <>
      <h1>{survey ? "Edit survey" : "Create survey"}</h1>
      <form
        className={s.form}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void a.run(async () => {
            const body = surveySchema.parse({
              title: f.get("title"),
              description: f.get("description"),
              groupIds: f.getAll("group"),
              lecturerId: f.get("lecturer"),
              startAt: new Date(String(f.get("start"))).toISOString(),
              endAt: new Date(String(f.get("end"))).toISOString(),
              minimum: Number(f.get("min")),
              reminderHours: Number(f.get("interval")),
              maxReminders: Number(f.get("max")),
              anonymous: f.has("anonymous"),
              questions,
            });
            const r = await call<{ id: string }>(
              "surveys" + (survey ? "/" + survey.id : ""),
              survey ? "PUT" : "POST",
              body,
            );
            done("Survey draft saved");
            router.push("/surveys/" + r.id);
          });
        }}
      >
        <Card title="Survey details">
          <label>
            Title
            <input
              name="title"
              defaultValue={survey?.title}
              required
              maxLength={180}
            />
          </label>
          <label>
            Description
            <textarea name="description" defaultValue={survey?.description} />
          </label>
          <fieldset>
            <legend>Target groups</legend>
            {groups.data?.map((g) => (
              <label key={g.id}>
                <span>
                  <input
                    name="group"
                    type="checkbox"
                    value={g.id}
                    defaultChecked={survey?.targets.some(
                      (t) => t.groupId === g.id,
                    )}
                  />{" "}
                  {g.name}
                </span>
              </label>
            ))}
            {groups.error && <Load error={groups.error} />}
          </fieldset>
          <label>
            Lecturer
            <select
              required
              name="lecturer"
              defaultValue={survey?.lecturerId ?? ""}
            >
              <option value="">Select lecturer</option>
              {lecturers.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.user?.name}
                </option>
              ))}
            </select>
          </label>
          <div className={s.grid}>
            <label>
              Start
              <input
                required
                type="datetime-local"
                name="start"
                defaultValue={local(survey?.startAt ?? Date.now())}
              />
            </label>
            <label>
              End
              <input
                required
                type="datetime-local"
                name="end"
                defaultValue={local(survey?.endAt ?? Date.now() + 604800000)}
              />
            </label>
          </div>
          <div className={s.filters}>
            {[
              ["Minimum responses", "min", survey?.minimum ?? 5, 3],
              [
                "Reminder interval (hours)",
                "interval",
                survey?.reminderHours ?? 48,
                1,
              ],
              ["Maximum reminders", "max", survey?.maxReminders ?? 2, 0],
            ].map(([label, key, v, min]) => (
              <label key={key}>
                {label}
                <input
                  required
                  type="number"
                  name={String(key)}
                  min={min}
                  defaultValue={v}
                />
              </label>
            ))}
          </div>
          <label>
            <span>
              <input
                name="anonymous"
                type="checkbox"
                defaultChecked={survey?.anonymous ?? true}
              />{" "}
              Anonymous survey
            </span>
          </label>
        </Card>
        <Card title="Questions">
          {questions.map((q, i) => (
            <fieldset key={i}>
              <legend>Question {i + 1}</legend>
              <div className={s.filters}>
                <label>
                  Type
                  <select
                    value={q.kind}
                    onChange={(e) =>
                      update(i, {
                        kind: e.target.value as typeof q.kind,
                        criterion: null,
                        options: [],
                      })
                    }
                  >
                    {questionKinds.map((k) => (
                      <option key={k} value={k}>
                        {nice(k)}
                      </option>
                    ))}
                  </select>
                </label>
                {q.kind === "RATING" && (
                  <label>
                    Comparison criterion
                    <select
                      value={q.criterion ?? ""}
                      onChange={(e) => {
                        const key = e.target.value as keyof typeof criteria;
                        update(
                          i,
                          key
                            ? {
                                criterion: key,
                                prompt: criteria[key],
                                category: nice(key),
                              }
                            : { criterion: null },
                        );
                      }}
                    >
                      <option value="">Custom question</option>
                      {Object.entries(criteria).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <label>
                Question text
                <input
                  required
                  value={q.prompt}
                  readOnly={!!q.criterion}
                  onChange={(e) => update(i, { prompt: e.target.value })}
                />
              </label>
              <label>
                Category
                <input
                  required
                  value={q.category}
                  onChange={(e) => update(i, { category: e.target.value })}
                />
              </label>
              {["SINGLE", "MULTIPLE"].includes(q.kind) && (
                <label>
                  Choices (one per line)
                  <textarea
                    required
                    value={q.options.join("\n")}
                    onChange={(e) =>
                      update(i, { options: e.target.value.split("\n") })
                    }
                  />
                </label>
              )}
              <label>
                <span>
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => update(i, { required: e.target.checked })}
                  />{" "}
                  Required
                </span>
              </label>
              <div className={s.actions}>
                <button
                  type="button"
                  disabled={!i}
                  onClick={() => move(i, i - 1)}
                >
                  Move up
                </button>
                <button
                  type="button"
                  disabled={i === questions.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  Move down
                </button>
                <button
                  type="button"
                  disabled={questions.length === 1}
                  onClick={() => set(questions.filter((_, k) => k !== i))}
                >
                  Remove
                </button>
              </div>
            </fieldset>
          ))}
          <button
            type="button"
            onClick={() =>
              set([
                ...questions,
                {
                  ...blankQuestion(),
                  kind: "TEXT",
                  criterion: null,
                  prompt: "",
                  category: "Feedback",
                },
              ])
            }
          >
            Add question
          </button>
        </Card>
        <p role="alert">{a.error}</p>
        <button className={s.primary} disabled={a.busy}>
          Save draft
        </button>
      </form>
    </>
  );
}
function StudentForm({
  survey,
  done,
}: {
  survey: Survey;
  done: Props["done"];
}) {
  const a = useAction();
  if (survey.invitations?.[0]?.completed)
    return (
      <Card title="Feedback submitted">
        <p>Thank you for sharing your experience.</p>
      </Card>
    );
  if (survey.status !== "ACTIVE") return <Empty>This survey is closed.</Empty>;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const answers: Record<string, unknown> = {};
        for (const q of survey.questions) {
          const value = f.get(q.id);
          if (!value) continue;
          answers[q.id] =
            q.kind === "MULTIPLE"
              ? f.getAll(q.id)
              : q.kind === "RATING"
                ? Number(value)
                : value;
        }
        void a.run(async () => {
          await call("surveys/" + survey.id + "/responses", "POST", {
            answers,
          });
          done("Feedback submitted");
        });
      }}
    >
      {survey.questions.map((q) => (
        <fieldset key={q.id}>
          <legend>
            {q.prompt}
            {q.required ? " *" : ""}
          </legend>
          {q.kind === "TEXT" ? (
            <textarea
              aria-label={q.prompt}
              name={q.id}
              required={q.required}
              maxLength={4000}
            />
          ) : (
            <div className={s.rating}>
              {(q.kind === "RATING"
                ? [1, 2, 3, 4, 5].map((n) => ({
                    id: String(n),
                    label: String(n),
                  }))
                : q.options
              ).map((o) => (
                <label key={o.id}>
                  <input
                    type={q.kind === "MULTIPLE" ? "checkbox" : "radio"}
                    required={q.required && q.kind !== "MULTIPLE"}
                    name={q.id}
                    value={o.id}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      ))}
      <p role="alert">{a.error}</p>
      <button className={s.primary} disabled={a.busy}>
        Submit feedback
      </button>
    </form>
  );
}
function Review({ survey, user, done }: { survey: Survey } & Props) {
  const q = useApi<Analysis | null>("surveys/" + survey.id + "/analysis");
  const a = useAction();
  const data = q.data;
  const editable = manage(user) && data?.status === "REVIEW";
  return (
    <Card title="Feedback analysis">
      {q.isLoading ? (
        <Load />
      ) : q.error ? (
        <Load error={q.error} />
      ) : !data ? (
        <Empty>No analysis available.</Empty>
      ) : (
        <>
          <div className={s.tags}>
            <Badge value={data.source} />
            <Badge value={data.status} />
          </div>
          {["PROCESSING", "QUEUED"].includes(data.status) ? (
            <button onClick={() => q.refetch()}>
              Refresh processing status
            </button>
          ) : (
            <form
              key={data.id + data.status}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void a.run(async () => {
                  await call("analyses/" + data.id, "PUT", {
                    publish:
                      (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
                        "value",
                      ) === "publish",
                    summary: f.get("summary"),
                    themes: data.themes.map((t) => ({
                      id: t.id,
                      title: f.get(t.id),
                      sentiment: f.get(t.id + "-sentiment"),
                    })),
                  });
                  done("Analysis saved");
                });
              }}
            >
              {editable ? (
                <label>
                  Summary
                  <textarea
                    name="summary"
                    defaultValue={data.summary ?? ""}
                    required
                  />
                </label>
              ) : (
                <p>{data.summary}</p>
              )}
              {data.themes.map((t) => (
                <div className={s.row} key={t.id}>
                  {editable ? (
                    <>
                      <label>
                        Theme title
                        <input required name={t.id} defaultValue={t.title} />
                      </label>
                      <label>
                        Sentiment
                        <select
                          name={t.id + "-sentiment"}
                          defaultValue={t.sentiment}
                        >
                          {["POSITIVE", "NEUTRAL", "NEGATIVE"].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </label>
                    </>
                  ) : (
                    <h3>{t.title}</h3>
                  )}
                  <p>{t.description}</p>
                  <Badge value={t.sentiment} /> · {t.mentions} mentions
                  {t.confidence !== null && t.confidence < 0.7
                    ? " · Low model confidence"
                    : ""}
                  <p>{t.suggestedAction}</p>
                  {data.status === "PUBLISHED" && user.role !== "LECTURER" && (
                    <Link
                      href={
                        "/issues/new?survey=" + survey.id + "&theme=" + t.id
                      }
                    >
                      Create issue from theme
                    </Link>
                  )}
                </div>
              ))}
              {editable && (
                <div className={s.actions}>
                  <button value="save">Save review</button>
                  <button
                    className={s.primary}
                    value="publish"
                    disabled={a.busy}
                  >
                    Publish analysis
                  </button>
                </div>
              )}
            </form>
          )}
        </>
      )}
      {manage(user) &&
        !["QUEUED", "PROCESSING"].includes(data?.status ?? "") && (
          <button
            title={
              survey.anonymous
                ? "Anonymous results are available after closing and reaching the minimum sample."
                : undefined
            }
            disabled={
              a.busy ||
              (survey.anonymous &&
                !["CLOSED", "ARCHIVED"].includes(survey.status)) ||
              (survey._count?.responses ?? 0) < survey.minimum
            }
            onClick={() =>
              a.run(async () => {
                await call("surveys/" + survey.id + "/analysis", "POST", {});
                done("Analysis queued");
              })
            }
          >
            Run analysis
          </button>
        )}
      <p role="alert">{a.error}</p>
    </Card>
  );
}
function Detail({
  id,
  view,
  user,
  done,
}: { id: string; view: string } & Props) {
  const q = useApi<Survey>("surveys/" + id);
  const [edit, setEdit] = useState(false);
  const a = useAction();
  const survey = q.data;
  if (!survey) return <Load error={q.error} />;
  if (edit && manage(user) && survey.status === "DRAFT")
    return (
      <Builder
        survey={survey}
        done={(m) => {
          setEdit(false);
          done(m);
        }}
      />
    );
  return (
    <>
      <div className={s.heading}>
        <div>
          <h1>{survey.title}</h1>
          <p>{survey.description}</p>
        </div>
        <Badge value={survey.status} />
      </div>
      <div className={s.actions}>
        <small>
          {survey.anonymous ? "Anonymous" : "Identified"} ·{" "}
          {when(survey.startAt)} – {when(survey.endAt)}
        </small>
      </div>
      {user.role === "STUDENT" ? (
        <StudentForm survey={survey} done={done} />
      ) : (
        <>
          {manage(user) && (
            <div className={s.actions}>
              {survey.status === "DRAFT" && (
                <>
                  <button onClick={() => setEdit(true)}>Edit draft</button>
                  <Confirm
                    label="Publish survey"
                    question="Schedule invitations for the selected groups?"
                    action={() =>
                      a.run(async () => {
                        await call("surveys/" + id + "/publish", "POST", {});
                        done("Survey scheduled");
                      })
                    }
                  />
                </>
              )}
              {["DRAFT", "CLOSED"].includes(survey.status) && (
                <Confirm
                  label="Archive"
                  question="Archive this survey?"
                  action={() =>
                    a.run(async () => {
                      await call("surveys/" + id + "/archive", "POST", {});
                      done("Survey archived");
                    })
                  }
                />
              )}
            </div>
          )}
          {view !== "analysis" && (
            <Card title="Participation">
              <p>
                {survey._count?.responses} of {survey._count?.invitations}{" "}
                invited students responded. Minimum sample size is{" "}
                {survey.minimum}.
              </p>
              <ol>
                {survey.questions.map((q) => (
                  <li key={q.id}>
                    {q.prompt} · {nice(q.kind)}
                  </li>
                ))}
              </ol>
              <Link href={"/reports?survey=" + id}>Survey report</Link>
            </Card>
          )}
          <Review survey={survey} user={user} done={done} />
        </>
      )}
      <p role="alert">{a.error}</p>
    </>
  );
}
export function SurveyPage({
  id,
  view,
  user,
  done,
}: { id?: string; view: string } & Props) {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState("");
  const list = useApi<Survey[]>(
    "surveys?page=" + page + "&search=" + encodeURIComponent(search),
    !id,
  );
  if (id === "new" && manage(user)) return <Builder done={done} />;
  if (id) return <Detail id={id} view={view} user={user} done={done} />;
  return (
    <>
      <div className={s.heading}>
        <div>
          <h1>
            {view === "analysis"
              ? "AI analysis"
              : user.role === "STUDENT"
                ? "My surveys"
                : "Surveys"}
          </h1>
          <p>
            {view === "analysis"
              ? "Review feedback themes and publish findings."
              : "Manage surveys and track participation."}
          </p>
        </div>
        {view === "surveys" && manage(user) && (
          <Link className={s.actionLink} href="/surveys/new">
            Create survey
          </Link>
        )}
      </div>
      <label>
        Search surveys
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </label>
      <Card title="Survey list">
        {!list.data ? (
          <Load error={list.error} />
        ) : list.data.length ? (
          <table>
            <thead>
              <tr>
                <th>Survey</th>
                <th>Status</th>
                <th>Closes</th>
                <th>Participation</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((v) => (
                <tr key={v.id}>
                  <td>
                    <Link href={"/" + view + "/" + v.id}>{v.title}</Link>
                  </td>
                  <td>
                    <Badge value={v.status} />
                  </td>
                  <td>{when(v.endAt)}</td>
                  <td>
                    {v._count
                      ? v._count.responses + " / " + v._count.invitations
                      : v.invitations?.[0]?.completed
                        ? "Submitted"
                        : "Pending"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No surveys match this view.</Empty>
        )}
        <Pages page={page} set={setPage} size={list.data?.length ?? 0} />
      </Card>
    </>
  );
}
