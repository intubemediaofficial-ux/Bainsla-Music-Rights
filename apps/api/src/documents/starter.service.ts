import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { templateVariables } from './render.service.js';
import { STARTER_TEMPLATES } from './starter-templates.js';

/** Keep platform starter templates present and current on every boot (idempotent). */
@Injectable()
export class StarterTemplatesService implements OnApplicationBootstrap {
  private log = new Logger('StarterTemplates');
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    try {
      await this.prisma.system(async (tx) => {
        for (const t of STARTER_TEMPLATES) {
          const existing = await tx.documentTemplate.findFirst({ where: { organizationId: null, isStarter: true, kind: t.kind, language: t.language, name: t.name } });
          const data = { body: t.body, variables: templateVariables(t.body) };
          if (!existing) await tx.documentTemplate.create({ data: { ...data, kind: t.kind, language: t.language, name: t.name, isStarter: true, status: 'DRAFT' } });
          else if (existing.body !== t.body) await tx.documentTemplate.update({ where: { id: existing.id }, data: { ...data, version: existing.version + 1 } });
        }
      });
    } catch (e) {
      this.log.warn(`Could not sync starter templates: ${(e as Error).message}`);
    }
  }
}
