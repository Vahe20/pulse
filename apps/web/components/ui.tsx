"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { call, Entry } from "../lib/client";
import s from "./workspace.module.scss";
export const nice = (v: string) =>
  v
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
export const when = (v: string) =>
  new Date(v).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
export function useApi<T>(path: string, enabled = true) {
  return useQuery({
    queryKey: ["api", path],
    queryFn: () => call<T>(path),
    enabled,
  });
}
export function useChoices<T extends { id: string } = Entry>(
  path: string,
  enabled = true,
) {
  return useQuery({
    queryKey: ["choices", path],
    enabled,
    queryFn: async () => {
      const rows: T[] = [];
      for (let page = 1; ; page++) {
        const batch = await call<T[]>(path + "?limit=100&page=" + page);
        rows.push(...batch);
        if (batch.length < 100) return rows;
      }
    },
  });
}
export function Badge({ value }: { value: string }) {
  return (
    <span className={s.badge} data-tone={value}>
      {nice(value)}
    </span>
  );
}
export function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={s.card}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function Load({ error }: { error?: Error | null }) {
  return error ? (
    <p role="alert">{error.message}</p>
  ) : (
    <div className={s.skeleton} role="status" aria-label="Loading" />
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <p className={s.empty}>{children}</p>;
}
export function Select({
  label,
  name,
  items,
  value,
  onChange,
  optional = false,
}: {
  label: string;
  name?: string;
  items: { id: string; name: string }[];
  value?: string;
  onChange?: (id: string) => void;
  optional?: boolean;
}) {
  return (
    <label>
      {label}
      <select
        name={name}
        value={value}
        required={!optional}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      >
        <option value="">{optional ? "All / none" : "Select…"}</option>
        {items.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Pages({
  page,
  size,
  set,
}: {
  page: number;
  size: number;
  set: (v: number) => void;
}) {
  return (
    <div className={s.actions}>
      <button disabled={page <= 1} onClick={() => set(page - 1)}>
        Previous
      </button>
      <small>Page {page}</small>
      <button disabled={size < 25} onClick={() => set(page + 1)}>
        Next
      </button>
    </div>
  );
}
export function useAction(done?: () => void) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(work: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
      done?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  return { run, busy, error };
}
export function Confirm({
  label,
  question,
  action,
}: {
  label: string;
  question: string;
  action: () => void;
}) {
  const [open, set] = useState(false);
  return (
    <>
      <button onClick={() => set(true)}>{label}</button>
      {open && (
        <dialog
          ref={(node) => {
            if (node && !node.open) node.showModal();
          }}
          onCancel={() => set(false)}
          aria-label={label}
        >
          <h2>{label}</h2>
          <p>{question}</p>
          <div className={s.actions}>
            <button onClick={() => set(false)}>Cancel</button>
            <button
              className={s.primary}
              onClick={() => {
                set(false);
                action();
              }}
            >
              Confirm
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
