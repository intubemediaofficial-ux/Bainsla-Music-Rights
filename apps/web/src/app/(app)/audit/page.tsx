"use client";
import { PageHeader } from "@/components/app-shell";
import { AuditTable } from "@/components/audit-table";

export default function AuditPage() {
  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of every sign-in, change, export and access in this organization." />
      <AuditTable endpoint="/audit-logs" />
    </>
  );
}
