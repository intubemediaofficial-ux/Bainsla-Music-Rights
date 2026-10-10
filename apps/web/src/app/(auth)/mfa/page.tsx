"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth-shell";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { api, errMsg } from "@/lib/api";

export default function MfaPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") ?? "").replace(/\s/g, "");
    setBusy(true);
    try {
      await api("/auth/mfa/verify", { json: { code } });
      router.replace("/dashboard");
    } catch (err) {
      toast.error(errMsg(err));
      setBusy(false);
    }
  }
  return (
    <AuthShell title="Two-factor verification" subtitle="Enter the 6-digit code from your authenticator app, or a recovery code.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Code" name="code" inputMode="numeric" autoComplete="one-time-code" required autoFocus className="h-12 text-center font-mono text-lg tracking-[0.4em]" />
        <Button type="submit" className="h-10 w-full" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />} Verify
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={() => api("/auth/logout", { method: "POST" }).finally(() => router.replace("/login"))}>
          Use a different account
        </Button>
      </form>
    </AuthShell>
  );
}
