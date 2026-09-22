import request from 'supertest';
import { httpServer } from './app';
import type { RecordedCall } from '../../src/integrations/recorder.service';

/**
 * A thin, typed wrapper over the endpoints under test.
 *
 * Tests read as statements about behaviour ("submitting twice yields 409"), not
 * as HTTP plumbing. When a route or header changes, it changes here once.
 */

export interface Recorders {
  all: RecordedCall[];
  grouped: {
    s3: RecordedCall[];
    kombo: RecordedCall[];
    slack: RecordedCall[];
    analytics: RecordedCall[];
  };
}

/** Truncate + re-seed deterministically and clear all recorders. */
export async function resetState() {
  const res = await request(httpServer()).post('/test/reset').expect(201);
  return res.body;
}

/** POST /ats/submit-candidate as `userId`. Omit userId to send no auth header. */
export function submitCandidate(userId: string | undefined, body: unknown) {
  const req = request(httpServer()).post('/ats/submit-candidate');
  if (userId !== undefined) req.set('x-user-id', userId);
  return req.send(body as object);
}

/** GET /ats/submissions/:id — submission with profile and stages. */
export function getSubmission(id: string) {
  return request(httpServer()).get(`/ats/submissions/${id}`);
}

/**
 * GET /test/recorders.
 *
 * `awaitPending` flushes the fire-and-forget auto-approve cascade before
 * returning. Any assertion on Kombo, Slack, or a status advance past
 * PENDING_ADMIN_APPROVAL must pass `true`, or it races the cascade and is flaky.
 */
export async function recorders(awaitPending = false): Promise<Recorders> {
  const res = await request(httpServer())
    .get('/test/recorders')
    .query(awaitPending ? { awaitPending: 'true' } : {})
    .expect(200);
  return res.body;
}

/** Analytics events by name, in `seq` order. */
export function analyticsNamed(r: Recorders, name: string): RecordedCall[] {
  return r.grouped.analytics.filter((c) => c.payload.name === name);
}

/** Every recorded event name in `seq` order — useful for asserting ordering. */
export function eventSequence(r: Recorders): string[] {
  return [...r.all].sort((a, b) => a.seq - b.seq).map((c) => `${c.service}:${c.event}`);
}
