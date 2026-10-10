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

export default function SignupPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api("/auth/signup", {
        json: {
          name: f.get("name"),
          email: f.get("email"),
          password: f.get("password"),
          organizationName: f.get("organizationName"),
          acceptTerms: f.get("acceptTerms") === "on",
        },
      });
      router.replace("/dashboard");
    } catch (err) {
      toast.error(errMsg(err));
      setBusy(false);
    }
  }
  return (
    <AuthShell title="Create your workspace" subtitle="For labels, studios, publishers and independent artists.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Your name" name="name" required minLength={2} />
        <Field label="Work email" name="email" type="email" autoComplete="email" required />
        <Field label="Organization / label name" name="organizationName" required minLength={2} />
        <Field label="Password" name="password" type="password" autoComplete="new-password" required minLength={10} hint="10+ characters with letters and numbers." />
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input type="checkbox" name="acceptTerms" required className="mt-0.5 size-4 accent-[var(--primary)]" />
          I agree to the terms and privacy policy.
        </label>
        <Button type="submit" className="h-10 w-full" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />} Create workspace
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
