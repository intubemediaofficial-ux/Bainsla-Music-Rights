"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Music, Disc3, Album, Users, FileWarning, ShieldCheck, FileCheck2, AlertTriangle, Swords, CalendarClock, Landmark, FileSignature, Activity, ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/app-shell";
import { api, fmtDate, timeAgo } from "@/lib/api";
import { useSession } from "@/lib/session";

type Summary = {
  kpis: Record<string, number>;
  missingEvidence: { id: string; title: string; isrc: string | null }[];
  conflicts: { id: string; rightType: string; sharePercent: string; work?: { title: string } | null; recording?: { title: string } | null; party: { legalName: string } }[];
  expiring: { kind: string; id: string; title: string; date: string }[];
  activity: { id: string; action: string; entityType: string; actorEmail: string | null; createdAt: string }[];
};

const KPI = [
  { key: "works", label: "Musical works", icon: Music, tone: "violet" },
  { key: "recordings", label: "Recordings", icon: Disc3, tone: "sky" },
  { key: "releases", label: "Releases", icon: Album, tone: "indigo" },
  { key: "parties", label: "Parties", icon: Users, tone: "slate" },
  { key: "incompleteDocumentation", label: "Missing evidence", icon: FileWarning, tone: "amber" },
  { key: "reviewedClaims", label: "Reviewed claims", icon: ShieldCheck, tone: "emerald" },
  { key: "documentedClaims", label: "Documented claims", icon: FileCheck2, tone: "emerald" },
  { key: "conflicts", label: "Rights conflicts", icon: AlertTriangle, tone: "rose" },
  { key: "openDisputes", label: "Open disputes", icon: Swords, tone: "rose" },
  { key: "expiringAgreements", label: "Expiring in 60d", icon: CalendarClock, tone: "amber" },
  { key: "pendingRegistrations", label: "Pending registrations", icon: Landmark, tone: "sky" },
  { key: "unsignedAgreements", label: "Unsigned agreements", icon: FileSignature, tone: "amber" },
] as const;

const TONE: Record<string, string> = {
  violet: "bg-violet-100 text-violet-700",
  sky: "bg-sky-100 text-sky-700",
  indigo: "bg-indigo-100 text-indigo-700",
  slate: "bg-slate-100 text-slate-700",
  amber: "bg-amber-100 text-amber-700",
  emerald: "bg-emerald-100 text-emerald-700",
  rose: "bg-rose-100 text-rose-700",
};

function pretty(action: string) {
  return action.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DashboardPage() {
  const { me } = useSession();
  const [s, setS] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!me?.activeOrg) return;
    setS(null);
    api<Summary>("/dashboard/summary").then(setS, (e) => setErr(e.message));
  }, [me?.activeOrg?.id, me?.activeOrg]);

  if (!me?.activeOrg) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="py-12 text-center">
          <p className="font-medium">You are not a member of any active organization.</p>
          {me?.user.isPlatformAdmin && (
            <Link href="/platform" className="mt-3 inline-flex items-center gap-1 text-sm text-primary">
              Open platform admin <ArrowRight className="size-3.5" />
            </Link>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <PageHeader title={`Good to see you, ${me.user.name.split(" ")[0]}`} description={`${me.activeOrg.displayName} — rights health overview`} />
      {err && <p className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{err}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {KPI.map((k) => (
          <Card key={k.key} className="gap-0 py-0 transition hover:shadow-md">
            <CardContent className="p-4">
              <div className={`mb-3 grid size-9 place-items-center rounded-lg ${TONE[k.tone]}`}>
                <k.icon className="size-[18px]" />
              </div>
              {s ? <div className="text-2xl font-semibold tabular-nums">{s.kpis[k.key] ?? 0}</div> : <Skeleton className="h-8 w-12" />}
              <div className="mt-0.5 text-xs text-muted-foreground">{k.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileWarning className="size-4 text-amber-600" /> Recordings without executed evidence
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!s ? (
              <Skeleton className="h-40 w-full" />
            ) : s.missingEvidence.length === 0 ? (
              <Empty text="Every recording has an executed agreement or document." />
            ) : (
              <ul className="divide-y">
                {s.missingEvidence.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="truncate font-medium">{r.title}</span>
                    <span className="ml-4 shrink-0 font-mono text-xs text-muted-foreground">{r.isrc ?? "no ISRC"}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4 text-primary" /> Recent activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!s ? (
              <Skeleton className="h-40 w-full" />
            ) : s.activity.length === 0 ? (
              <Empty text="No activity recorded yet." />
            ) : (
              <ol className="relative space-y-4 border-l pl-4">
                {s.activity.map((a) => (
                  <li key={a.id} className="text-sm">
                    <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full border-2 border-background bg-primary" />
                    <div className="font-medium">{pretty(a.action)}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.actorEmail ?? "system"} · {timeAgo(a.createdAt)}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-rose-600" /> Rights conflicts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!s ? (
              <Skeleton className="h-24 w-full" />
            ) : s.conflicts.length === 0 ? (
              <Empty text="No disputed or conflicting claims." />
            ) : (
              <ul className="divide-y">
                {s.conflicts.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                    <span className="font-medium">{c.work?.title ?? c.recording?.title}</span>
                    <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700">{c.rightType}</span>
                    <span className="text-muted-foreground">
                      {c.party.legalName} · {Number(c.sharePercent)}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4 text-amber-600" /> Expiring soon
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!s ? (
              <Skeleton className="h-24 w-full" />
            ) : s.expiring.length === 0 ? (
              <Empty text="Nothing expires in the next 60 days." />
            ) : (
              <ul className="divide-y">
                {s.expiring.map((x) => (
                  <li key={x.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="truncate">{x.title}</span>
                    <span className="ml-3 shrink-0 text-xs text-muted-foreground">{fmtDate(x.date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">{text}</div>;
}
