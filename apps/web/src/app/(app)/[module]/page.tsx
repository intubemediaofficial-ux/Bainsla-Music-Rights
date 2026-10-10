"use client";
import { use } from "react";
import { notFound } from "next/navigation";
import { CheckCircle2, Hammer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/app-shell";
import { MODULE_INFO } from "@/components/nav";

export default function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = use(params);
  const info = MODULE_INFO[module];
  if (!info) notFound();
  return (
    <>
      <PageHeader title={info.title} description={info.text} />
      <Card className="overflow-hidden">
        <CardContent className="grid gap-8 p-8 md:grid-cols-[auto_1fr] md:items-center">
          <div className="grid size-20 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-lg shadow-violet-500/30">
            <Hammer className="size-9" />
          </div>
          <div>
            <div className="inline-flex rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700">Scheduled for Phase {info.phase}</div>
            <h2 className="mt-3 text-lg font-semibold">This module is being built next</h2>
            <p className="mt-1 text-sm text-muted-foreground">The database tables and permissions already exist; screens and APIs ship in Phase {info.phase}.</p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {info.bullets.map((b) => (
                <li key={b} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="size-4 text-emerald-600" /> {b}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
