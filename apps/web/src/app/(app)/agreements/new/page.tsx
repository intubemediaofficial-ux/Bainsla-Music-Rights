"use client";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { AgreementWizard, EMPTY_WIZARD } from "@/components/agreement-wizard";

export default function NewAgreementPage() {
  return (
    <>
      <div className="mb-2 text-sm text-muted-foreground"><Link href="/agreements" className="hover:underline">Agreements</Link> /</div>
      <PageHeader title="New agreement" description="Pick a template, add parties and songs, set the terms — then generate Hindi/English PDFs with Annexure-A." />
      <AgreementWizard initial={EMPTY_WIZARD} />
    </>
  );
}
