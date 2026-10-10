"use client";
import { useState } from "react";
import { KeyRound, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app-shell";
import { Field } from "@/components/field";
import { api, errMsg } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function SecurityPage() {
  const { me, refresh } = useSession();
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Security" description="Two-factor authentication and password." />
      {me.mfaSetupRequired && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <ShieldAlert className="size-4" /> Your role requires two-factor authentication. Set it up to continue.
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {me.user.mfaEnabled ? <ShieldCheck className="size-5 text-emerald-600" /> : <ShieldAlert className="size-5 text-amber-600" />}
              Authenticator app (TOTP)
            </CardTitle>
            <CardDescription>{me.user.mfaEnabled ? "Enabled — codes are required at every sign-in." : "Not enabled. Use Google Authenticator, Authy or 1Password."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {codes && (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4">
                <p className="mb-2 text-sm font-medium text-emerald-900">Save these one-time recovery codes now. They will not be shown again.</p>
                <div className="grid grid-cols-2 gap-1 font-mono text-sm">
                  {codes.map((c) => (
                    <span key={c}>{c}</span>
                  ))}
                </div>
              </div>
            )}
            {!me.user.mfaEnabled && !setup && (
              <Button disabled={busy} onClick={() => run(async () => setSetup(await api("/auth/mfa/setup", { method: "POST" })))}>
                Set up two-factor
              </Button>
            )}
            {!me.user.mfaEnabled && setup && (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const code = String(new FormData(e.currentTarget).get("code"));
                  void run(async () => {
                    const r = await api<{ recoveryCodes: string[] }>("/auth/mfa/enable", { json: { code } });
                    setCodes(r.recoveryCodes);
                    setSetup(null);
                    await refresh();
                    toast.success("Two-factor enabled");
                  });
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={setup.qrDataUrl} alt="Scan this QR code" className="size-44 rounded-lg border bg-white p-2" />
                <p className="text-xs text-muted-foreground">
                  Or enter key: <code className="break-all font-mono">{setup.secret}</code>
                </p>
                <Field label="6-digit code" name="code" inputMode="numeric" required className="font-mono tracking-widest" />
                <Button type="submit" disabled={busy}>
                  {busy && <Loader2 className="size-4 animate-spin" />} Verify &amp; enable
                </Button>
              </form>
            )}
            {me.user.mfaEnabled && !codes && (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(async () => {
                    await api("/auth/mfa/disable", { json: { password: f.get("password"), code: f.get("code") } });
                    await refresh();
                    toast.success("Two-factor disabled");
                  });
                }}
              >
                <p className="text-sm text-muted-foreground">To disable, confirm your password and a current code.</p>
                <Field label="Password" name="password" type="password" required />
                <Field label="Code" name="code" required />
                <Button type="submit" variant="destructive" disabled={busy}>
                  Disable two-factor
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-5 text-primary" /> Change password
            </CardTitle>
            <CardDescription>Other sessions are signed out after a password change.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const f = new FormData(form);
                void run(async () => {
                  await api("/auth/password", { json: { currentPassword: f.get("currentPassword"), newPassword: f.get("newPassword") } });
                  form.reset();
                  toast.success("Password changed");
                });
              }}
            >
              <Field label="Current password" name="currentPassword" type="password" required autoComplete="current-password" />
              <Field label="New password" name="newPassword" type="password" required minLength={10} autoComplete="new-password" hint="10+ characters with letters and numbers." />
              <Button type="submit" disabled={busy}>
                Update password
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
