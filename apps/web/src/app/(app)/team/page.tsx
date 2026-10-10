"use client";
import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, MoreHorizontal, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/app-shell";
import { DataTable, Pill, Td } from "@/components/data-table";
import { Field, NativeSelect } from "@/components/field";
import { api, errMsg, fmtDate, ROLE_LABEL, Role } from "@/lib/api";
import { useSession } from "@/lib/session";

type Member = {
  id: string; role: Role; status: "ACTIVE" | "INVITED" | "DISABLED"; canApproveOwnership: boolean; invitedAt: string | null; createdAt: string; inviteExpiresAt: string | null;
  user: { id: string; email: string; name: string; mfaEnabled: boolean; lastLoginAt: string | null };
};

export default function TeamPage() {
  const { me, can } = useSession();
  const manage = can("members.manage");
  const [rows, setRows] = useState<Member[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const load = useCallback(() => api<{ data: Member[]; assignableRoles: Role[] }>("/memberships").then((r) => (setRows(r.data), setRoles(r.assignableRoles)), (e) => toast.error(errMsg(e))), []);
  useEffect(() => {
    void load();
  }, [load, me?.activeOrg?.id]);

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const r = await api<{ inviteUrl: string }>("/memberships", {
        json: { email: f.get("email"), name: f.get("name") || undefined, role: f.get("role"), canApproveOwnership: f.get("approve") === "on" },
      });
      setInviteUrl(r.inviteUrl);
      void load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function update(m: Member, patch: Partial<Pick<Member, "role" | "status" | "canApproveOwnership">>) {
    try {
      await api(`/memberships/${m.id}`, { method: "PATCH", json: patch });
      toast.success("Member updated");
      void load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  async function remove(m: Member) {
    if (!confirm(`Remove ${m.user.email} from this organization?`)) return;
    try {
      await api(`/memberships/${m.id}`, { method: "DELETE" });
      toast.success("Member removed");
      void load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <>
      <PageHeader
        title="Team"
        description="Members, roles and ownership-approval rights for this organization."
        actions={
          manage && (
            <Button onClick={() => (setInviteUrl(null), setOpen(true))}>
              <UserPlus className="size-4" /> Invite member
            </Button>
          )
        }
      />
      <DataTable head={["Member", "Role", "Status", "MFA", "Last login", ""]}>
        {rows === null && (
          <tr>
            <Td colSpan={6} className="py-10 text-center text-muted-foreground">
              <Loader2 className="mx-auto size-5 animate-spin" />
            </Td>
          </tr>
        )}
        {rows?.map((m) => (
          <tr key={m.id} className="hover:bg-muted/30">
            <Td>
              <div className="font-medium">{m.user.name}</div>
              <div className="text-xs text-muted-foreground">{m.user.email}</div>
            </Td>
            <Td>
              <div className="flex items-center gap-1.5">
                {ROLE_LABEL[m.role]}
                {m.canApproveOwnership && m.role === "RIGHTS_MANAGER" && <Pill tone="violet">can approve</Pill>}
              </div>
            </Td>
            <Td>
              <Pill tone={m.status === "ACTIVE" ? "green" : m.status === "INVITED" ? "amber" : "slate"}>{m.status.toLowerCase()}</Pill>
            </Td>
            <Td>{m.user.mfaEnabled ? <ShieldCheck className="size-4 text-emerald-600" /> : <span className="text-xs text-muted-foreground">off</span>}</Td>
            <Td className="text-muted-foreground">{fmtDate(m.user.lastLoginAt, true)}</Td>
            <Td className="text-right">
              {manage && m.user.id !== me?.user.id && (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Actions" />}>
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    {roles.filter((r) => r !== m.role).map((r) => (
                      <DropdownMenuItem key={r} onClick={() => update(m, { role: r })}>
                        Make {ROLE_LABEL[r]}
                      </DropdownMenuItem>
                    ))}
                    {m.role === "RIGHTS_MANAGER" && (
                      <DropdownMenuItem onClick={() => update(m, { canApproveOwnership: !m.canApproveOwnership })}>
                        {m.canApproveOwnership ? "Revoke" : "Grant"} ownership approval
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {m.status !== "DISABLED" ? (
                      <DropdownMenuItem onClick={() => update(m, { status: "DISABLED" })}>Disable access</DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => update(m, { status: "ACTIVE" })}>Re-enable access</DropdownMenuItem>
                    )}
                    <DropdownMenuItem variant="destructive" onClick={() => remove(m)}>
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </Td>
          </tr>
        ))}
      </DataTable>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{inviteUrl ? "Invitation created" : "Invite a member"}</DialogTitle>
            <DialogDescription>
              {inviteUrl ? "Share this one-time link with the person. It expires in 7 days." : "They will join this organization with the role you choose."}
            </DialogDescription>
          </DialogHeader>
          {inviteUrl ? (
            <div className="flex gap-2">
              <input readOnly value={inviteUrl} className="h-10 flex-1 rounded-lg border bg-muted/40 px-3 font-mono text-xs" />
              <Button variant="outline" onClick={() => navigator.clipboard.writeText(inviteUrl).then(() => toast.success("Copied"))}>
                <Copy className="size-4" />
              </Button>
            </div>
          ) : (
            <form id="invite" onSubmit={invite} className="space-y-4">
              <Field label="Email" name="email" type="email" required />
              <Field label="Name (optional)" name="name" />
              <NativeSelect label="Role" name="role" defaultValue={roles.includes("CATALOG_EDITOR") ? "CATALOG_EDITOR" : roles[0]}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </NativeSelect>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="approve" className="size-4" /> Rights Manager may approve ownership
              </label>
            </form>
          )}
          <DialogFooter>
            {inviteUrl ? (
              <Button onClick={() => setOpen(false)}>Done</Button>
            ) : (
              <Button type="submit" form="invite" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />} Create invitation
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
