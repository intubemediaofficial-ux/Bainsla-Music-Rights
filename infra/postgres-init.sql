-- Runtime login role for local docker. It is NOT the table owner, so RLS is enforced.
CREATE ROLE mrc_app NOLOGIN;
CREATE ROLE mrc_app_login LOGIN PASSWORD 'mrc_app' IN ROLE mrc_app;
