"use client";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Td } from "@/components/data-table";
import { api, fmtDate } from "@/lib/api";

type Row = { id: string; action: string; entityType: string; entityId: string | null; actorEmail: string | null; summary: unknown; ip: string | null; createdAt: string; organizationId?: string | null };

export function AuditTable({ endpoint }: { endpoint: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ action: "", actorEmail: "", entityType: "" });
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(
    async (after?: string) => {
      setLoading(true);
      const qs = new URLSearchParams({ limit: "50" });
      if (after) qs.set("cursor", after);
      Object.entries(filter).forEach(([k, v]) => v && qs.set(k, v));
      try {
        const r = await api<{ data: Row[]; nextCursor: string | null }>(`${endpoint}?${qs}`);
        setRows((prev) => (after ? [...prev, ...r.data] : r.data));
        setCursor(r.nextCursor);
      } finally {
        setLoading(false);
      }
    },
    [endpoint, filter],
  );
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setFilter({ action: String(f.get("action") ?? ""), actorEmail: String(f.get("actorEmail") ?? ""), entityType: String(f.get("entityType") ?? "") });
        }}
      >
        {[
          ["action", "Action (e.g. auth.login)"],
          ["actorEmail", "Actor email"],
          ["entityType", "Entity type"],
        ].map(([n, p]) => (
          <input key={n} name={n} placeholder={p} className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-3 focus:ring-ring/30" />
        ))}
        <Button type="submit" variant="outline" className="h-9">
          Filter
        </Button>
      </form>
      <DataTable head={["When", "Actor", "Action", "Entity", "IP"]}>
        {rows.map((r) => (
          <>
            <tr key={r.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setOpen(open === r.id ? null : r.id)}>
              <Td className="whitespace-nowrap text-muted-foreground">{fmtDate(r.createdAt, true)}</Td>
              <Td>{r.actorEmail ?? "system"}</Td>
              <Td>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.action}</code>
              </Td>
              <Td className="text-muted-foreground">
                {r.entityType}
                {r.entityId && <span className="ml-1 font-mono text-[11px]">#{r.entityId.slice(-6)}</span>}
              </Td>
              <Td className="font-mono text-xs text-muted-foreground">{r.ip ?? "—"}</Td>
            </tr>
            {open === r.id && (
              <tr key={r.id + "-d"} className="bg-muted/20">
                <Td colSpan={5}>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs">{JSON.stringify(r.summary, null, 2)}</pre>
                </Td>
              </tr>
            )}
          </>
        ))}
        {!loading && rows.length === 0 && (
          <tr>
            <Td colSpan={5} className="py-10 text-center text-muted-foreground">
              No audit events match.
            </Td>
          </tr>
        )}
      </DataTable>
      <div className="flex justify-center">
        {loading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : (
          cursor && (
            <Button variant="outline" onClick={() => load(cursor)}>
              Load more
            </Button>
          )
        )}
      </div>
    </div>
  );
}
