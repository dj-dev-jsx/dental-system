import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { type Prisma, PrismaClient } from '../generated/prisma/client.js';

// In Express you might export one shared `prisma` object from a file. Here Nest creates
// this class once and hands it to whoever asks for it ("dependency injection"), which
// lets tests swap it out, and lets Nest open and close the connection with the app.
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>('DATABASE_URL'),
      }),
      // The default error format can print the values passed to a query, which would put
      // patient details in the server logs.
      errorFormat: 'minimal',
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Runs `work` on behalf of one clinic. Patient data can only be reached through the `tx`
   * this passes in: without it, row-level security shows no rows at all.
   *
   * It's one transaction, for two reasons. The clinic setting disappears when the
   * transaction ends, before the connection goes back to the pool for another request to
   * use. And if any step throws, every change inside it is undone.
   */
  forClinic<T>(
    clinicId: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      // The TRUE means "for this transaction only". Like SET LOCAL, but it accepts a parameter.
      await tx.$executeRaw`SELECT set_config('app.clinic_id', ${clinicId}, TRUE)`;
      return work(tx);
    });
  }
}
