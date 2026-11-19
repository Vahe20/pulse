"use client";
import { issueStates } from "@pulse/shared";
import {
  ArrowUpRight,
  ClipboardList,
  Inbox,
  MessageCircle,
  SlidersHorizontal,
  Star,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { call, Report, Survey, User } from "../lib/client";
import {
  Badge,
  Card,
  Empty,
  Load,
  nice,
  Select,
  useAction,
  useApi,
  useChoices,
  when,
} from "./ui";
import s from "./workspace.module.scss";
export function Dashboard({ view, user }: { view: string; user: User }) {
  const init = useSearchParams().get("survey") ?? "";
  const [filters, set] = useState<Record<string, string>>({ surveyId: init });
  const staff = user.role !== "LECTURER";
  const groups = useChoices("groups", staff),
    courses = useChoices("courses", staff),
    lecturers = useChoices("lecturers", staff),
    surveys = useChoices<Survey>("surveys");
  const qs = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v),
  ).toString();
  const q = useApi<Report>("reports?" + qs);
  const a = useAction();
  const d = q.data;
  const metrics = d
    ? [
        {
          label: "Total surveys",
          value: d.surveys,
          detail: d.active + " active",
          icon: ClipboardList,
          tone: "violet",
        },
        {
          label: "Response rate",
          value:
            d.responseRate === null ? "—" : d.responseRate.toFixed(1) + "%",
          detail: d.responses + " of " + d.invited + " invitations",
          icon: MessageCircle,
          tone: "teal",
        },
        {
          label: "Satisfaction",
          value: d.score === null ? "—" : d.score.toFixed(2),
          detail: "Average rating out of 5",
          icon: Star,
          tone: "gold",
        },
        {
          label: "Open issues",
          value: d.openIssues,
          detail: d.resolved + " resolved · " + d.overdue + " overdue",
          icon: Inbox,
          tone: "rose",
        },
      ]
    : [];
  const field = (k: string, v: string) => set((f) => ({ ...f, [k]: v }));
  return (
    <>
      <div className={s.heading}>
        <div>
          <h1>{view === "overview" ? "Overview" : nice(view)}</h1>
          <p>
            {view === "overview"
              ? "Student feedback and improvement work across the academy."
              : view === "trends"
                ? "Compare matching rating criteria across consecutive surveys."
                : "Explore survey results and export the selected period."}
          </p>
        </div>
        {view === "reports" ? (
          <div className={s.actions}>
            <button
              onClick={() =>
                a.run(async () => {
                  const text = await call<string>("reports/csv?" + qs);
                  const url = URL.createObjectURL(
                    new Blob([text], { type: "text/csv" }),
                  );
                  const anchor = document.createElement("a");
                  anchor.href = url;
                  anchor.download = "pulse-report.csv";
                  anchor.click();
                  setTimeout(() => URL.revokeObjectURL(url), 2000);
                })
              }
            >
              Download CSV
            </button>
            <button onClick={() => window.print()}>Print / PDF</button>
          </div>
        ) : (
          <Link className={s.actionLink} href="/reports">
            View report <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        )}
      </div>
      <details className={s.reportFilters}>
        <summary>
          <SlidersHorizontal size={16} aria-hidden="true" />
          Report filters
        </summary>
        <div className={s.filters}>
          {staff && (
            <>
              <Select
                optional
                label="Course"
                value={filters.courseId ?? ""}
                items={courses.data ?? []}
                onChange={(v) => field("courseId", v)}
              />
              <Select
                optional
                label="Group"
                value={filters.groupId ?? ""}
                items={groups.data ?? []}
                onChange={(v) => field("groupId", v)}
              />
              <Select
                optional
                label="Lecturer"
                value={filters.lecturerId ?? ""}
                items={(lecturers.data ?? []).map((l) => ({
                  id: l.id,
                  name: l.user?.name ?? "",
                }))}
                onChange={(v) => field("lecturerId", v)}
              />
            </>
          )}
          <Select
            optional
            label="Survey"
            value={filters.surveyId ?? ""}
            items={(surveys.data ?? []).map((v) => ({
              id: v.id,
              name: v.title,
            }))}
            onChange={(v) => field("surveyId", v)}
          />
          <Select
            optional
            label="Issue status"
            value={filters.status ?? ""}
            items={issueStates.map((id) => ({ id, name: nice(id) }))}
            onChange={(v) => field("status", v)}
          />
          {["from", "to"].map((k) => (
            <label key={k}>
              {nice(k)}
              <input
                type="date"
                value={filters[k] ?? ""}
                onChange={(e) => field(k, e.target.value)}
              />
            </label>
          ))}
        </div>
      </details>
      {!d ? (
        <Load error={q.error} />
      ) : (
        <>
          <div className={s.metrics}>
            {metrics.map(({ label, value, detail, icon: Icon, tone }) => (
              <div className={s.metric} key={label} data-tone={tone}>
                <div className={s.metricLabel}>
                  <span className={s.metricIcon}>
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  {label}
                </div>
                <strong>{value}</strong>
                <small>{detail}</small>
              </div>
            ))}
          </div>
          <div className={s.chartGrid}>
            <Card title="Satisfaction over time">
              {d.timeline.length ? (
                <div className={s.chart}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={d.timeline}
                      margin={{ top: 10, right: 12, bottom: 2, left: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="scoreFill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="var(--accent)"
                            stopOpacity={0.25}
                          />
                          <stop
                            offset="100%"
                            stopColor="var(--accent)"
                            stopOpacity={0.02}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        stroke="var(--line)"
                        strokeDasharray="3 5"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="date"
                        tickFormatter={when}
                        minTickGap={35}
                        tickMargin={9}
                        tick={{ fill: "var(--muted)", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[1, 5]}
                        width={27}
                        ticks={[1, 2, 3, 4, 5]}
                        tick={{ fill: "var(--muted)", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--panel)",
                          borderColor: "var(--line)",
                          borderRadius: 10,
                        }}
                        labelFormatter={(v) => when(String(v))}
                      />
                      <Area
                        type="linear"
                        dataKey="score"
                        name="Average score"
                        stroke="var(--accent)"
                        fill="url(#scoreFill)"
                        baseValue={1}
                        dot={{ r: 3, fill: "var(--panel)", strokeWidth: 2 }}
                        isAnimationActive={false}
                        strokeWidth={3}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <Empty>
                  Scores appear when a survey reaches its minimum sample.
                </Empty>
              )}
            </Card>
            <Card title="Scores by category">
              {d.categories.length ? (
                d.categories.map((c) => (
                  <div className={s.category} key={c.category}>
                    <strong>{c.category}</strong>
                    <span>{c.score.toFixed(2)} / 5</span>
                    <progress aria-label={c.category} max={5} value={c.score} />
                  </div>
                ))
              ) : (
                <Empty>No eligible ratings.</Empty>
              )}
            </Card>
          </div>
          <Card title="Rating changes">
            {d.trends.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Survey</th>
                    <th>Criterion</th>
                    <th>Previous</th>
                    <th>Current</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {d.trends.map((t) => (
                    <tr key={t.surveyId + t.criterion}>
                      <td>{t.survey}</td>
                      <td>{nice(t.criterion)}</td>
                      <td>{t.previousScore.toFixed(2)}</td>
                      <td>{t.score.toFixed(2)}</td>
                      <td>
                        {t.absolute.toFixed(2)} ({t.percent.toFixed(1)}%)
                        {t.alert && <Badge value="Attention" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>
                No matching historical criteria with sufficient responses.
              </Empty>
            )}
          </Card>
          <div className={s.grid}>
            <Card title="Survey participation">
              {d.participation.map((v) => (
                <div className={s.row} key={v.id}>
                  <Link href={"/surveys/" + v.id}>{v.title}</Link>
                  <p>
                    {v.responses} of {v.invited} invitations
                  </p>
                </div>
              ))}
              {!d.participation.length && (
                <Empty>No surveys in this selection.</Empty>
              )}
            </Card>
            <Card title="Theme frequency">
              {d.themes.map((t, i) => (
                <div className={s.row} key={i}>
                  <strong>{t.title}</strong>
                  <p>
                    {t.mentions} mentions · {t.source}
                  </p>
                </div>
              ))}
              {!d.themes.length && (
                <Empty>Publish a reviewed analysis to see themes.</Empty>
              )}
            </Card>
          </div>
          {view !== "overview" && (
            <Card title="Group and lecturer comparisons">
              {d.comparisons.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>Cohort</th>
                      <th>Period</th>
                      <th>Criterion</th>
                      <th>Coverage</th>
                      <th>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.comparisons.map((t, i) => (
                      <tr key={i}>
                        <td>
                          {t.dimension} · {t.name}
                        </td>
                        <td>{t.period}</td>
                        <td>{nice(t.criterion)}</td>
                        <td>
                          {t.responses}/{t.invited}
                        </td>
                        <td>{t.score.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <Empty>
                  A comparison needs two eligible cohorts in the same month with
                  matching rating criteria.
                </Empty>
              )}
            </Card>
          )}
        </>
      )}
      <p role="alert">{a.error}</p>
    </>
  );
}
