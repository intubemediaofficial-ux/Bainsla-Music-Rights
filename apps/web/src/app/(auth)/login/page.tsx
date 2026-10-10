"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth-shell";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { api, errMsg } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const r = await api<{ mfaRequired: boolean }>("/auth/login", { json: { email: f.get("email"), password: f.get("password") } });
      router.replace(r.mfaRequired ? "/mfa" : "/dashboard");
    } catch (err) {
      toast.error(errMsg(err));
      setBusy(false);
    }
  }
  return (
    <AuthShell title="Sign in" subtitle="Welcome back. Use your organization account.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email" name="email" type="email" autoComplete="email" required autoFocus />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        <Button type="submit" className="h-10 w-full" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />} Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New organization?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Start free trial
        </Link>
      </p>
    </AuthShell>
  );
}
