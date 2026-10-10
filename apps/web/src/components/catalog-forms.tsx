"use client";
import { useEffect, useState } from "react";
import { Field, NativeSelect } from "@/components/field";
import { TextArea } from "@/components/catalog";
import { api } from "@/lib/api";
import { fmtDuration, isoDay, Page, parseDuration, PARTY_TYPES, RELEASE_TYPES, str, titleCase } from "@/lib/catalog";

type W = { title?: string; aliases?: string[]; language?: string | null; genre?: string | null; iswc?: string | null; lyricsExcerpt?: string | null; notes?: string | null };
export function WorkFields({ w }: { w?: W }) {
  return (
    <>
      <Field label="Title" name="title" required defaultValue={w?.title} />
      <Field label="Also known as" name="aliases" defaultValue={w?.aliases?.join(", ")} hint="Other spellings or titles, comma separated" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Language" name="language" defaultValue={w?.language ?? ""} placeholder="Hindi" />
        <Field label="Genre" name="genre" defaultValue={w?.genre ?? ""} placeholder="Folk" />
        <Field label="ISWC" name="iswc" defaultValue={w?.iswc ?? ""} placeholder="T-123.456.789-0" />
      </div>
      <TextArea label="Lyrics excerpt (optional)" name="lyricsExcerpt" defaultValue={w?.lyricsExcerpt ?? ""} />
      <TextArea label="Notes" name="notes" defaultValue={w?.notes ?? ""} />
    </>
  );
}
export const workPayload = (f: FormData) => ({
  title: String(f.get("title") ?? "").trim(),
  aliases: String(f.get("aliases") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  language: str(f, "language"), genre: str(f, "genre"), iswc: str(f, "iswc"), lyricsExcerpt: str(f, "lyricsExcerpt"), notes: str(f, "notes"),
});

type R = { title?: string; workId?: string | null; version?: string | null; isrc?: string | null; durationSec?: number | null; recordingDate?: string | null; language?: string | null; studioName?: string | null; notes?: string | null };
export function RecordingFields({ r, hideWork }: { r?: R; hideWork?: boolean }) {
  const [works, setWorks] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => {
    if (!hideWork) api<Page<{ id: string; title: string }>>("/works?limit=200").then((x) => setWorks(x.data), () => setWorks([]));
  }, [hideWork]);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
        <Field label="Title" name="title" required defaultValue={r?.title} />
        <Field label="Version" name="version" defaultValue={r?.version ?? ""} placeholder="Original / Remix / Unplugged" />
      </div>
      {!hideWork && (
        <NativeSelect label="Musical work (composition)" name="workId" defaultValue={r?.workId ?? ""}>
          <option value="">— Not linked yet —</option>
          {works.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
        </NativeSelect>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="ISRC" name="isrc" defaultValue={r?.isrc ?? ""} placeholder="IN-A1B-24-00001" />
        <Field label="Duration" name="duration" defaultValue={r?.durationSec ? fmtDuration(r.durationSec) : ""} placeholder="3:45" />
        <Field label="Recorded on" name="recordingDate" type="date" defaultValue={isoDay(r?.recordingDate)} />
        <Field label="Language" name="language" defaultValue={r?.language ?? ""} />
        <Field label="Studio" name="studioName" defaultValue={r?.studioName ?? ""} />
      </div>
      <TextArea label="Notes" name="notes" defaultValue={r?.notes ?? ""} />
      <p className="text-xs text-muted-foreground">An ISRC identifies the recording; it does not prove who owns it.</p>
    </>
  );
}
export function recordingPayload(f: FormData) {
  const d = parseDuration(f.get("duration"));
  if (Number.isNaN(d)) throw new Error("Duration should be like 3:45");
  return {
    title: String(f.get("title") ?? "").trim(), version: str(f, "version"), isrc: str(f, "isrc"), durationSec: d,
    recordingDate: str(f, "recordingDate"), language: str(f, "language"), studioName: str(f, "studioName"), notes: str(f, "notes"),
    ...(f.has("workId") ? { workId: str(f, "workId") } : {}),
  };
}

type Rel = { title?: string; type?: string; upc?: string | null; releaseDate?: string | null; labelName?: string | null; notes?: string | null };
export function ReleaseFields({ r }: { r?: Rel }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
        <Field label="Title" name="title" required defaultValue={r?.title} />
        <NativeSelect label="Type" name="type" defaultValue={r?.type ?? "SINGLE"}>
          {RELEASE_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
        </NativeSelect>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="UPC / EAN" name="upc" defaultValue={r?.upc ?? ""} placeholder="12 or 13 digits" />
        <Field label="Release date" name="releaseDate" type="date" defaultValue={isoDay(r?.releaseDate)} />
        <Field label="Label" name="labelName" defaultValue={r?.labelName ?? ""} />
      </div>
      <TextArea label="Notes" name="notes" defaultValue={r?.notes ?? ""} />
    </>
  );
}
export const releasePayload = (f: FormData) => ({
  title: String(f.get("title") ?? "").trim(), type: f.get("type"), upc: str(f, "upc"), releaseDate: str(f, "releaseDate"), labelName: str(f, "labelName"), notes: str(f, "notes"),
});

type P = { legalName?: string; stageName?: string | null; types?: string[]; email?: string | null; phone?: string | null; address?: string | null; notes?: string | null; identifiers?: { ipi?: string | null; iprsId?: string | null; ifsc?: string | null; panMasked?: string | null; bankMasked?: string | null } };
export function PartyFields({ p }: { p?: P }) {
  const ids = p?.identifiers;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Legal name" name="legalName" required defaultValue={p?.legalName} />
        <Field label="Stage / brand name" name="stageName" defaultValue={p?.stageName ?? ""} />
      </div>
      <div>
        <div className="mb-1.5 text-sm font-medium">Type</div>
        <div className="flex flex-wrap gap-2">
          {PARTY_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs has-[:checked]:border-violet-500 has-[:checked]:bg-violet-50">
              <input type="checkbox" name="types" value={t} defaultChecked={p?.types?.includes(t)} className="size-3.5" /> {titleCase(t)}
            </label>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" name="email" type="email" defaultValue={p?.email ?? ""} />
        <Field label="Phone" name="phone" defaultValue={p?.phone ?? ""} />
      </div>
      <Field label="Address" name="address" defaultValue={p?.address ?? ""} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="IPI" name="ipi" defaultValue={ids?.ipi ?? ""} />
        <Field label="IPRS member ID" name="iprsId" defaultValue={ids?.iprsId ?? ""} />
        <Field label="IFSC" name="ifsc" defaultValue={ids?.ifsc ?? ""} />
        <Field label="PAN" name="pan" placeholder={ids?.panMasked ?? "ABCDE1234F"} hint={ids?.panMasked ? "Leave blank to keep" : "Encrypted; only last 4 shown"} />
        <Field label="Bank account" name="bankAccount" placeholder={ids?.bankMasked ?? ""} hint={ids?.bankMasked ? "Leave blank to keep" : "Encrypted; only last 4 shown"} />
      </div>
      <TextArea label="Notes" name="notes" defaultValue={p?.notes ?? ""} />
    </>
  );
}
export function partyPayload(f: FormData, editing = false) {
  const out: Record<string, unknown> = {
    legalName: String(f.get("legalName") ?? "").trim(), stageName: str(f, "stageName"), types: f.getAll("types"),
    email: str(f, "email"), phone: str(f, "phone"), address: str(f, "address"), notes: str(f, "notes"),
    ipi: str(f, "ipi"), iprsId: str(f, "iprsId"), ifsc: str(f, "ifsc"),
  };
  for (const k of ["pan", "bankAccount"]) {
    const v = str(f, k);
    if (v || !editing) out[k] = v;
  }
  return out;
}
