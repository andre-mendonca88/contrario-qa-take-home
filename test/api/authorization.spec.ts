import { submitCandidate, recorders, analyticsNamed } from '../support/client';
import { USERS, JOBS, MESSAGES, EVENTS, submissionBody } from '../support/fixtures';

/**
 * Feature: Authorization gates on candidate submission
 * Source: features/ats-submit-candidate-authorization.feature
 *
 * The gates run in a strict order the spec is explicit about: recruiter check →
 * job lookup (404) → exclusivity (403) → standard access / bypass (403). Ordering
 * is itself behaviour, so it is asserted directly rather than assumed.
 */
describe('Authorization gates on candidate submission', () => {
  describe('caller must be a recruiter', () => {
    it('forbids a non-recruiter, and still records a failure event', async () => {
      const res = await submitCandidate(USERS.nonRecruiter, submissionBody());

      expect(res.status).toBe(403);
      expect(res.body.message).toBe(MESSAGES.NOT_RECRUITER);

      // The failure event fires even for the earliest gate — the try/catch in
      // createSubmission wraps the whole flow, including the recruiter check.
      const failed = analyticsNamed(await recorders(), EVENTS.failed);
      expect(failed).toHaveLength(1);
      expect(failed[0].payload.attributedTo).toBe(USERS.nonRecruiter);
    });

    it('forbids an unknown caller with the same message (no user enumeration)', async () => {
      const res = await submitCandidate(USERS.unknown, submissionBody());

      expect(res.status).toBe(403);
      // Deliberately identical to the non-recruiter message: a different message
      // here would let a caller distinguish "user does not exist" from "user is
      // not a recruiter".
      expect(res.body.message).toBe(MESSAGES.NOT_RECRUITER);
    });

    it('forbids a caller sending no x-user-id header at all', async () => {
      const res = await submitCandidate(undefined, submissionBody());

      expect(res.status).toBe(403);
      expect(res.body.message).toBe(MESSAGES.NOT_RECRUITER);

      // With no header the event is attributed to 'anonymous', not dropped.
      const failed = analyticsNamed(await recorders(), EVENTS.failed);
      expect(failed[0].payload.attributedTo).toBe('anonymous');
    });
  });

  describe('job must be reachable (404 precedes any 403)', () => {
    it.each([
      ['unknown job', JOBS.missing],
      ['inactive job', JOBS.inactive],
      ['soft-deleted job', JOBS.deleted],
    ])('returns 404 for an %s', async (_label, jobId) => {
      const res = await submitCandidate(USERS.direct, submissionBody({ jobId }));

      expect(res.status).toBe(404);
      expect(res.body.message).toBe(MESSAGES.JOB_NOT_FOUND);
    });

    it('returns 404 rather than 403 when the caller also lacks access', async () => {
      // Pins the documented ordering: job lookup happens before the access gates,
      // so an unauthorized caller asking for a missing job gets 404, not 403.
      // Without this test, swapping the two gates would go unnoticed.
      const res = await submitCandidate(USERS.selfServe, submissionBody({ jobId: JOBS.missing }));

      expect(res.status).toBe(404);
      expect(res.body.message).toBe(MESSAGES.JOB_NOT_FOUND);
    });
  });

  describe('role exclusivity', () => {
    it('allows a recruiter with direct access during an exclusivity window', async () => {
      const res = await submitCandidate(USERS.direct, submissionBody({ jobId: JOBS.exclusive }));

      expect(res.status).toBe(200);
    });

    it('forbids a recruiter without direct access during an exclusivity window', async () => {
      const res = await submitCandidate(USERS.selfServe, submissionBody({ jobId: JOBS.exclusive }));

      expect(res.status).toBe(403);
      expect(res.body.message).toBe(MESSAGES.EXCLUSIVE);
    });

    it('exclusivity beats an available bypass quota, and does not consume it', async () => {
      // The highest-value case in this file. The exclusivity guard runs before the
      // bypass check, so a bypass-enabled recruiter is still refused — and because
      // the request throws before the quota decrement, the quota must be untouched.
      const res = await submitCandidate(USERS.bypass1, submissionBody({ jobId: JOBS.exclusive }));

      expect(res.status).toBe(403);
      expect(res.body.message).toBe(MESSAGES.EXCLUSIVE);

      // Quota intact: the same recruiter can still spend it on a non-exclusive role.
      const after = await submitCandidate(USERS.bypass1, submissionBody({ jobId: JOBS.active }));
      expect(after.status).toBe(200);
      expect(after.body.submission.isRoleApprovalBypass).toBe(true);
    });
  });

  describe('standard access and bypass quota', () => {
    it('gives a self-serve recruiter the self-serve message', async () => {
      const res = await submitCandidate(USERS.selfServe, submissionBody());

      expect(res.status).toBe(403);
      expect(res.body.message).toBe(MESSAGES.NO_ACCESS_SELF);
    });

    it('gives an agency recruiter the agency message', async () => {
      // Same 403, different copy. The branch is chosen by user.agencyId, so testing
      // only one of the two would leave the other uncovered.
      const res = await submitCandidate(USERS.agency, submissionBody());

      expect(res.status).toBe(403);
      expect(res.body.message).toBe(MESSAGES.NO_ACCESS_AGENCY);
    });

    it('allows a bypass-enabled recruiter, flags the submission, and spends the quota', async () => {
      const first = await submitCandidate(USERS.bypass1, submissionBody());

      expect(first.status).toBe(200);
      expect(first.body.submission.isRoleApprovalBypass).toBe(true);

      // Quota was 1. The second attempt proves it decremented to 0 — asserted
      // through behaviour rather than by reading the user row, so the test stays
      // honest about what a caller can actually observe.
      const second = await submitCandidate(USERS.bypass1, submissionBody());
      expect(second.status).toBe(403);
      expect(second.body.message).toBe(MESSAGES.BYPASS_EXHAUSTED);
    });

    it('forbids a bypass-enabled recruiter whose quota is already exhausted', async () => {
      const res = await submitCandidate(USERS.bypass0, submissionBody());

      expect(res.status).toBe(403);
      expect(res.body.message).toBe(MESSAGES.BYPASS_EXHAUSTED);
    });

    it('does not set the bypass flag when access is direct', async () => {
      const res = await submitCandidate(USERS.direct, submissionBody());

      expect(res.status).toBe(200);
      expect(res.body.submission.isRoleApprovalBypass).toBe(false);
    });
  });
});
