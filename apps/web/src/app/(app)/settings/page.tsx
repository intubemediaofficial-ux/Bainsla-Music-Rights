"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app-shell";
import { Field } from "@/components/field";
import { api, errMsg } from "@/lib/api";
import { useSession } from "@/lib/session";

type Org = { legalName: string; displayName: string; email: string | null; phone: string | null; address: string | null; gstin: string | null; country: string | null; logoUrl: string | null; brandColor: string | null; plan?: { name: string } | null };

export default function SettingsPage() {
  const { can, refresh, me } = useSession();
  const edit = can("org.manage");
  const [org, setOrg] = useState<Org | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Org>("/organizations/current").then(setOrg, (e) => toast.error(errMsg(e)));
  }, [me?.activeOrg?.id]);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, string> = {};
    for (const [k, v] of f.entries()) if (String(v).trim()) body[k] = String(v).trim();
    setBusy(true);
    try {
      setOrg(await api<Org>("/organizations/current", { method: "PATCH", json: body }));
      await refresh();
      toast.success("Organization updated");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Organization profile used on agreements, NOCs and verification packages."
        actions={
          <Link href="/settings/security">
            <Button variant="outline">
              <ShieldCheck className="size-4" /> Security &amp; MFA
            </Button>
          </Link>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Organization profile</CardTitle>
          <CardDescription>{org?.plan ? `Plan: ${org.plan.name}` : " "}</CardDescription>
        </CardHeader>
        <CardContent>
          {!org ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : (
            <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
              <fieldset disabled={!edit} className="contents">
                <Field label="Legal name" name="legalName" defaultValue={org.legalName} required />
                <Field label="Display name" name="displayName" defaultValue={org.displayName} required />
                <Field label="Contact email" name="email" type="email" defaultValue={org.email ?? ""} />
                <Field label="Phone" name="phone" defaultValue={org.phone ?? ""} />
                <div className="md:col-span-2">
                  <Field label="Registered address" name="address" defaultValue={org.address ?? ""} />
                </div>
                <Field label="GSTIN" name="gstin" defaultValue={org.gstin ?? ""} maxLength={15} />
                <Field label="Country (ISO-2)" name="country" defaultValue={org.country ?? "IN"} maxLength={2} />
                <Field label="Logo URL (https)" name="logoUrl" defaultValue={org.logoUrl ?? ""} />
                <Field label="Brand colour" name="brandColor" type="color" defaultValue={org.brandColor ?? "#7c3aed"} className="h-10 w-24 p-1" />
              </fieldset>
              {edit && (
                <div className="md:col-span-2">
                  <Button type="submit" disabled={busy}>
                    {busy && <Loader2 className="size-4 animate-spin" />} Save changes
                  </Button>
                </div>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </>
  );
}
