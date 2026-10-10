import { Global, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

/**
 * The runtime DB role is NOT the table owner, so Postgres row-level security applies.
 * Tenant rows are only visible inside `tenant(orgId, …)`, which sets `app.org_id`
 * for the transaction. `system(…)` sets `app.bypass_rls` and must only be used for
 * auth, platform administration and background jobs that are not tenant-initiated.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  tenant<T>(orgId: string, fn: (tx: Tx) => Promise<T>, opts: { timeout?: number } = {}): Promise<T> {
    if (!orgId) throw new Error('tenant() requires an organization id');
    return this.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.org_id', ${orgId}, true)`;
        return fn(tx);
      },
      { timeout: opts.timeout ?? 30000, maxWait: 10000 },
    );
  }

  system<T>(fn: (tx: Tx) => Promise<T>, opts: { timeout?: number } = {}): Promise<T> {
    return this.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
        return fn(tx);
      },
      { timeout: opts.timeout ?? 30000, maxWait: 10000 },
    );
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
