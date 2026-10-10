"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, Check, ChevronsUpDown, LogOut, Menu, Search, Shield, ShieldAlert, UserRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { api, errMsg, ROLE_LABEL, timeAgo } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { Logo } from "./brand";
import { NAV, PLATFORM_NAV, NavItem } from "./nav";

function initials(s: string) {
  return s.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const { me, can } = useSession();
  const item = (i: NavItem) => {
    const active = path === i.href || path.startsWith(i.href + "/");
    return (
      <Link
        key={i.href}
        href={i.href}
        onClick={onNavigate}
        className={cn(
          "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
          active ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
      >
        <i.icon className="size-4 shrink-0" />
        <span className="flex-1 truncate">{i.label}</span>
        {i.phase && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/50">P{i.phase}</span>}
      </Link>
    );
  };
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="px-5 py-5">
        <Logo light />
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {NAV.map((g) => {
          const items = g.items.filter((i) => !i.perm || can(i.perm));
          if (!items.length) return null;
          return (
            <div key={g.group}>
              <div className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">{g.group}</div>
              <div className="space-y-0.5">{items.map(item)}</div>
            </div>
          );
        })}
        {me?.user.isPlatformAdmin && (
          <div>
            <div className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">Platform</div>
            {item(PLATFORM_NAV)}
          </div>
        )}
      </nav>
      <div className="border-t border-sidebar-border p-4 text-[11px] leading-relaxed text-sidebar-foreground/40">
        Internal rights records. Not a government registration or platform certification.
      </div>
    </div>
  );
}

function OrgSwitcher() {
  const { me, refresh } = useSession();
  const router = useRouter();
  if (!me) return null;
  const switchTo = async (id: string) => {
    try {
      await api("/auth/switch-org", { json: { organizationId: id } });
      await refresh();
      router.push("/dashboard");
      toast.success("Switched organization");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const org = me.activeOrg;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="h-9 max-w-64 gap-2 px-2.5" />}>
        <span className="grid size-5 shrink-0 place-items-center rounded text-[10px] font-bold text-white" style={{ background: org?.brandColor ?? "#7c3aed" }}>
          {initials(org?.displayName ?? "?")}
        </span>
        <span className="truncate text-sm">{org?.displayName ?? "No organization"}</span>
        <ChevronsUpDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Organizations</DropdownMenuLabel>
          {me.organizations.map((o) => (
            <DropdownMenuItem key={o.id} onClick={() => o.id !== org?.id && switchTo(o.id)}>
              <span className="grid size-5 place-items-center rounded text-[10px] font-bold text-white" style={{ background: o.brandColor ?? "#7c3aed" }}>
                {initials(o.displayName)}
              </span>
              <span className="flex-1 truncate">{o.displayName}</span>
              <span className="text-[11px] text-muted-foreground">{ROLE_LABEL[o.role]}</span>
              {o.id === org?.id && <Check className="size-3.5" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type Notif = { id: string; title: string; body: string | null; readAt: string | null; createdAt: string };

function Bell_() {
  const { can, me } = useSession();
  const [data, setData] = useState<{ data: Notif[]; unread: number }>({ data: [], unread: 0 });
  const load = () => api<{ data: Notif[]; unread: number }>("/notifications").then(setData, () => {});
  useEffect(() => {
    if (!can("notifications.read")) return;
    void load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.activeOrg?.id]);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="relative" aria-label="Notifications" />}>
        <Bell className="size-[18px]" />
        {data.unread > 0 && (
          <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-4 text-white">{data.unread}</span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between">
            Notifications
            {data.unread > 0 && (
              <button className="text-xs font-normal text-primary" onClick={() => api("/notifications/read-all", { method: "POST" }).then(load)}>
                Mark all read
              </button>
            )}
          </DropdownMenuLabel>
          {data.data.length === 0 && <div className="px-3 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</div>}
          {data.data.map((n) => (
            <DropdownMenuItem key={n.id} className="flex-col items-start gap-0.5" onClick={() => api(`/notifications/${n.id}/read`, { method: "POST" }).then(load)}>
              <span className={cn("text-sm", !n.readAt && "font-semibold")}>{n.title}</span>
              {n.body && <span className="text-xs text-muted-foreground">{n.body}</span>}
              <span className="text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountMenu() {
  const { me } = useSession();
  const router = useRouter();
  if (!me) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="h-9 gap-2 px-1.5" />}>
        <Avatar className="size-7">
          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(me.user.name)}</AvatarFallback>
        </Avatar>
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-[13px] font-medium">{me.user.name}</span>
          <span className="block text-[11px] text-muted-foreground">{me.role ? ROLE_LABEL[me.role] : me.user.isPlatformAdmin ? "Platform admin" : ""}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="text-sm font-medium text-foreground">{me.user.name}</div>
            <div className="truncate text-xs font-normal">{me.user.email}</div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/settings")}>
          <UserRound className="size-4" /> Organization settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/settings/security")}>
          <Shield className="size-4" /> Security &amp; MFA
          {!me.user.mfaEnabled && <span className="ml-auto rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">OFF</span>}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => api("/auth/logout", { method: "POST" }).finally(() => router.replace("/login"))}>
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { me, loading } = useSession();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!me) router.replace("/login");
    else if (me.mfaPending) router.replace("/mfa");
    else if (me.mfaSetupRequired && path !== "/settings/security") router.replace("/settings/security");
  }, [me, loading, path, router]);

  if (loading || !me || me.mfaPending) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-64 lg:block">
        <Sidebar />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 border-0 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        {me.breakGlass && (
          <div className="flex items-center gap-2 bg-amber-500 px-4 py-1.5 text-sm font-medium text-amber-950">
            <ShieldAlert className="size-4" /> Break-glass access active — every action is audited.
          </div>
        )}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur md:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Menu">
            <Menu className="size-5" />
          </Button>
          <OrgSwitcher />
          <form
            className="relative ml-2 hidden max-w-md flex-1 md:block"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title, ISRC, UPC, ISWC, party…"
              className="h-9 w-full rounded-lg border bg-muted/40 pl-9 pr-3 text-sm outline-none transition focus:bg-background focus:ring-3 focus:ring-ring/30"
            />
          </form>
          <div className="ml-auto flex items-center gap-1">
            <Bell_ />
            <AccountMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
