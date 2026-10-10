import { ShieldCheck, FileCheck2, Scale, Fingerprint } from "lucide-react";
import { Logo } from "./brand";

const POINTS = [
  { icon: Scale, title: "Rights, not just metadata", text: "Works, recordings and releases kept separate with share-validated claims." },
  { icon: FileCheck2, title: "Evidence you can hand over", text: "Agreements, NOCs, Annexure-A and checksum-sealed verification packages." },
  { icon: ShieldCheck, title: "Tenant-isolated by design", text: "Row-level security, audit trail and MFA for every privileged account." },
];

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[oklch(0.18_0.04_285)] p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -left-32 -top-32 size-[480px] rounded-full bg-violet-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 right-0 size-[420px] rounded-full bg-fuchsia-600/20 blur-3xl" />
        <Logo light />
        <div className="relative mt-auto max-w-md space-y-8">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">
            Prove who owns every song in your catalog.
          </h2>
          <ul className="space-y-5">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <p.icon className="size-5 text-violet-200" />
                </div>
                <div>
                  <div className="font-medium">{p.title}</div>
                  <div className="text-sm text-white/65">{p.text}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative mt-auto flex items-center gap-2 pt-12 text-xs text-white/50">
          <Fingerprint className="size-4" /> Internal records management — not a government registration or certification.
        </div>
      </aside>
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
