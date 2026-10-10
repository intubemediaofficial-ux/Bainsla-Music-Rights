"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Building2, Copy, Database, Disc3, Loader2, LogIn, Music, Plus, ShieldAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app-shell";
import { AuditTable } from "@/components/audit-table";
import { DataTable, Pill, Td } from "@/components/data-table";
import { Field, NativeSelect } from "@/components/field";
import { api, errMsg, fmtDate } from "@/lib/api";
import { useSession } from "@/lib/session";

type Overview = { organizationsByStatus: Record<string, number>; users: number; recordings: number; works: number; logins24h: number; databaseBytes: string | null; uptimeSec: number };
type Org = { id: string; legalName: string; displayName: string; slug: string; status: string; plan: { code: string; name: string } | null; members: number; recordings: number; createdAt: string };
type Plan = { code: string; name: string };

const STATUSES = ["TRIAL", "ACTIVE", "SUSPENDED", "CLOSED"];

export default function PlatformPage() {
  const { me, refresh } = useSession();
  const router = useRouter();
  const [ov, setOv] = useState<Overview | null>(null);
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [create, setCreate] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [bg, setBg] = useState<Org | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Overview>("/platform/overview").then(setOv, (e) => toast.error(errMsg(e)));
    api<Org[]>("/platform/organizations").then(setOrgs, () => {});
    api<Plan[]>("/platform/plans").then(setPlans, () => {});
  }, []);
  useEffect(() => {
    if (me?.user.isPlatformAdmin) load();
  }, [me?.user.isPlatformAdmin, load]);

  if (!me?.user.isPlatformAdmin) return <p className="text-sm text-muted-foreground">Platform administrators only.</p>;

  const patch = async (o: Org, body: Record<string, string>) => {
    try {
      await api(`/platform/organizations/${o.id}`, { method: "PATCH", json: body });
      toast.success("Tenant updated");
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const stats = ov
    ? [
        { label: "Tenants", value: Object.values(ov.organizationsByStatus).reduce((a, b) => a + b, 0), icon: Building2 },
        { label: "Users", value: ov.users, icon: Users },
        { label: "Works", value: ov.works, icon: Music },
        { label: "Recordings", value: ov.recordings, icon: Disc3 },
        { label: "Logins (24h)", value: ov.logins24h, icon: LogIn },
        { label: "Database", value: ov.databaseBytes ? `${(Number(ov.databaseBytes) / 1048576).toFixed(1)} MB` : "—", icon: Database },
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Platform admin"
        description="Tenants, plans and platform health. Customer data access requires audited break-glass."
        actions={
          <Button onClick={() => (setInviteUrl(null), setCreate(true))}>
            <Plus className="size-4" /> New tenant
          </Button>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {(ov ? stats : Array.from({ length: 6 }, (_, i) => ({ label: "", value: "", icon: Loader2, key: i }))).map((s, i) => (
          <Card key={i} className="py-0">
            <CardContent className="p-4">
              <s.icon className="mb-2 size-5 text-primary" />
              <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Tabs defaultValue="tenants">
        <TabsList>
          <TabsTrigger value="tenants">Tenants</TabsTrigger>
          <TabsTrigger value="audit">Platform audit</TabsTrigger>
        </TabsList>
        <TabsContent value="tenants" className="mt-4">
          <DataTable head={["Organization", "Plan", "Status", "Members", "Recordings", "Created", ""]}>
            {orgs?.map((o) => (
              <tr key={o.id} className="hover:bg-muted/30">
                <Td>
                  <div className="font-medium">{o.displayName}</div>
                  <div className="text-xs text-muted-foreground">{o.legalName}</div>
                </Td>
                <Td>
                  <select className="h-8 rounded-md border bg-background px-2 text-xs" value={o.plan?.code ?? ""} onChange={(e) => patch(o, { planCode: e.target.value })}>
                    <option value="" disabled>
                      none
                    </option>
                    {plans.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Td>
                <Td>
                  <select className="h-8 rounded-md border bg-background px-2 text-xs" value={o.status} onChange={(e) => patch(o, { status: e.target.value })}>
                    {STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  {o.status === "SUSPENDED" && (
                    <span className="ml-2">
                      <Pill tone="red">blocked</Pill>
                    </span>
                  )}
                </Td>
                <Td className="tabular-nums">{o.members}</Td>
                <Td className="tabular-nums">{o.recordings}</Td>
                <Td className="text-muted-foreground">{fmtDate(o.createdAt)}</Td>
                <Td className="text-right">
                  {!me.organizations.some((m) => m.id === o.id) && (
                    <Button size="sm" variant="outline" onClick={() => setBg(o)}>
                      <ShieldAlert className="size-3.5" /> Break-glass
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </DataTable>
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditTable endpoint="/platform/audit-logs" />
        </TabsContent>
      </Tabs>

      <Dialog open={create} onOpenChange={setCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{inviteUrl ? "Tenant created" : "Provision a tenant"}</DialogTitle>
            <DialogDescription>{inviteUrl ? "Send this owner invitation link (valid 7 days)." : "Creates the organization and invites its owner."}</DialogDescription>
          </DialogHeader>
          {inviteUrl ? (
            <div className="flex gap-2">
              <input readOnly value={inviteUrl} className="h-10 flex-1 rounded-lg border bg-muted/40 px-3 font-mono text-xs" />
              <Button variant="outline" onClick={() => navigator.clipboard.writeText(inviteUrl).then(() => toast.success("Copied"))}>
                <Copy className="size-4" />
              </Button>
            </div>
          ) : (
            <form
              id="tenant"
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setBusy(true);
                try {
                  const r = await api<{ ownerInviteUrl: string }>("/platform/organizations", {
                    json: { legalName: f.get("legalName"), displayName: f.get("displayName") || undefined, ownerEmail: f.get("ownerEmail"), ownerName: f.get("ownerName") || undefined, planCode: f.get("planCode") || undefined },
                  });
                  setInviteUrl(r.ownerInviteUrl);
                  load();
                } catch (err) {
                  toast.error(errMsg(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field label="Legal name" name="legalName" required />
              <Field label="Display name" name="displayName" />
              <Field label="Owner email" name="ownerEmail" type="email" required />
              <Field label="Owner name" name="ownerName" />
              <NativeSelect label="Plan" name="planCode" defaultValue="studio">
                {plans.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </form>
          )}
          <DialogFooter>
            {inviteUrl ? (
              <Button onClick={() => setCreate(false)}>Done</Button>
            ) : (
              <Button type="submit" form="tenant" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />} Create tenant
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!bg} onOpenChange={(o) => !o && setBg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-amber-600" /> Break-glass into {bg?.displayName}
            </DialogTitle>
            <DialogDescription>Time-limited read access to this customer&apos;s data. Your reason and every action are written to the audit log.</DialogDescription>
          </DialogHeader>
          <form
            id="bg"
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              try {
                await api(`/platform/organizations/${bg!.id}/break-glass`, { json: { reason: f.get("reason"), minutes: Number(f.get("minutes")) } });
                await api("/auth/switch-org", { json: { organizationId: bg!.id } });
                await refresh();
                setBg(null);
                router.push("/dashboard");
              } catch (err) {
                toast.error(errMsg(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Reason (support ticket, legal request…)" name="reason" required minLength={15} />
            <NativeSelect label="Duration" name="minutes" defaultValue="30">
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
            </NativeSelect>
          </form>
          <DialogFooter>
            <Button type="submit" form="bg" disabled={busy} className="bg-amber-600 hover:bg-amber-700">
              {busy && <Loader2 className="size-4 animate-spin" />} Grant &amp; enter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
