import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { hashPassword } from '../src/common/password.js';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import type { Role } from '@prisma/client';

export const PASSWORD = 'Test-Password-123';

export async function createApp() {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication({ logger: false, rawBody: true });
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

export type Tenant = { orgId: string; users: Record<string, string>; recordingId: string; workId: string; songTitle: string };

/** Creates an isolated organization with one user per role and one synthetic song. */
export async function createTenant(prisma: PrismaService, tag: string, roles: Role[]): Promise<Tenant> {
  const suffix = `${tag.toLowerCase()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const hash = await hashPassword(PASSWORD);
  return prisma.system(async (tx) => {
    const org = await tx.organization.create({ data: { slug: `t-${suffix}`, legalName: `Tenant ${suffix}`, displayName: `Tenant ${tag}`, status: 'ACTIVE' } });
    const users: Record<string, string> = {};
    for (const role of roles) {
      const email = `${role.toLowerCase()}-${suffix}@test.local`;
      const u = await tx.user.create({ data: { email, name: `${role} ${tag}`, passwordHash: hash } });
      await tx.membership.create({ data: { organizationId: org.id, userId: u.id, role } });
      users[role] = email;
    }
    const songTitle = `Secret Song ${suffix}`;
    const work = await tx.musicalWork.create({ data: { organizationId: org.id, title: songTitle } });
    const rec = await tx.recording.create({ data: { organizationId: org.id, workId: work.id, title: songTitle, isrc: `ZZ${suffix.replace(/[^A-Z0-9]/gi, '').slice(0, 10).toUpperCase()}` } });
    return { orgId: org.id, users, recordingId: rec.id, workId: work.id, songTitle };
  });
}

export async function createPlatformAdmin(prisma: PrismaService) {
  const email = `padmin-${Date.now().toString(36)}@test.local`;
  const hash = await hashPassword(PASSWORD);
  await prisma.system((tx) => tx.user.create({ data: { email, name: 'Platform Admin', passwordHash: hash, isPlatformAdmin: true } }));
  return email;
}

/** Logs in and returns an agent that carries cookies and sends the CSRF header. */
export async function login(app: INestApplication, email: string, password = PASSWORD) {
  const agent = request.agent(app.getHttpServer());
  const res = await agent.post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200 && res.status !== 201) throw new Error(`login failed ${res.status} ${JSON.stringify(res.body)}`);
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const csrf = cookies.map((c) => /^mrc_csrf=([^;]+)/.exec(c)?.[1]).find(Boolean) ?? '';
  return { agent, csrf: decodeURIComponent(csrf), body: res.body };
}
