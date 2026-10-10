"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Copy, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app-shell";
import { DataTable, Pill, Td } from "@/components/data-table";
import { Field, NativeSelect } from "@/components/field";
import { FormDialog, StateRows, TextArea, Toolbar } from "@/components/catalog";
import { StatusPill } from "@/components/documents";
import { api, errMsg, fmtDate } from "@/lib/api";
import { qs } from "@/lib/catalog";
import { LANG, Template, TEMPLATE_KIND } from "@/lib/documents";
import { useSession } from "@/lib/session";

const STARTER_BODY = `<h1>{{agreement.title}}</h1>
<p>Between {{#parties}}<b>{{name}}</b> ({{role}}){{/parties}}.</p>
<p>Territory: {{agreement.territories}} · Effective: {{agreement.effective_date}}</p>
<h2>Annexure-A</h2>
{{{annexure_table}}}
{{{signature_blocks}}}`;

export default function TemplatesPage() {
  const { can } = useSession();
  const router = useRouter();
  const [kind, setKind] = useState("");
  const [language, setLanguage] = useState("");
  const [rows, setRows] = useState<Template[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Template[]>(`/templates?${qs({ kind, language })}`).then(setRows, (e) => { toast.error(errMsg(e)); setRows([]); });
  }, [kind, language]);

  async function copy(t: Template) {
    try {
      const c = await api<Template>(`/templates/${t.id}/copy`, { method: "POST" });
      toast.success("Copied to your templates");
      router.push(`/templates/${c.id}`);
    } catch (e) {
      toast.error(errMsg(e));
    }
  }
  async function create(f: FormData) {
    setBusy(true);
    try {
      const t = await api<Template>("/templates", { json: { name: f.get("name"), kind: f.get("kind"), language: f.get("language"), body: f.get("body") } });
      router.push(`/templates/${t.id}`);
    } catch (e) {
      toast.error(errMsg(e));
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Templates"
        description="Lawyer-editable agreement and NOC templates in English and Hindi, with merge fields and review/approval."
        actions={can("documents.write") && <Button onClick={() => setOpen(true)}><Plus className="size-4" /> New template</Button>}
      />
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" /> Starter templates are examples only. Copy one, have qualified legal counsel review it, then approve it before using it for real agreements.
      </div>
      <Toolbar>
        <div className="w-44">
          <NativeSelect value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind">
            <option value="">All kinds</option>
            {Object.entries(TEMPLATE_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
        </div>
        <div className="w-44">
          <NativeSelect value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Language">
            <option value="">All languages</option>
            {Object.entries(LANG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
        </div>
      </Toolbar>
      <DataTable head={["Template", "Kind", "Language", "Version", "Status", "Updated", ""]}>
        <StateRows rows={rows} cols={7} empty="No templates." />
        {rows?.map((t) => (
          <tr key={t.id} className="hover:bg-muted/30">
            <Td className="font-medium"><Link href={`/templates/${t.id}`} className="hover:underline">{t.name}</Link> {t.isStarter && <Pill tone="sky">starter</Pill>}</Td>
            <Td className="text-xs">{TEMPLATE_KIND[t.kind] ?? t.kind}</Td>
            <Td className="text-xs">{LANG[t.language] ?? t.language}</Td>
            <Td className="text-xs">v{t.version}</Td>
            <Td><StatusPill status={t.status} /></Td>
            <Td className="text-xs">{fmtDate(t.updatedAt)}</Td>
            <Td className="text-right">{t.isStarter && can("documents.write") && <Button size="sm" variant="outline" onClick={() => void copy(t)}><Copy className="size-4" /> Copy</Button>}</Td>
          </tr>
        ))}
      </DataTable>
      <FormDialog open={open} onOpenChange={setOpen} title="New template" description="Use {{merge.fields}}, {{#parties}}…{{/parties}} sections and {{{annexure_table}}} / {{{signature_blocks}}}." onSubmit={(f) => void create(f)} busy={busy} wide>
        <Field label="Name" name="name" required />
        <div className="grid gap-4 sm:grid-cols-2">
          <NativeSelect label="Kind" name="kind" defaultValue="AGREEMENT">
            {Object.entries(TEMPLATE_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
          <NativeSelect label="Language" name="language" defaultValue="en">
            {Object.entries(LANG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
        </div>
        <TextArea label="HTML body" name="body" rows={10} defaultValue={STARTER_BODY} required className="font-mono" />
      </FormDialog>
    </>
  );
}
