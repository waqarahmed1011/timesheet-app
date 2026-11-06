import { redirect } from "next/navigation";
import { auth, enabledProviders, signIn } from "@/auth";
import { COMPANY_NAME } from "@/lib/config";
import { btn, input } from "@/components/ui";
import { db } from "@/lib/db";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ check?: string; error?: string }> }) {
  const session = await auth();
  if (session?.user?.id) redirect("/");
  const sp = await searchParams;
  const devUsers = enabledProviders.dev ? await db.user.findMany({ where: { active: true }, orderBy: { email: "asc" } }) : [];

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-2xl font-bold">{COMPANY_NAME}</h1>
      <p className="mb-6 text-stone-600">Weekly timesheets</p>

      {sp.check === "email" && <p className="mb-4 rounded bg-green-50 p-3 text-sm text-green-800">Check your email for a sign-in link.</p>}
      {sp.error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-800">
          Couldn&apos;t sign you in. Your email has to be added by the office first. Ask your foreman or the office.
        </p>
      )}

      <div className="space-y-4">
        {enabledProviders.google && (
          <form action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }}>
            <button className={`${btn.primary} w-full py-3`}>Sign in with Google</button>
          </form>
        )}
        {enabledProviders.email && (
          <form
            className="space-y-2"
            action={async (fd: FormData) => { "use server"; await signIn("resend", { email: String(fd.get("email")), redirectTo: "/" }); }}
          >
            <label className="block text-sm font-medium">No Google account? Get a sign-in link by email</label>
            <input name="email" type="email" required placeholder="you@example.com" className={input} />
            <button className={`${btn.secondary} w-full py-3`}>Email me a link</button>
          </form>
        )}
        {!enabledProviders.google && !enabledProviders.email && !enabledProviders.dev && (
          <p className="text-sm text-red-700">No sign-in method is configured. Set AUTH_GOOGLE_ID or AUTH_RESEND_KEY.</p>
        )}
        {enabledProviders.dev && (
          <form
            className="space-y-2 rounded border border-dashed border-amber-400 bg-amber-50 p-3"
            action={async (fd: FormData) => { "use server"; await signIn("dev", { email: String(fd.get("email")), redirectTo: "/" }); }}
          >
            <p className="text-xs font-semibold text-amber-800">Development login (disabled in production)</p>
            <select name="email" className={input} data-testid="dev-email">
              {devUsers.map((u) => (
                <option key={u.id} value={u.email}>{u.name} ({u.roles.join(", ")})</option>
              ))}
            </select>
            <button className={`${btn.secondary} w-full`}>Sign in</button>
          </form>
        )}
      </div>
    </main>
  );
}
