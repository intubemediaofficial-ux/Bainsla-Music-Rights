import Link from "next/link";
import { notFound } from "next/navigation";

const UPDATED = "10 October 2026";
const DOCS: Record<string, { title: string; sections: [string, string][] }> = {
  terms: {
    title: "Terms of Service",
    sections: [
      ["Service", "Music Rights Cloud is a record-keeping tool for musical works, sound recordings, ownership claims, agreements and evidence. It does not file anything with copyright offices, collecting societies or platforms on your behalf."],
      ["Not legal advice", "Templates, agreement drafts, NOCs and verification packages are starting drafts and internal summaries. They are not legal certification or a government registration. Have a qualified lawyer review documents before you rely on them. ISRC/ISWC/UPC identifiers do not by themselves prove ownership."],
      ["Your content", "You keep all rights in the data and files you upload. You confirm you are entitled to upload them. We process them only to provide the service."],
      ["Accounts", "Keep credentials and MFA devices safe. Organization owners control who has access to their workspace."],
      ["Plans and billing", "Plan prices and limits are shown in Billing & plan and may change with notice. Uploads or invites may be blocked when a plan limit is reached. Taxes (GST) are added as applicable."],
      ["Termination", "You can export your data at any time from Billing & plan. On closure we delete workspace data as described in the Privacy Policy, subject to backup retention."],
    ],
  },
  privacy: {
    title: "Privacy Policy",
    sections: [
      ["What we collect", "Account data (name, email, password hash, MFA status), organization details, catalog and rights records, uploaded documents, and security logs (IP address, user agent, audit events)."],
      ["Why", "To provide the service, secure accounts, prevent abuse, bill subscriptions and meet legal obligations. We do not sell personal data."],
      ["Sensitive identifiers", "PAN and bank details are encrypted at rest and shown only masked. Documents are stored encrypted in private storage and served through short-lived signed links."],
      ["Your rights (DPDP Act, 2023)", "You can request access, correction or erasure of your personal data and withdraw consent by writing to intubemediaofficial@gmail.com. Grievances are answered within 30 days."],
      ["Retention", "Data is kept while your workspace is active. Backups are retained per our backup policy and expire on their own schedule."],
      ["Sub-processors", "Hosting, email delivery and the payment gateway, used only to run the service."],
    ],
  },
  dpa: {
    title: "Data Processing Terms",
    sections: [
      ["Roles", "Your organization is the Data Fiduciary for personal data of artists, writers and other parties you record. Music Rights Cloud acts as Data Processor on your instructions."],
      ["Security", "Tenant isolation is enforced in the database (row-level security). Data is encrypted in transit (TLS) and files at rest (AES-256-GCM). Access is role-based and audit-logged."],
      ["Breach notice", "We will notify the organization owner without undue delay after becoming aware of a personal data breach affecting your workspace."],
      ["Deletion and return", "You can export your data at any time. On termination, workspace data is deleted, apart from backups, which expire on schedule."],
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const d = DOCS[doc];
  if (!d) notFound();
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-4 py-12">
      <article className="mx-auto max-w-3xl rounded-2xl border bg-white p-8 shadow-sm">
        <nav className="mb-6 flex flex-wrap gap-3 text-sm">
          {Object.entries(DOCS).map(([k, v]) => (
            <Link key={k} href={`/legal/${k}`} className={k === doc ? "font-semibold text-[var(--primary)]" : "text-muted-foreground hover:underline"}>{v.title}</Link>
          ))}
        </nav>
        <h1 className="text-3xl font-semibold tracking-tight">{d.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last updated {UPDATED} · Draft pending legal review</p>
        <div className="mt-8 space-y-6">
          {d.sections.map(([h, t]) => (
            <section key={h}><h2 className="text-lg font-semibold">{h}</h2><p className="mt-1 leading-relaxed text-slate-700">{t}</p></section>
          ))}
        </div>
        <p className="mt-10 border-t pt-4 text-xs text-muted-foreground">Contact: intubemediaofficial@gmail.com. <Link href="/signup" className="underline">Back to sign up</Link></p>
      </article>
    </main>
  );
}
