"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { gcApproveAction, pmApproveAction, rejectAction, reopenAction, voidAction, type ActionResult } from "@/app/actions";
import { SheetEditor, type Option } from "./SheetEditor";
import { btn, input } from "./ui";
import type { SheetDTO } from "@/server/timesheets";

type Props = {
  sheet: SheetDTO;
  projects: Option[];
  phases: Option[];
  pmProjects: string[]; // labels of projects this user can approve now
  canGc: boolean;
  canReject: boolean;
  canEdit: boolean;
  canReopen: boolean;
  canVoid: boolean;
  myName: string;
};

export function ReviewPanel(p: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [sig, setSig] = useState(p.myName);
  const [comment, setComment] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  const go = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) {
        setComment("");
        router.refresh();
      }
    });

  if (editing) {
    return (
      <div className="space-y-2">
        <h2 className="font-semibold">Edit hours</h2>
        <SheetEditor
          mode="approve"
          sheetId={p.sheet.id!}
          days={p.sheet.days}
          projects={p.projects}
          phases={p.phases}
          certificationText=""
          defaultSignName=""
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const anyApproval = p.pmProjects.length > 0 || p.canGc;
  if (!anyApproval && !p.canReject && !p.canEdit && !p.canReopen && !p.canVoid) return null;

  return (
    <div className="space-y-3 rounded-lg border border-stone-300 bg-white p-3">
      {anyApproval && (
        <>
          <h2 className="font-semibold">{p.canGc ? "GC approval" : `PM approval: ${p.pmProjects.join(", ")}`}</h2>
          <p className="text-xs text-stone-600">Typing your name below is your signature approving these hours.</p>
          <label className="block text-sm">
            Signature (type your full name)
            <input aria-label="Approval signature" className={input} value={sig} onChange={(e) => setSig(e.target.value)} />
          </label>
        </>
      )}
      <label className="block text-sm">
        Comment {p.canReject ? "(required to send back)" : "(optional)"}
        <textarea aria-label="Review comment" className={input} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      {result && <p role="status" className={`text-sm ${result.ok ? "text-green-700" : "text-red-700"}`}>{result.ok ? result.message : result.error}</p>}
      <div className="flex flex-wrap gap-2">
        {p.pmProjects.length > 0 && (
          <button className={btn.primary} disabled={pending || !sig.trim()} onClick={() => go(() => pmApproveAction(p.sheet.id!, sig, comment))}>
            Approve
          </button>
        )}
        {p.canGc && (
          <button className={btn.primary} disabled={pending || !sig.trim()} onClick={() => go(() => gcApproveAction(p.sheet.id!, sig, comment))}>
            Final approve and lock
          </button>
        )}
        {p.canEdit && <button className={btn.secondary} disabled={pending} onClick={() => setEditing(true)}>Edit hours</button>}
        {p.canReject && (
          <button className={btn.danger} disabled={pending || !comment.trim()} onClick={() => go(() => rejectAction(p.sheet.id!, comment))}>
            Send back
          </button>
        )}
        {p.canReopen && (
          <button className={btn.secondary} disabled={pending || !comment.trim()} onClick={() => go(() => reopenAction(p.sheet.id!, comment))}>
            Reopen (reason in comment)
          </button>
        )}
        {p.canVoid && (
          <button className={btn.secondary} disabled={pending || !comment.trim()} onClick={() => go(() => voidAction(p.sheet.id!, comment))}>
            Void (reason in comment)
          </button>
        )}
      </div>
    </div>
  );
}
