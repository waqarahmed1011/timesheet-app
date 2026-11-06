"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { computeDay, computeSheet, formatHours, formatTime12, hoursToMinutes, type DayInput } from "@/lib/timesheet/hours";
import { dayName, shortDate } from "@/lib/week";
import { approverEditAction, saveDraftAction, submitAction, type ActionResult } from "@/app/actions";
import { SignaturePad } from "./SignaturePad";
import { btn, input } from "./ui";

export type Option = { id: string; label: string };
type Row = { projectId: string; phaseId: string; hours: string };
type DayState = { date: string; start: string; end: string; noLunch: boolean; rows: Row[] };
type InitialDay = { date: string; startMinute: number | null; endMinute: number | null; noLunch: boolean; entries: { projectId: string; phaseId: string; minutes: number }[] };

type Props = {
  days: InitialDay[];
  projects: Option[];
  phases: Option[];
  certificationText: string;
  defaultSignName: string;
} & ({ mode: "submit"; workerId: string; weekStart: string } | { mode: "approve"; sheetId: string; onCancel?: () => void });

const TIME_OPTIONS = Array.from({ length: 97 }, (_, i) => i * 15);

function toState(days: InitialDay[]): DayState[] {
  return days.map((d) => ({
    date: d.date,
    start: d.startMinute == null ? "" : String(d.startMinute),
    end: d.endMinute == null ? "" : String(d.endMinute),
    noLunch: d.noLunch,
    rows: d.entries.map((e) => ({ projectId: e.projectId, phaseId: e.phaseId, hours: formatHours(e.minutes) })),
  }));
}

function toInput(days: DayState[]): DayInput[] {
  return days.map((d) => ({
    date: d.date,
    startMinute: d.start === "" ? null : Number(d.start),
    endMinute: d.end === "" ? null : Number(d.end),
    noLunch: d.noLunch,
    entries: d.rows.map((r) => ({ projectId: r.projectId, phaseId: r.phaseId, minutes: hoursToMinutes(r.hours) ?? -1 })),
  }));
}

export function SheetEditor(props: Props) {
  const router = useRouter();
  const [days, setDays] = useState<DayState[]>(() => toState(props.days));
  const [result, setResult] = useState<ActionResult | null>(null);
  const [signing, setSigning] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [signName, setSignName] = useState(props.defaultSignName);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const onSig = useCallback((s: string | null) => setSignature(s), []);

  const inputs = useMemo(() => toInput(days), [days]);
  const totals = useMemo(() => computeSheet(inputs), [inputs]);

  const lastProject = () => {
    for (let i = days.length - 1; i >= 0; i--) {
      const r = days[i].rows.at(-1);
      if (r?.projectId) return r;
    }
    return { projectId: props.projects[0]?.id ?? "", phaseId: "" };
  };

  function updateDay(i: number, patch: Partial<DayState>) {
    setDays((prev) => {
      const next = [...prev];
      const d = { ...next[i], ...patch };
      // With a single row, keep its hours in step with the day's paid hours.
      if (("start" in patch || "end" in patch || "noLunch" in patch) && d.rows.length === 1) {
        const c = computeDay(toInput([d])[0]);
        if (c.paidMinutes > 0) d.rows = [{ ...d.rows[0], hours: formatHours(c.paidMinutes) }];
      }
      if (("start" in patch || "end" in patch) && d.rows.length === 0 && d.start && d.end) {
        const c = computeDay(toInput([d])[0]);
        const last = lastProject();
        if (c.paidMinutes > 0) d.rows = [{ projectId: last.projectId, phaseId: last.phaseId, hours: formatHours(c.paidMinutes) }];
      }
      next[i] = d;
      return next;
    });
  }

  function updateRow(i: number, j: number, patch: Partial<Row>) {
    setDays((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], rows: next[i].rows.map((r, k) => (k === j ? { ...r, ...patch } : r)) };
      return next;
    });
  }

  function addRow(i: number) {
    const last = days[i].rows.at(-1) ?? lastProject();
    setDays((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], rows: [...next[i].rows, { projectId: last.projectId, phaseId: "", hours: "" }] };
      return next;
    });
  }

  function removeRow(i: number, j: number) {
    setDays((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], rows: next[i].rows.filter((_, k) => k !== j) };
      return next;
    });
  }

  function copyPrevious(i: number) {
    setDays((prev) => {
      const next = [...prev];
      const src = [...prev.slice(0, i)].reverse().find((d) => d.start || d.rows.length);
      if (!src) return prev;
      next[i] = { ...src, date: next[i].date, rows: src.rows.map((r) => ({ ...r })) };
      return next;
    });
  }

  function clearDay(i: number) {
    setDays((prev) => {
      const next = [...prev];
      next[i] = { date: next[i].date, start: "", end: "", noLunch: false, rows: [] };
      return next;
    });
  }

  function done(r: ActionResult) {
    setResult(r);
    if (r.ok) {
      setSigning(false);
      router.refresh();
      if (props.mode === "approve") props.onCancel?.();
    }
  }

  const save = () =>
    start(async () => {
      if (props.mode !== "submit") return;
      done(await saveDraftAction(props.workerId, props.weekStart, inputs));
    });

  const submit = () =>
    start(async () => {
      if (props.mode !== "submit") return;
      if (!signature) return setResult({ ok: false, error: "Please sign in the box" });
      done(await submitAction(props.workerId, props.weekStart, inputs, signature, signName));
    });

  const saveEdit = () =>
    start(async () => {
      if (props.mode !== "approve") return;
      done(await approverEditAction(props.sheetId, inputs, reason));
    });

  return (
    <div className="space-y-3">
      {days.map((d, i) => {
        const c = totals.days[i];
        const span = d.start && d.end ? Number(d.end) - Number(d.start) : 0;
        return (
          <div key={d.date} className="rounded-lg border border-stone-200 bg-white p-3" data-testid={`day-${d.date}`}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">
                {dayName(d.date)} <span className="font-normal text-stone-500">{shortDate(d.date)}</span>
              </div>
              <div className="flex gap-2">
                {i > 0 && <button type="button" className={btn.small} onClick={() => copyPrevious(i)}>Copy previous day</button>}
                {(d.start || d.rows.length > 0) && <button type="button" className={btn.small} onClick={() => clearDay(i)}>Clear</button>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:items-end">
              <label className="text-xs text-stone-600">
                Start
                <select aria-label={`Start ${d.date}`} className={input} value={d.start} onChange={(e) => updateDay(i, { start: e.target.value })}>
                  <option value="">--</option>
                  {TIME_OPTIONS.slice(0, 96).map((m) => <option key={m} value={m}>{formatTime12(m)}</option>)}
                </select>
              </label>
              <label className="text-xs text-stone-600">
                End
                <select aria-label={`End ${d.date}`} className={input} value={d.end} onChange={(e) => updateDay(i, { end: e.target.value })}>
                  <option value="">--</option>
                  {TIME_OPTIONS.slice(1).map((m) => <option key={m} value={m}>{m === 1440 ? "12:00 AM (midnight)" : formatTime12(m)}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" aria-label={`No lunch ${d.date}`} checked={d.noLunch} onChange={(e) => updateDay(i, { noLunch: e.target.checked })} />
                No lunch taken
              </label>
              <div className="text-sm">
                Paid: <strong>{formatHours(c.paidMinutes)}h</strong>
                {c.lunchMinutes > 0 && <span className="text-stone-500"> (30 min lunch taken off)</span>}
                {span > 0 && span < 450 && d.noLunch && <span className="text-stone-500"> (no lunch deduction under 7.5h)</span>}
              </div>
            </div>

            {d.rows.length > 0 && (
              <div className="mt-3 space-y-2">
                {d.rows.map((r, j) => (
                  <div key={j} className="grid grid-cols-[1fr_5rem_auto] gap-2 border-t border-stone-100 pt-2 sm:grid-cols-[1fr_1fr_5rem_auto] sm:border-0 sm:pt-0">
                    <select aria-label={`Project ${d.date} row ${j + 1}`} className={`${input} col-span-3 sm:col-span-1`} value={r.projectId} onChange={(e) => updateRow(i, j, { projectId: e.target.value })}>
                      <option value="">Project...</option>
                      {props.projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                    <select aria-label={`Phase ${d.date} row ${j + 1}`} className={input} value={r.phaseId} onChange={(e) => updateRow(i, j, { phaseId: e.target.value })}>
                      <option value="">Phase...</option>
                      {props.phases.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                    <input
                      aria-label={`Hours ${d.date} row ${j + 1}`}
                      className={input}
                      inputMode="decimal"
                      value={r.hours}
                      placeholder="hrs"
                      onChange={(e) => updateRow(i, j, { hours: e.target.value })}
                    />
                    <button type="button" aria-label="Remove row" className="px-1 text-stone-400 hover:text-red-600" onClick={() => removeRow(i, j)}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <button type="button" className="mt-2 text-sm font-medium text-orange-700 underline" onClick={() => addRow(i)}>
              + Add project / phase
            </button>
            {c.errors.length > 0 && (d.start || d.end || d.rows.length > 0) && (
              <ul className="mt-2 text-sm text-red-700">{[...new Set(c.errors)].map((e) => <li key={e}>{e}</li>)}</ul>
            )}
          </div>
        );
      })}

      <div className="sticky bottom-0 rounded-lg border border-stone-300 bg-white p-3 shadow-md">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <span>Week total: <strong data-testid="week-total">{formatHours(totals.totalMinutes)}h</strong></span>
          {totals.over40 && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Over 40: {formatHours(totals.overtimeMinutes)}h OT</span>}
        </div>

        {result && (
          <p role="status" className={`mb-2 text-sm ${result.ok ? "text-green-700" : "text-red-700"}`}>{result.ok ? result.message : result.error}</p>
        )}

        {props.mode === "submit" && !signing && (
          <div className="flex flex-wrap gap-2">
            <button className={btn.secondary} disabled={pending} onClick={save}>Save draft</button>
            <button
              className={btn.primary}
              disabled={pending}
              onClick={() => (totals.valid ? (setResult(null), setSigning(true)) : setResult({ ok: false, error: "Fix the errors above before submitting" }))}
            >
              Review and sign
            </button>
          </div>
        )}

        {props.mode === "submit" && signing && (
          <div className="space-y-2">
            <p className="text-sm">{props.certificationText}</p>
            <label className="block text-sm">
              Your name
              <input className={input} value={signName} onChange={(e) => setSignName(e.target.value)} aria-label="Signed name" />
            </label>
            <SignaturePad onChange={onSig} />
            <div className="flex gap-2">
              <button className={btn.secondary} disabled={pending} onClick={() => setSigning(false)}>Back</button>
              <button className={btn.primary} disabled={pending || !signature} onClick={submit}>Sign and submit</button>
            </div>
          </div>
        )}

        {props.mode === "approve" && (
          <div className="space-y-2">
            <label className="block text-sm">
              Reason for change (required, the worker will see this)
              <textarea aria-label="Edit reason" className={input} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <div className="flex gap-2">
              {props.onCancel && <button className={btn.secondary} onClick={props.onCancel}>Cancel</button>}
              <button className={btn.primary} disabled={pending || !reason.trim()} onClick={saveEdit}>Save changes</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
