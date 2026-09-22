import { submitCandidate, recorders, resetState, analyticsNamed } from '../support/client';
import { USERS, JOBS, EVENTS, submissionBody } from '../support/fixtures';

/**
 * Feature: Test-support seam (reset and recorders)
 * Source: features/test-support.feature
 */
describe('Test-support seam (reset and recorders)', () => {
  it('resets test data and returns deterministic seed counts', async () => {
    const body = await resetState();

    expect(body).toEqual({
      ok: true,
      seedVersion: expect.any(Number),
      counts: {
        users: 7,
        companies: 2,
        jobs: 5,
        recruiterCandidates: 2,
        submissions: 0,
      },
    });
  });

  it('has empty recorders immediately after a reset', async () => {
    const r = await recorders();

    expect(r.all).toEqual([]);
    expect(r.grouped).toEqual({ s3: [], kombo: [], slack: [], analytics: [] });
  });

  it('captures a failure event from a rejected submission attempt', async () => {
    await submitCandidate(USERS.nonRecruiter, submissionBody());

    const r = await recorders();
    expect(analyticsNamed(r, EVENTS.failed)).toHaveLength(1);
  });

  it('only reflects flushed cascade side effects when awaitPending is requested', async () => {
    // This is the one place where asserting the race itself is the point: the
    // same submission's recorders differ depending on whether the caller waits.
    await submitCandidate(USERS.autoApprove, submissionBody({ jobId: JOBS.kombo }));

    const beforeFlush = await recorders();
    expect(beforeFlush.grouped.kombo).toHaveLength(0);

    const afterFlush = await recorders(true);
    expect(afterFlush.grouped.kombo).toHaveLength(1);
  });
});
