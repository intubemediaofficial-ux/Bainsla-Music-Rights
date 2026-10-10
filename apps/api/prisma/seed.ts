/**
 * Synthetic demo data only. No real signatures, registrations or ownership proof.
 * Idempotent: safe to run multiple times.
 */
import { PrismaClient, Role } from '@prisma/client';
import { hashPassword } from '../src/common/password.js';

const prisma = new PrismaClient({ datasourceUrl: process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL });

const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL ?? 'intubemediaofficial@gmail.com').toLowerCase();
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe-Admin-2026';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Demo-Rights-2026';

const PLANS = [
  { code: 'artist', name: 'Artist', priceInrPaise: 49900, maxRecordings: 100, maxUsers: 1, maxStorageBytes: 1n * 1024n ** 3n, sortOrder: 1 },
  { code: 'studio', name: 'Studio', priceInrPaise: 149900, maxRecordings: 500, maxUsers: 5, maxStorageBytes: 10n * 1024n ** 3n, sortOrder: 2 },
  { code: 'label', name: 'Label', priceInrPaise: 399900, maxRecordings: 2000, maxUsers: 15, maxStorageBytes: 50n * 1024n ** 3n, sortOrder: 3 },
  { code: 'enterprise', name: 'Enterprise', priceInrPaise: null, maxRecordings: null, maxUsers: null, maxStorageBytes: null, sortOrder: 4, features: { sso: true, api: true, customQuote: true } },
];

const TENANTS = [
  {
    slug: 'bainsla-music',
    legalName: 'Bainsla Music (Pilot Tenant)',
    displayName: 'Bainsla Music',
    plan: 'label',
    brandColor: '#7c3aed',
    users: [
      { email: ADMIN_EMAIL, name: 'Platform Admin', role: Role.OWNER },
      { email: 'owner@bainsla.demo', name: 'Demo Owner', role: Role.OWNER },
      { email: 'rights@bainsla.demo', name: 'Demo Rights Manager', role: Role.RIGHTS_MANAGER, canApprove: true },
      { email: 'legal@bainsla.demo', name: 'Demo Legal Reviewer', role: Role.LEGAL_REVIEWER },
      { email: 'editor@bainsla.demo', name: 'Demo Catalog Editor', role: Role.CATALOG_EDITOR },
      { email: 'viewer@bainsla.demo', name: 'Demo Artist Viewer', role: Role.VIEWER },
    ],
    songs: [
      ['Demo Song — Mann Ki Baat', 'hi'], ['Demo Song — Rasiya Raat', 'raj'], ['Demo Song — Sawan Aaya', 'hi'],
      ['Demo Song — Gurjar Shaan', 'hi'], ['Demo Song — Bhakti Bhajan', 'hi'],
    ],
  },
  {
    slug: 'demo-studio',
    legalName: 'Sample Studio Pvt Ltd (Demo)',
    displayName: 'Sample Studio',
    plan: 'studio',
    brandColor: '#0ea5e9',
    users: [{ email: 'owner@studio.demo', name: 'Studio Owner', role: Role.OWNER }],
    songs: [['Studio Demo — Night Drive', 'en'], ['Studio Demo — Monsoon', 'hi']],
  },
];

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
    for (const p of PLANS) {
      await tx.plan.upsert({ where: { code: p.code }, update: p, create: p });
    }
    const adminHash = await hashPassword(ADMIN_PASSWORD);
    const demoHash = await hashPassword(DEMO_PASSWORD);
    await tx.user.upsert({
      where: { email: ADMIN_EMAIL },
      update: { isPlatformAdmin: true },
      create: { email: ADMIN_EMAIL, name: 'Platform Admin', passwordHash: adminHash, isPlatformAdmin: true },
    });

    for (const t of TENANTS) {
      const plan = await tx.plan.findUniqueOrThrow({ where: { code: t.plan } });
      const org = await tx.organization.upsert({
        where: { slug: t.slug },
        update: {},
        create: { slug: t.slug, legalName: t.legalName, displayName: t.displayName, planId: plan.id, status: 'ACTIVE', brandColor: t.brandColor },
      });
      await tx.subscription.upsert({
        where: { organizationId: org.id },
        update: {},
        create: { organizationId: org.id, planId: plan.id, status: 'ACTIVE' },
      });
      for (const u of t.users) {
        const user = await tx.user.upsert({
          where: { email: u.email },
          update: {},
          create: { email: u.email, name: u.name, passwordHash: demoHash },
        });
        await tx.membership.upsert({
          where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
          update: {},
          create: { organizationId: org.id, userId: user.id, role: u.role, canApproveOwnership: !!(u as { canApprove?: boolean }).canApprove },
        });
      }
      if ((await tx.musicalWork.count({ where: { organizationId: org.id } })) === 0) {
        const singer = await tx.party.create({ data: { organizationId: org.id, legalName: `${t.displayName} Demo Singer`, stageName: 'Demo Singer', types: ['SINGER', 'ARTIST'] } });
        const writer = await tx.party.create({ data: { organizationId: org.id, legalName: `${t.displayName} Demo Lyricist`, types: ['LYRICIST', 'WRITER'] } });
        const label = await tx.party.create({ data: { organizationId: org.id, legalName: t.legalName, types: ['LABEL', 'PUBLISHER'] } });
        let i = 0;
        for (const [title, language] of t.songs) {
          i++;
          const work = await tx.musicalWork.create({ data: { organizationId: org.id, title, language, genre: 'Folk' } });
          const rec = await tx.recording.create({
            data: { organizationId: org.id, workId: work.id, title, version: 'Original', durationSec: 180 + i * 7, language, isrc: `INZZZ26${t.slug === 'demo-studio' ? '9' : '0'}${String(i).padStart(4, '0')}` },
          });
          await tx.contribution.createMany({
            data: [
              { organizationId: org.id, partyId: writer.id, workId: work.id, role: 'LYRICIST' },
              { organizationId: org.id, partyId: singer.id, recordingId: rec.id, role: 'SINGER' },
            ],
          });
          await tx.rightsClaim.create({
            data: { organizationId: org.id, assetType: 'RECORDING', recordingId: rec.id, partyId: label.id, rightType: 'MASTER', sharePercent: 100, status: i === 1 ? 'REVIEWED' : 'ASSERTED', basis: 'Synthetic demo claim' },
          });
          if (i === 2) {
            await tx.rightsClaim.create({
              data: { organizationId: org.id, assetType: 'WORK', workId: work.id, partyId: writer.id, rightType: 'LYRICS', sharePercent: 100, status: 'DISPUTED', basis: 'Synthetic demo conflict' },
            });
          }
        }
      }
    }
  }, { timeout: 120000 });
  console.log(`Seed complete. Admin: ${ADMIN_EMAIL}`);
}

main().finally(() => prisma.$disconnect());
