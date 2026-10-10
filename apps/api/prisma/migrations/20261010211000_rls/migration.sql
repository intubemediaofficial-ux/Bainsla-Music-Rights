-- Row-level tenant isolation. The API connects as a member of mrc_app (not the
-- table owner), so every query on these tables is filtered by app.org_id, which
-- PrismaService.tenant() sets per transaction. app.bypass_rls is only set by
-- PrismaService.system() for auth/platform/background work.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mrc_app') THEN
    CREATE ROLE mrc_app NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO mrc_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mrc_app;
REVOKE ALL ON TABLE "_prisma_migrations" FROM mrc_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mrc_app;

CREATE OR REPLACE FUNCTION mrc_current_org() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.org_id', true), '') $$;
CREATE OR REPLACE FUNCTION mrc_bypass() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT coalesce(current_setting('app.bypass_rls', true), '') = 'on' $$;

ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "memberships" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "record_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "record_assignments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "record_assignments" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "parties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parties" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "parties" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "musical_works" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "musical_works" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "musical_works" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "recordings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recordings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "recordings" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "releases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "releases" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "releases" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "release_tracks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "release_tracks" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "release_tracks" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "contributions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contributions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "contributions" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "rights_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rights_claims" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "rights_claims" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "rights_transfers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rights_transfers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "rights_transfers" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "licenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "licenses" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "licenses" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "agreements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agreements" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "agreements" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "agreement_parties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agreement_parties" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "agreement_parties" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "agreement_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agreement_assets" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "agreement_assets" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documents" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "documents" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "document_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_versions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "document_versions" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "registrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "registrations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "registrations" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "disputes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "disputes" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "disputes" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "dispute_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dispute_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "dispute_events" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "verification_packages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "verification_packages" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "verification_packages" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "share_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "share_links" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "share_links" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "share_link_accesses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "share_link_accesses" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "share_link_accesses" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_logs" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notifications" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "subscriptions" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "invoices" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "usage_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usage_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "usage_records" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "import_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "import_batches" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "import_batches" USING ("organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());

ALTER TABLE "document_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_templates" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "document_templates" USING ("organizationId" IS NULL OR "organizationId" = mrc_current_org() OR mrc_bypass()) WITH CHECK ("organizationId" = mrc_current_org() OR mrc_bypass());


-- Audit log is append-only.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "audit_logs" FROM mrc_app;
CREATE OR REPLACE FUNCTION mrc_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END $$;
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION mrc_audit_immutable();
