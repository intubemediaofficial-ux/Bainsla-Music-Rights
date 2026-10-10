import {
  LayoutDashboard, Music, Disc3, Album, Users, Scale, KeyRound, FileSignature, FileText, LayoutTemplate,
  Landmark, Swords, PackageCheck, Share2, UsersRound, ScrollText, Settings, CreditCard, ShieldHalf, Upload,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; phase?: number; perm?: string };

export const NAV: { group: string; items: NavItem[] }[] = [
  { group: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    group: "Catalog",
    items: [
      { href: "/works", label: "Musical works", icon: Music, perm: "catalog.read" },
      { href: "/recordings", label: "Recordings", icon: Disc3, perm: "catalog.read" },
      { href: "/releases", label: "Releases", icon: Album, perm: "catalog.read" },
      { href: "/parties", label: "Parties", icon: Users, perm: "catalog.read" },
      { href: "/imports", label: "Bulk import", icon: Upload, perm: "catalog.import" },
    ],
  },
  {
    group: "Rights",
    items: [
      { href: "/rights", label: "Rights claims", icon: Scale, perm: "rights.read" },
      { href: "/licenses", label: "Licenses", icon: KeyRound, perm: "rights.read" },
    ],
  },
  {
    group: "Legal",
    items: [
      { href: "/agreements", label: "Agreements", icon: FileSignature, perm: "documents.read" },
      { href: "/documents", label: "Documents", icon: FileText, perm: "documents.read" },
      { href: "/templates", label: "Templates", icon: LayoutTemplate, perm: "documents.read" },
    ],
  },
  {
    group: "Compliance",
    items: [
      { href: "/registrations", label: "Registrations", icon: Landmark, perm: "registrations.read" },
      { href: "/disputes", label: "Disputes", icon: Swords, perm: "disputes.read" },
      { href: "/packages", label: "Verification packages", icon: PackageCheck, perm: "documents.read" },
      { href: "/shares", label: "Secure shares", icon: Share2, perm: "shares.manage" },
    ],
  },
  {
    group: "Organization",
    items: [
      { href: "/team", label: "Team", icon: UsersRound, perm: "members.read" },
      { href: "/audit", label: "Audit log", icon: ScrollText, perm: "audit.read" },
      { href: "/billing", label: "Billing & plan", icon: CreditCard, phase: 5, perm: "billing.manage" },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const PLATFORM_NAV: NavItem = { href: "/platform", label: "Platform admin", icon: ShieldHalf };

export const MODULE_INFO: Record<string, { title: string; phase: number; text: string; bullets: string[] }> = {
  works: { title: "Musical works", phase: 2, text: "Compositions (lyrics + music) kept separate from recordings.", bullets: ["ISWC, aliases, language, genre", "Writers/composers with share validation", "Duplicate detection"] },
  recordings: { title: "Recordings", phase: 2, text: "Sound recordings with ISRC, versions and performer credits.", bullets: ["ISRC uniqueness per tenant", "Link to musical work", "Master rights claims"] },
  releases: { title: "Releases", phase: 2, text: "Singles, EPs and albums with UPC and tracklists.", bullets: ["UPC per release", "Ordered tracks", "Release dates & territories"] },
  parties: { title: "Parties", phase: 2, text: "Singers, lyricists, composers, producers, labels and publishers.", bullets: ["Legal + stage names", "Encrypted PAN / bank fields", "Contribution history"] },
  imports: { title: "Bulk import", phase: 2, text: "CSV / XLSX catalog import with preview and row-level errors.", bullets: ["Column mapping", "Dry-run validation", "Idempotent batches"] },
  rights: { title: "Rights claims", phase: 2, text: "Who owns what share, of which right, where and when.", bullets: ["Asserted → reviewed → documented", "Overlap & >100% conflict detection", "Transfers with history"] },
  licenses: { title: "Licenses", phase: 2, text: "Outbound licenses with territory, term and expiry alerts.", bullets: ["Exclusive / non-exclusive", "Expiry reminders", "Linked agreements"] },
  agreements: { title: "Agreements", phase: 3, text: "Agreement wizard with bilingual templates, Annexure-A and NOC.", bullets: ["Version history, executed lock", "Annexure-A snapshot", "Hindi/English PDFs"] },
  documents: { title: "Documents", phase: 3, text: "Private, checksummed evidence storage with malware scan.", bullets: ["SHA-256 per version", "Signed download URLs", "Review workflow"] },
  templates: { title: "Templates", phase: 3, text: "Lawyer-editable agreement and NOC templates.", bullets: ["Hindi + English", "Merge fields", "Version control"] },
  registrations: { title: "Registrations", phase: 4, text: "Track copyright office / society registrations you file yourself.", bullets: ["Diary & registration numbers", "Status timeline", "No automated government filing"] },
  disputes: { title: "Disputes", phase: 4, text: "Claims, takedowns and conflicts with an event timeline.", bullets: ["Opponent & platform", "Evidence links", "Resolution tracking"] },
  packages: { title: "Verification packages", phase: 4, text: "PDF summary + ZIP with checksummed manifest of evidence.", bullets: ["Missing-document warnings", "INTERNALLY_REVIEWED / INCOMPLETE / DISPUTED", "Idempotent generation"] },
  shares: { title: "Secure shares", phase: 4, text: "Expiring, revocable links for lawyers and platforms.", bullets: ["Password + expiry", "Access log", "Watermarked downloads"] },
  billing: { title: "Billing & plan", phase: 5, text: "Plans, quotas, usage and GST invoices.", bullets: ["Artist / Studio / Label / Enterprise", "Usage metering", "Payment gateway webhooks"] },
};
