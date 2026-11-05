import { type INestApplication, StandardSchemaValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

/** Shared by the real server and the tests, so tests exercise the same setup. */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api/v1');
  app.use(helmet()); // standard security headers
  app.use(cookieParser());
  // Checks any route parameter declared with a Zod schema, like @Body({ schema }).
  app.useGlobalPipes(new StandardSchemaValidationPipe());
}
