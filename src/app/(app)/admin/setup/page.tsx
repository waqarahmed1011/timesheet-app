import Link from "next/link";
import { requireRole } from "@/server/actor";
import { Card, PageTitle } from "@/components/ui";

const ITEMS = [
  ["companies", "Companies", "Your company and each subcontractor"],
  ["users", "Users", "Who can sign in, and their roles"],
  ["workers", "Workers", "Everyone who gets a timesheet, with or without a login"],
  ["projects", "Projects", "Project number, name, PM, and assigned foremen"],
  ["phases", "Work phases", "Supervision, Excavation, ... with cost codes"],
];

export default async function SetupIndex() {
  await requireRole("ADMIN");
  return (
    <div>
      <PageTitle sub="Nothing is ever deleted. Mark things inactive instead; every change is in the audit log.">Setup</PageTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {ITEMS.map(([slug, title, sub]) => (
          <Link key={slug} href={`/admin/setup/${slug}`}><Card className="hover:border-orange-400"><div className="font-semibold">{title}</div><div className="text-sm text-stone-600">{sub}</div></Card></Link>
        ))}
      </div>
    </div>
  );
}
