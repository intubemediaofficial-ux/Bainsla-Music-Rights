"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Album, Disc3, Loader2, Music, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app-shell";
import { api } from "@/lib/api";

type R = {
  works: { id: string; title: string; language: string | null }[];
  recordings: { id: string; title: string; isrc: string | null; version: string | null }[];
  releases: { id: string; title: string; upc: string | null }[];
  parties: { id: string; legalName: string; stageName: string | null; types: string[] }[];
};

function Inner() {
  const q = useSearchParams().get("q") ?? "";
  const [r, setR] = useState<R | null>(null);
  useEffect(() => {
    setR(null);
    api<R>(`/search?q=${encodeURIComponent(q)}`).then(setR, () => setR({ works: [], recordings: [], releases: [], parties: [] }));
  }, [q]);
  const groups = r
    ? [
        { title: "Musical works", icon: Music, items: r.works.map((w) => ({ id: w.id, main: w.title, sub: w.language ?? "" })) },
        { title: "Recordings", icon: Disc3, items: r.recordings.map((x) => ({ id: x.id, main: x.title, sub: [x.version, x.isrc].filter(Boolean).join(" · ") })) },
        { title: "Releases", icon: Album, items: r.releases.map((x) => ({ id: x.id, main: x.title, sub: x.upc ?? "" })) },
        { title: "Parties", icon: Users, items: r.parties.map((x) => ({ id: x.id, main: x.legalName, sub: [x.stageName, x.types.join(", ")].filter(Boolean).join(" · ") })) },
      ]
    : [];
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <>
      <PageHeader title={`Search: “${q}”`} description={r ? `${total} result${total === 1 ? "" : "s"} in this organization` : "Searching…"} />
      {!r ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.title}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <g.icon className="size-4 text-primary" /> {g.title}
                  <span className="text-xs font-normal text-muted-foreground">({g.items.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {g.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No matches.</p>
                ) : (
                  <ul className="divide-y">
                    {g.items.map((i) => (
                      <li key={i.id} className="py-2 text-sm">
                        <div className="font-medium">{i.main}</div>
                        {i.sub && <div className="font-mono text-xs text-muted-foreground">{i.sub}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
