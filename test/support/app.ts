import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';

/**
 * Boots the real AppModule in-process for API tests.
 *
 * Why in-process rather than hitting a server on :3000
 * ----------------------------------------------------
 * - No port binding, so nothing collides with a dev server the reviewer already
 *   has running, and no start-up race to poll for.
 * - Supertest drives the HTTP stack directly, so requests still traverse the real
 *   controllers, pipes, filters and DI graph. This is an integration test, not a
 *   unit test with mocks.
 * - Faster and easier to debug: a stack trace points into the app, not at a socket.
 *
 * The Playwright suite does the opposite and spawns the real server, because the
 * browser genuinely needs a listening port. Both talk to the same SQLite file, so
 * the two suites must never run concurrently (see the `test` script).
 */
let app: INestApplication | undefined;

export async function startApp(): Promise<INestApplication> {
  if (app) return app;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

export async function stopApp(): Promise<void> {
  await app?.close();
  app = undefined;
}

export function httpServer() {
  if (!app) throw new Error('startApp() must be awaited before httpServer() is used.');
  return app.getHttpServer();
}
