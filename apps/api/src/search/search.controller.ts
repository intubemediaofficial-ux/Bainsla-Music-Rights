import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';
import { Auth, type OrgContext, RequirePermission } from '../auth/context.js';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission('catalog.read')
  search(@Auth() auth: OrgContext, @Query('q') q = '') {
    const term = q.trim().slice(0, 100);
    if (term.length < 2) return { works: [], recordings: [], releases: [], parties: [] };
    const org = auth.orgId;
    const c = { contains: term, mode: 'insensitive' as const };
    return this.prisma.tenant(org, async (tx) => {
      const [works, recordings, releases, parties] = await Promise.all([
        tx.musicalWork.findMany({ where: { organizationId: org, OR: [{ title: c }, { aliases: { has: term } }, { iswc: c }] }, select: { id: true, title: true, language: true }, take: 6 }),
        tx.recording.findMany({ where: { organizationId: org, OR: [{ title: c }, { isrc: c }] }, select: { id: true, title: true, isrc: true, version: true }, take: 6 }),
        tx.release.findMany({ where: { organizationId: org, OR: [{ title: c }, { upc: c }] }, select: { id: true, title: true, upc: true }, take: 6 }),
        tx.party.findMany({ where: { organizationId: org, OR: [{ legalName: c }, { stageName: c }] }, select: { id: true, legalName: true, stageName: true, types: true }, take: 6 }),
      ]);
      return { works, recordings, releases, parties };
    });
  }
}
