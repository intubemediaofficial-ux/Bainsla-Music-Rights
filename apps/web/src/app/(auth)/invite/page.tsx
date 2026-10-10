"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth-shell";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { api, errMsg, ROLE_LABEL, Role } from "@/lib/api";

type Info = { email: string; organization: string; role: Role; needsPassword: boolean };

function InviteInner() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Info>(`/auth/invite?token=${encodeURIComponent(token)}`).then(setInfo, (e) => setError(errMsg(e)));
  }, [token]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api("/auth/accept-invite", { json: { token, name: f.get("name") || undefined, password: f.get("password") || undefined } });
      router.replace("/dashboard");
    } catch (err) {
      toast.error(errMsg(err));
      setBusy(false);
    }
  }
  if (error) return <AuthShell title="Invitation unavailable" subtitle={error}>{null}</AuthShell>;
  if (!info) return <AuthShell title="Loading invitation…">{<Loader2 className="size-5 animate-spin text-muted-foreground" />}</AuthShell>;
  return (
    <AuthShell title={`Join ${info.organization}`} subtitle={`You were invited as ${ROLE_LABEL[info.role]} (${info.email}).`}>
      <form onSubmit={submit} className="space-y-4">
        {info.needsPassword && (
          <>
            <Field label="Your name" name="name" required minLength={2} />
            <Field label="Choose a password" name="password" type="password" required minLength={10} hint="10+ characters with letters and numbers." />
          </>
        )}
        <Button type="submit" className="h-10 w-full" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />} Accept invitation
        </Button>
      </form>
    </AuthShell>
  );
}

export default function InvitePage() {
  return (
    <Suspense>
      <InviteInner />
    </Suspense>
  );
}
