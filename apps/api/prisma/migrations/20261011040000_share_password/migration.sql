-- Password protection for secure share links (Argon2id hash)
ALTER TABLE "share_links" ADD COLUMN "passwordHash" TEXT;
