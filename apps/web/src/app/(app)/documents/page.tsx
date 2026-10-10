"use client";
import { useState } from "react";
import { FileUp, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app-shell";
import { NativeSelect } from "@/components/field";
import { LoadMore, SearchBox, Toolbar, useList } from "@/components/catalog";
import { DocumentsTable, UploadDialog } from "@/components/documents";
import { qs } from "@/lib/catalog";
import { CATEGORIES, CATEGORY_LABEL, Doc, DOC_STATUS } from "@/lib/documents";
import { useSession } from "@/lib/session";
import { useRouter } from "next/navigation";

export default function DocumentsPage() {
  const { can } = useSession();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const list = useList<Doc>("/documents", qs({ q, status, category }));
  const counts = (list.extra.counts ?? {}) as Record<string, number>;
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader
        title="Documents"
        description="Private evidence vault — signed agreements, NOCs, certificates and proofs. Every file is encrypted, SHA-256 checksummed and versioned."
        actions={can("documents.write") && <Button onClick={() => setOpen(true)}><FileUp className="size-4" /> Upload</Button>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {["", "DRAFT", "UNDER_REVIEW", "SENT_FOR_SIGNATURE", "EXECUTED", "REJECTED", "SUPERSEDED", "EXPIRED"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${status === s ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
          >
            {s ? DOC_STATUS[s].label : "All"}
            {s && counts[s] ? <span className="ml-1 opacity-70">{counts[s]}</span> : null}
          </button>
        ))}
      </div>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search title, signatory or file name…" />
        <div className="w-48">
          <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </NativeSelect>
        </div>
      </Toolbar>
      <DocumentsTable rows={list.rows} />
      <LoadMore next={list.next} onMore={() => void list.more()} />
      <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Lock className="size-3.5" /> Files are never public. Downloads use signed links that expire after 5 minutes and are checksum-verified.</p>
      <UploadDialog open={open} onOpenChange={setOpen} onDone={(r) => router.push(`/documents/${r.id}`)} />
    </>
  );
}
