"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DataTable, Pill, Td } from "@/components/data-table";
import { Field, NativeSelect } from "@/components/field";
import { TextArea } from "@/components/catalog";
import { api, errMsg } from "@/lib/api";
import { isoDay, Page, PartyLite, partyName } from "@/lib/catalog";
import { AGREEMENT_TYPE, LANG, Template } from "@/lib/documents";

export type WizardParty = { partyId: string; role: string; signatoryName: string };
export type WizardAsset = { workId?: string; recordingId?: string; title: string; code: string | null; kind: "Work" | "Recording" };
export type WizardValue = {
  type: string; title: string; templateId: string; languages: string[]; territories: string; effectiveDate: string; expiryDate: string;
  amount: string; currency: string; terms: string; warranties: string; governing_law: string; jurisdiction: string; additional: string;
  parties: WizardParty[]; assets: WizardAsset[];
};
export const EMPTY_WIZARD: WizardValue = {
  type: "ASSIGNMENT", title: "", templateId: "", languages: ["en", "hi"], territories: "WW", effectiveDate: "", expiryDate: "",
  amount: "", currency: "INR", terms: "", warranties: "", governing_law: "India", jurisdiction: "", additional: "", parties: [], assets: [],
};
const ROLES = ["ASSIGNOR", "ASSIGNEE", "LICENSOR", "LICENSEE", "WITNESS", "PUBLISHER", "ARTIST", "PRODUCER", "LABEL"];
const STEPS = ["Basics", "Parties", "Songs (Annexure-A)", "Terms", "Review"];

export function toPayload(v: WizardValue) {
  return {
    type: v.type, title: v.title.trim(), templateId: v.templateId || null, languages: v.languages,
    territories: v.territories.split(/[\s,]+/).map((t) => t.trim().toUpperCase()).filter(Boolean),
    effectiveDate: v.effectiveDate || null, expiryDate: v.expiryDate || null,
    consideration: { ...(v.amount ? { amount: Number(v.amount) } : {}), currency: v.currency || "INR", terms: v.terms },
    clauses: { warranties: v.warranties, governing_law: v.governing_law, jurisdiction: v.jurisdiction, additional: v.additional },
    parties: v.parties.map((p) => ({ partyId: p.partyId, role: p.role, signatoryName: p.signatoryName || null })),
    assets: v.assets.map((a) => (a.workId ? { workId: a.workId } : { recordingId: a.recordingId })),
  };
}

type Hit = { id: string; title: string; isrc?: string | null; iswc?: string | null; version?: string | null };

function SongPicker({ value, onChange }: { value: WizardAsset[]; onChange: (a: WizardAsset[]) => void }) {
  const [kind, setKind] = useState<"RECORDING" | "WORK">("RECORDING");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      api<Page<Hit>>(`/${kind === "WORK" ? "works" : "recordings"}?limit=100${q ? `&q=${encodeURIComponent(q)}` : ""}`).then((r) => setHits(r.data), () => setHits([]));
    }, 200);
    return () => clearTimeout(t);
  }, [kind, q]);
  const has = (h: Hit) => value.some((a) => (kind === "WORK" ? a.workId === h.id : a.recordingId === h.id));
  const asAsset = (h: Hit): WizardAsset => kind === "WORK"
    ? { workId: h.id, title: h.title, code: h.iswc ?? null, kind: "Work" }
    : { recordingId: h.id, title: `${h.title}${h.version ? ` (${h.version})` : ""}`, code: h.isrc ?? null, kind: "Recording" };
  const toggle = (h: Hit) => onChange(has(h) ? value.filter((a) => (kind === "WORK" ? a.workId !== h.id : a.recordingId !== h.id)) : [...value, asAsset(h)]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="grid content-start gap-3">
        <div className="flex gap-2">
          <div className="w-40"><NativeSelect value={kind} onChange={(e) => setKind(e.target.value as "WORK" | "RECORDING")} aria-label="Type"><option value="RECORDING">Recordings</option><option value="WORK">Musical works</option></NativeSelect></div>
          <div className="relative flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, ISRC…" className="h-10 pl-9" /></div>
        </div>
        <div className="max-h-96 overflow-y-auto rounded-lg border">
          {hits === null ? <p className="p-4 text-sm text-muted-foreground">Loading…</p> : hits.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nothing found.</p> : hits.map((h) => (
            <button key={h.id} type="button" onClick={() => toggle(h)} className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/50">
              <span><span className="font-medium">{h.title}</span>{h.version ? <span className="text-muted-foreground"> ({h.version})</span> : null}<span className="ml-2 font-mono text-xs text-muted-foreground">{h.isrc ?? h.iswc ?? ""}</span></span>
              <span className={`grid size-5 place-items-center rounded border ${has(h) ? "border-primary bg-primary text-primary-foreground" : ""}`}>{has(h) && <Check className="size-3.5" />}</span>
            </button>
          ))}
        </div>
        {hits && hits.length > 0 && <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, ...hits.filter((h) => !has(h)).map(asAsset)])}><Plus className="size-4" /> Add all {hits.length} shown</Button>}
      </div>
      <div className="grid content-start gap-2">
        <div className="text-sm font-medium">Annexure-A ({value.length} {value.length === 1 ? "song" : "songs"})</div>
        <ol className="max-h-[26rem] overflow-y-auto rounded-lg border">
          {value.length === 0 && <li className="p-4 text-sm text-muted-foreground">Select songs on the left.</li>}
          {value.map((a, i) => (
            <li key={`${a.workId ?? a.recordingId}`} className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm last:border-0">
              <span><span className="mr-2 text-xs text-muted-foreground">{i + 1}.</span>{a.title} <Pill tone={a.kind === "Work" ? "violet" : "sky"}>{a.kind}</Pill> <span className="font-mono text-xs text-muted-foreground">{a.code}</span></span>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export function AgreementWizard({ initial, agreementId }: { initial: WizardValue; agreementId?: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [v, setV] = useState<WizardValue>(initial);
  const [parties, setParties] = useState<PartyLite[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof WizardValue>(k: K, val: WizardValue[K]) => setV((p) => ({ ...p, [k]: val }));
  useEffect(() => {
    api<Page<PartyLite>>("/parties?limit=200").then((r) => setParties(r.data), () => setParties([]));
    api<Template[]>("/templates?kind=AGREEMENT").then(setTemplates, () => setTemplates([]));
  }, []);
  const partyById = useMemo(() => new Map(parties.map((p) => [p.id, p])), [parties]);

  function next() {
    if (step === 0 && v.title.trim().length < 2) return toast.error("Give the agreement a title");
    if (step === 0 && !v.languages.length) return toast.error("Pick at least one language");
    if (step === 1 && v.parties.some((p) => !p.partyId)) return toast.error("Choose a party for every row");
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  async function save() {
    setBusy(true);
    try {
      const r = await api<{ id: string }>(agreementId ? `/agreements/${agreementId}` : "/agreements", { method: agreementId ? "PATCH" : "POST", json: toPayload(v) });
      toast.success(agreementId ? "Agreement updated" : "Agreement created");
      router.push(`/agreements/${r.id ?? agreementId}`);
    } catch (e) {
      toast.error(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <ol className="grid grid-cols-5 gap-2">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button type="button" onClick={() => i < step && setStep(i)} className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition ${i === step ? "border-primary bg-primary/5 font-semibold text-primary" : i < step ? "hover:bg-muted" : "text-muted-foreground"}`}>
              <span className="block text-[10px] uppercase tracking-wide opacity-70">Step {i + 1}</span>{s}
            </button>
          </li>
        ))}
      </ol>
      <Card>
        <CardContent className="grid gap-5 p-6">
          {step === 0 && (
            <>
              <Field label="Agreement title" value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Copyright assignment — 2026 singles" required />
              <div className="grid gap-4 sm:grid-cols-2">
                <NativeSelect label="Agreement type" value={v.type} onChange={(e) => set("type", e.target.value)}>
                  {Object.entries(AGREEMENT_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </NativeSelect>
                <NativeSelect label="Template" value={v.templateId} onChange={(e) => set("templateId", e.target.value)}>
                  <option value="">Automatic (best approved template per language)</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.language.toUpperCase()} · v{t.version}{t.status === "APPROVED_TEMPLATE" ? " ✓" : t.isStarter ? " (starter)" : ` (${t.status.toLowerCase()})`}</option>)}
                </NativeSelect>
                <Field label="Territories" value={v.territories} onChange={(e) => set("territories", e.target.value)} hint="WW = worldwide, or ISO codes like IN, US" />
                <div className="space-y-1.5">
                  <div className="text-sm font-medium">Languages</div>
                  <div className="flex gap-4 pt-2">
                    {Object.entries(LANG).map(([k, l]) => (
                      <label key={k} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={v.languages.includes(k)} onChange={(e) => set("languages", e.target.checked ? [...v.languages, k] : v.languages.filter((x) => x !== k))} /> {l}
                      </label>
                    ))}
                  </div>
                </div>
                <Field label="Effective date" type="date" value={v.effectiveDate} onChange={(e) => set("effectiveDate", e.target.value)} />
                <Field label="Expiry date" type="date" value={v.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} hint="Leave blank for perpetual" />
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <p className="text-sm text-muted-foreground">Who is signing? Add every party with their role (e.g. lyricist as Assignor, label as Assignee). Add new people from <Link href="/parties" className="text-primary hover:underline">Parties</Link>.</p>
              <DataTable head={["Party", "Role", "Authorised signatory", ""]}>
                {v.parties.map((p, i) => (
                  <tr key={i}>
                    <Td><NativeSelect value={p.partyId} aria-label="Party" onChange={(e) => set("parties", v.parties.map((x, j) => (j === i ? { ...x, partyId: e.target.value } : x)))}><option value="">Choose…</option>{parties.map((o) => <option key={o.id} value={o.id}>{partyName(o)}</option>)}</NativeSelect></Td>
                    <Td><NativeSelect value={p.role} aria-label="Role" onChange={(e) => set("parties", v.parties.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}>{ROLES.map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}</NativeSelect></Td>
                    <Td><Input className="h-10" value={p.signatoryName} placeholder="If signing for a company" onChange={(e) => set("parties", v.parties.map((x, j) => (j === i ? { ...x, signatoryName: e.target.value } : x)))} /></Td>
                    <Td><Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => set("parties", v.parties.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button></Td>
                  </tr>
                ))}
              </DataTable>
              <Button type="button" variant="outline" className="justify-self-start" onClick={() => set("parties", [...v.parties, { partyId: "", role: v.parties.length ? "ASSIGNEE" : "ASSIGNOR", signatoryName: "" }])}><Plus className="size-4" /> Add party</Button>
            </>
          )}
          {step === 2 && <SongPicker value={v.assets} onChange={(a) => set("assets", a)} />}
          {step === 3 && (
            <>
              <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                <Field label="Consideration amount" type="number" min="0" step="0.01" value={v.amount} onChange={(e) => set("amount", e.target.value)} />
                <Field label="Currency" value={v.currency} maxLength={3} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
              </div>
              <TextArea label="Payment terms" value={v.terms} onChange={(e) => set("terms", e.target.value)} />
              <TextArea label="Warranties" value={v.warranties} onChange={(e) => set("warranties", e.target.value)} placeholder="e.g. The assignor warrants that the works are original and free of third-party claims." />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Governing law" value={v.governing_law} onChange={(e) => set("governing_law", e.target.value)} />
                <Field label="Jurisdiction (courts at)" value={v.jurisdiction} onChange={(e) => set("jurisdiction", e.target.value)} placeholder="e.g. Jaipur" />
              </div>
              <TextArea label="Additional terms" value={v.additional} onChange={(e) => set("additional", e.target.value)} rows={4} />
            </>
          )}
          {step === 4 && (
            <div className="grid gap-4 text-sm">
              <dl className="grid gap-3 sm:grid-cols-3">
                {[
                  ["Title", v.title], ["Type", AGREEMENT_TYPE[v.type]], ["Languages", v.languages.map((l) => LANG[l]).join(", ")],
                  ["Territories", v.territories], ["Effective", v.effectiveDate || "—"], ["Expiry", v.expiryDate || "perpetual"],
                  ["Consideration", v.amount ? `${v.currency} ${Number(v.amount).toLocaleString("en-IN")}` : "—"], ["Jurisdiction", v.jurisdiction || "—"],
                  ["Template", templates.find((t) => t.id === v.templateId)?.name ?? "Automatic"],
                ].map(([k, val]) => <div key={k}><dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt><dd className="mt-1 font-medium">{val}</dd></div>)}
              </dl>
              <div><div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Parties ({v.parties.length})</div>{v.parties.map((p, i) => <div key={i}>{partyName(partyById.get(p.partyId))} — {p.role.toLowerCase()}</div>)}</div>
              <div><div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Annexure-A ({v.assets.length} songs)</div>{v.assets.slice(0, 15).map((a, i) => <div key={i}>{i + 1}. {a.title} <span className="font-mono text-xs text-muted-foreground">{a.code}</span></div>)}{v.assets.length > 15 && <div className="text-muted-foreground">…and {v.assets.length - 15} more</div>}</div>
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Saving creates a draft. Generate PDFs on the next screen, get them signed, upload the signed copy and mark it executed — only then does it count as evidence.</p>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="flex justify-between">
        <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}><ChevronLeft className="size-4" /> Back</Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={next}>Next <ChevronRight className="size-4" /></Button>
        ) : (
          <Button type="button" disabled={busy} onClick={() => void save()}>{busy && <Loader2 className="size-4 animate-spin" />} {agreementId ? "Save changes" : "Create agreement"}</Button>
        )}
      </div>
    </div>
  );
}

type Loaded = {
  type: string; title: string; templateId: string | null; languages: string[]; territories: string[]; effectiveDate: string | null; expiryDate: string | null;
  consideration: { amount?: number; currency?: string; terms?: string } | null; clauses: Record<string, string> | null;
  parties: { partyId: string; role: string; signatoryName: string | null }[];
  assets: { workId: string | null; recordingId: string | null; work: { title: string; iswc: string | null } | null; recording: { title: string; isrc: string | null; version?: string | null } | null }[];
};
export function fromAgreement(a: Loaded): WizardValue {
  const c = a.consideration ?? {};
  const cl = a.clauses ?? {};
  return {
    type: a.type, title: a.title, templateId: a.templateId ?? "", languages: a.languages, territories: a.territories.join(", "),
    effectiveDate: isoDay(a.effectiveDate), expiryDate: isoDay(a.expiryDate), amount: c.amount != null ? String(c.amount) : "", currency: c.currency ?? "INR", terms: c.terms ?? "",
    warranties: cl.warranties ?? "", governing_law: cl.governing_law ?? "India", jurisdiction: cl.jurisdiction ?? "", additional: cl.additional ?? "",
    parties: a.parties.map((p) => ({ partyId: p.partyId, role: p.role, signatoryName: p.signatoryName ?? "" })),
    assets: a.assets.map((x) => x.workId
      ? { workId: x.workId, title: x.work?.title ?? "", code: x.work?.iswc ?? null, kind: "Work" as const }
      : { recordingId: x.recordingId ?? undefined, title: `${x.recording?.title ?? ""}${x.recording?.version ? ` (${x.recording.version})` : ""}`, code: x.recording?.isrc ?? null, kind: "Recording" as const }),
  };
}
