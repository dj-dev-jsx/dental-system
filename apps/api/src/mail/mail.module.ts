import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service.js';

// @Global, like PrismaModule: anything that sends email can ask for MailService.
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
