import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

// @Global means every other module can use PrismaService without importing this one.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
