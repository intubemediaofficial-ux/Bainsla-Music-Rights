"use client";
import Link from "next/link";
import { use } from "react";
import { PageHeader } from "@/components/app-shell";
import { DetailSkeleton, useFetch } from "@/components/catalog";
import { AgreementWizard, fromAgreement } from "@/components/agreement-wizard";

export default function EditAgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error } = useFetch<Parameters<typeof fromAgreement>[0] & { locked: boolean }>(`/agreements/${id}`);
  if (!data) return <DetailSkeleton error={error} />;
  return (
    <>
      <div className="mb-2 text-sm text-muted-foreground"><Link href="/agreements" className="hover:underline">Agreements</Link> / <Link href={`/agreements/${id}`} className="hover:underline">{data.title}</Link> /</div>
      <PageHeader title="Edit agreement" />
      {data.locked ? <p className="text-sm text-muted-foreground">This agreement is executed and locked.</p> : <AgreementWizard initial={fromAgreement(data)} agreementId={id} />}
    </>
  );
}
