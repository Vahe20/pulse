"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema } from "@pulse/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  CheckSquare,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings2,
  Sun,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { login, logout, session, User } from "../lib/client";
import { Dashboard } from "./dashboard";
import { Directory } from "./directory";
import { IssuePage } from "./issue";
import { SurveyPage } from "./survey";
import { Load, useAction } from "./ui";
import s from "./workspace.module.scss";
const links = [
  ["overview", "Overview", LayoutDashboard],
  ["surveys", "Surveys", ClipboardList],
  ["analysis", "AI analysis", Activity],
  ["trends", "Trends", BarChart3],
  ["issues", "Issues", CheckSquare],
  ["reports", "Reports", BookOpen],
  ["groups", "Groups", Users],
  ["courses", "Courses", BookOpen],
  ["lecturers", "Lecturers", GraduationCap],
  ["users", "Users", Users],
  ["settings", "Settings", Settings2],
  ["notifications", "Notifications", Bell],
] as const;
function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(loginSchema) });
  const a = useAction();
  return (
    <main className={s.login}>
      <div className={s.loginArt}>
        <span className={s.logo}>
          <Activity /> Pulse
        </span>
        <div>
          <h1>Student feedback</h1>
          <p>Surveys, insights, and improvements for your academy.</p>
        </div>
      </div>
      <form
        onSubmit={handleSubmit((v) =>
          a.run(async () => onLogin(await login(v))),
        )}
      >
        <h2>Welcome back</h2>
        <p>Sign in to your academy workspace.</p>
        <label>
          Email
          <input type="email" autoComplete="username" {...register("email")} />
        </label>
        {errors.email && <small>{errors.email.message}</small>}
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            {...register("password")}
          />
        </label>
        <button className={s.primary} disabled={a.busy}>
          Sign in
        </button>
        <p role="alert">{a.error}</p>
      </form>
    </main>
  );
}
export function Workspace({ path }: { path: string[] }) {
  const router = useRouter();
  const cache = useQueryClient();
  const auth = useQuery({
    queryKey: ["session"],
    queryFn: session,
    staleTime: Infinity,
  });
  const [dark, setDark] = useState(false),
    [mobile, setMobile] = useState(false),
    [toast, setToast] = useState("");
  const a = useAction();
  useEffect(() => {
    setDark(localStorage.getItem("pulse-theme") === "dark");
    const out = () => {
      cache.clear();
      cache.setQueryData(["session"], null);
      router.replace("/login");
    };
    window.addEventListener("pulse-signout", out);
    return () => window.removeEventListener("pulse-signout", out);
  }, [router, cache]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  if (auth.isLoading) return <Load />;
  if (!auth.data)
    return (
      <Login
        onLogin={(u) => {
          cache.clear();
          cache.setQueryData(["session"], u);
          router.replace(u.role === "STUDENT" ? "/surveys" : "/overview");
        }}
      />
    );
  const user = auth.data;
  const visible = links.filter(([p]) =>
    user.role === "STUDENT"
      ? ["surveys", "notifications"].includes(p)
      : ["settings", "users"].includes(p)
        ? user.role === "SYSTEM_ADMIN"
        : ["groups", "courses", "lecturers"].includes(p)
          ? user.role !== "LECTURER"
          : true,
  );
  const view = path[0] && path[0] !== "login" ? path[0] : visible[0][0];
  const active = visible.find(([p]) => p === view);
  const id = path[1];
  const done = (msg: string) => {
    setToast(msg);
    void cache.invalidateQueries({
      predicate: (q) => q.queryKey[0] !== "session",
    });
  };
  return (
    <div className={s.layout}>
      <aside className={mobile ? s.mobileOpen : ""}>
        <span className={s.logo}>
          <Activity /> Pulse
        </span>
        <div className={s.academy}>
          <GraduationCap />
          <span>Academy workspace</span>
        </div>
        <nav>
          {visible.map(([p, title, Icon]) => (
            <Link
              key={p}
              href={"/" + p}
              aria-current={p === view ? "page" : undefined}
              onClick={() => setMobile(false)}
            >
              <Icon size={17} />
              {title}
            </Link>
          ))}
        </nav>
        <footer>
          <strong>{user.name}</strong>
          <small>{user.role.replaceAll("_", " ")}</small>
          <button
            aria-label="Sign out"
            onClick={() =>
              a.run(async () => {
                await logout();
                window.dispatchEvent(new Event("pulse-signout"));
              })
            }
          >
            <LogOut size={17} />
          </button>
        </footer>
      </aside>
      <div className={s.main}>
        <header>
          <button
            className={s.menu}
            aria-label="Toggle navigation"
            onClick={() => setMobile(!mobile)}
          >
            <Menu />
          </button>
          <span>
            Workspace / <b>{active?.[1] || "Unavailable"}</b>
          </span>
          <button
            aria-label="Toggle theme"
            onClick={() => {
              localStorage.setItem("pulse-theme", dark ? "light" : "dark");
              setDark(!dark);
            }}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </header>
        <main key={path.join("/")}>
          {!active ? (
            <h1>Page unavailable</h1>
          ) : ["overview", "trends", "reports"].includes(view) ? (
            <Dashboard view={view} user={user} />
          ) : view === "surveys" || view === "analysis" ? (
            <SurveyPage id={id} view={view} user={user} done={done} />
          ) : view === "issues" ? (
            <IssuePage id={id} user={user} done={done} />
          ) : (
            <Directory view={view} user={user} done={done} />
          )}
        </main>
      </div>
      {(toast || a.error) && (
        <div role="status" className={s.toast}>
          {toast || a.error}
        </div>
      )}
    </div>
  );
}
