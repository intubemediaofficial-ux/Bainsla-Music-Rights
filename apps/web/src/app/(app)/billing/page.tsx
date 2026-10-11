"use client";
import { useState } from "react";
import { Check, Download, FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app-shell";
import { DataTable, Pill, Td } from "@/components/data-table";
import { useFetch } from "@/components/catalog";
import { api, errMsg, fmtDate } from "@/lib/api";

type Plan = { id: string; code: string; name: string; priceInrPaise: number | null; maxRecordings: number | null; maxUsers: number | null; maxStorageBytes: string | null };
type Invoice = { id: string; number: string; amountPaise: number; taxPaise: number; currency: string; status: string; issuedAt: string; periodStart: string | null; periodEnd: string | null };
type Billing = {
  plan: Plan | null;
  subscription: { status: string; trialEndsAt: string | null; currentPeriodEnd: string | null; gateway: string | null } | null;
  usage: { recordings: number; users: number; storageBytes: number; pdfJobsThisMonth: number; exportsThisMonth: number };
  invoices: Invoice[];
  plans: Plan[];
  gatewayConfigured: boolean;
};

const inr = (p: number | null) => (p == null ? "Custom quote" : p === 0 ? "Free" : `₹${(p / 100).toLocaleString("en-IN")}`);
const gb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(1)} MB`);
const SUB_TONE: Record<string, "green" | "amber" | "red" | "sky" | "slate"> = { ACTIVE: "green", TRIALING: "sky", PAST_DUE: "amber", CANCELED: "red" };

function Meter({ label, used, max, fmt = String }: { label: string; used: number; max: number | null; fmt?: (n: number) => string }) {
  const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const tone = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-[var(--primary)]";
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{label}</span><span className="text-muted-foreground">{fmt(used)} / {max ? fmt(max) : "unlimited"}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${tone}`} style={{ width: `${max ? pct : 4}%` }} /></div>
    </div>
  );
}

function download(href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.click();
}

export default function BillingPage() {
  const { data, error, reload } = useFetch<Billing>("/billing");
  const [busy, setBusy] = useState<string | null>(null);
  async function choose(p: Plan) {
    setBusy(p.code);
    try {
      await api("/billing/plan", { method: "POST", json: { planCode: p.code } });
      toast.success(`Switched to ${p.name}`);
      await reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  }
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading billing…</p>;
  const { plan, subscription: sub, usage: u } = data;
  return (
    <div className="space-y-6">
      <PageHeader title="Billing & plan" description="Your plan, usage against quotas, invoices and data export." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">{plan?.name ?? "No plan"} {sub && <Pill tone={SUB_TONE[sub.status] ?? "slate"}>{sub.status.replace("_", " ").toLowerCase()}</Pill>}</CardTitle>
            <CardDescription>{plan ? `${inr(plan.priceInrPaise)}${plan.priceInrPaise ? " / month" : ""}` : "Ask the platform team to assign a plan."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {sub?.trialEndsAt && sub.status === "TRIALING" && <p>Trial ends <b>{fmtDate(sub.trialEndsAt)}</b></p>}
            {sub?.currentPeriodEnd && <p>Current period ends <b>{fmtDate(sub.currentPeriodEnd)}</b></p>}
            {sub?.status === "PAST_DUE" && <p className="rounded-md bg-amber-50 p-2 text-amber-800">Last payment failed. Update the payment method with the gateway to avoid interruption.</p>}
            <p className="text-xs text-muted-foreground">{data.gatewayConfigured ? "Payments are confirmed by the payment gateway; invoices appear here automatically." : "Online payment is not connected yet. Plan changes start a trial; the platform team confirms paid activation."}</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Usage</CardTitle><CardDescription>Uploads and invites are blocked when a limit is reached.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Meter label="Recordings" used={u.recordings} max={plan?.maxRecordings ?? null} />
            <Meter label="Team members" used={u.users} max={plan?.maxUsers ?? null} />
            <Meter label="Document storage" used={u.storageBytes} max={plan?.maxStorageBytes ? Number(plan.maxStorageBytes) : null} fmt={gb} />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border p-3"><div className="text-2xl font-semibold">{u.pdfJobsThisMonth}</div><div className="text-muted-foreground">PDFs this month</div></div>
              <div className="rounded-lg border p-3"><div className="text-2xl font-semibold">{u.exportsThisMonth}</div><div className="text-muted-foreground">Exports this month</div></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Plans</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {data.plans.map((p) => {
            const current = p.id === plan?.id;
            return (
              <Card key={p.id} className={current ? "border-[var(--primary)] ring-1 ring-[var(--primary)]" : ""}>
                <CardHeader>
                  <CardTitle>{p.name}</CardTitle>
                  <CardDescription className="text-lg font-semibold text-foreground">{inr(p.priceInrPaise)}{p.priceInrPaise ? <span className="text-sm font-normal text-muted-foreground"> / month</span> : null}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <ul className="space-y-1">
                    <li className="flex gap-2"><Check className="size-4 text-emerald-600" />{p.maxRecordings ? `${p.maxRecordings.toLocaleString("en-IN")} recordings` : "Custom recordings"}</li>
                    <li className="flex gap-2"><Check className="size-4 text-emerald-600" />{p.maxUsers ? `${p.maxUsers} users` : "Custom users"}</li>
                    <li className="flex gap-2"><Check className="size-4 text-emerald-600" />{p.maxStorageBytes ? `${gb(Number(p.maxStorageBytes))} storage` : "Custom storage"}</li>
                  </ul>
                  {current ? <Button variant="outline" className="w-full" disabled>Current plan</Button>
                    : p.priceInrPaise == null ? <Button variant="outline" className="w-full" onClick={() => download("mailto:intubemediaofficial@gmail.com?subject=Enterprise%20plan")}>Contact us</Button>
                    : <Button className="w-full" disabled={!!busy} onClick={() => void choose(p)}>{busy === p.code && <Loader2 className="size-4 animate-spin" />} Switch to {p.name}</Button>}
                </CardContent>
              </Card>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Prices and quotas are configurable by the platform admin. Downgrades are allowed only when current usage fits the new plan.</p>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Invoices</h2>
        <DataTable head={["Number", "Issued", "Period", "Amount", "Tax", "Status", ""]}>
          {data.invoices.length === 0 ? (
            <tr><Td colSpan={7} className="py-8 text-center text-muted-foreground">No invoices yet. They appear after the payment gateway confirms a charge.</Td></tr>
          ) : data.invoices.map((i) => (
            <tr key={i.id} className="border-t">
              <Td className="font-mono">{i.number}</Td>
              <Td>{fmtDate(i.issuedAt)}</Td>
              <Td>{i.periodStart ? `${fmtDate(i.periodStart)} – ${fmtDate(i.periodEnd)}` : "—"}</Td>
              <Td>{inr(i.amountPaise)}</Td>
              <Td>{inr(i.taxPaise)}</Td>
              <Td><Pill tone={i.status === "PAID" ? "green" : "amber"}>{i.status.toLowerCase()}</Pill></Td>
              <Td><Button size="sm" variant="ghost" onClick={() => download(`/api/v1/billing/invoices/${i.id}/pdf`)}><FileDown className="size-4" /> PDF</Button></Td>
            </tr>
          ))}
        </DataTable>
      </div>

      <Card>
        <CardHeader><CardTitle>Export your data</CardTitle><CardDescription>Download all catalog, rights, agreement, registration and dispute records as JSON + recordings CSV (ZIP). Document files stay in Documents; PAN/bank numbers are never exported.</CardDescription></CardHeader>
        <CardContent><Button variant="outline" onClick={() => download("/api/v1/exports/catalog")}><Download className="size-4" /> Download export</Button></CardContent>
      </Card>
    </div>
  );
}
