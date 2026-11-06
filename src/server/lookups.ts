import "server-only";
import { db } from "@/lib/db";

export async function projectAndPhaseOptions() {
  const [projects, phases] = await Promise.all([
    db.project.findMany({ orderBy: { number: "asc" } }),
    db.phase.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  return {
    projects: projects.filter((p) => p.active).map((p) => ({ id: p.id, label: `${p.number} ${p.name}` })),
    phases: phases.filter((p) => p.active).map((p) => ({ id: p.id, label: p.costCode ? `${p.name} (${p.costCode})` : p.name })),
    projectNames: Object.fromEntries(projects.map((p) => [p.id, `${p.number} ${p.name}`])),
    phaseNames: Object.fromEntries(phases.map((p) => [p.id, p.name])),
    projectsById: new Map(projects.map((p) => [p.id, p])),
  };
}
