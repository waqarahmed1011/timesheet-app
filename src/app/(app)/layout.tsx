import Link from "next/link";
import { signOut } from "@/auth";
import { requireActor } from "@/server/actor";
import { COMPANY_NAME } from "@/lib/config";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireActor();
  const is = (r: string) => me.roles.includes(r as never);
  const links: [string, string][] = [["/", "My week"]];
  if (is("FOREMAN") || is("ADMIN")) links.push(["/crew", "Crew"]);
  if (is("PM") || is("GC")) links.push(["/approvals", "Approvals"]);
  if (is("ADMIN") || is("GC")) links.push(["/admin", "Dashboard"], ["/admin/archive", "Archive"]);
  if (is("ADMIN")) links.push(["/admin/setup", "Setup"], ["/admin/audit", "Audit log"]);

  return (
    <>
      <header className="border-b border-stone-200 bg-stone-900 text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
          <Link href="/" className="font-bold">{COMPANY_NAME}</Link>
          <nav className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {links.map(([href, label]) => (
              <Link key={href} href={href} className="text-stone-200 hover:text-white">{label}</Link>
            ))}
          </nav>
          <form className="ml-auto" action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <span className="mr-2 text-xs text-stone-300">{me.name}</span>
            <button className="text-xs text-stone-300 underline hover:text-white">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-4">{children}</main>
    </>
  );
}
