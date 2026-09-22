import { submitCandidate, getSubmission, recorders } from '../support/client';
import { USERS, JOBS, submissionBody, uniqueCandidate } from '../support/fixtures';

/**
 * Feature: Auto-approve cascade after submission
 * Source: features/ats-submit-candidate-cascade.feature
 *
 * The cascade is fire-and-forget (step 9): it runs after the HTTP response is
 * sent, so every assertion on Kombo, Slack, or a status past
 * PENDING_ADMIN_APPROVAL must call recorders(true) to flush it first, or the
 * assertion races the cascade and is flaky.
 */
describe('Auto-approve cascade after submission', () => {
  it('returns PENDING_ADMIN_APPROVAL immediately, before the cascade has run', async () => {
    const res = await submitCandidate(USERS.autoApprove, submissionBody({ jobId: JOBS.kombo }));

    expect(res.status).toBe(200);
    expect(res.body.submission.status).toBe('PENDING_ADMIN_APPROVAL');
  });

  it('pushes to Kombo, sends the Slack intro, and advances to APPROVED after flush', async () => {
    const res = await submitCandidate(USERS.autoApprove, submissionBody({ jobId: JOBS.kombo }));
    const submissionId = res.body.submission.id;
    const candidateId = res.body.candidate.id;

    const r = await recorders(true);

    const push = r.grouped.kombo;
    expect(push).toHaveLength(1);
    expect(push[0].payload).toMatchObject({
      jobId: JOBS.kombo,
      candidateId,
      blockedReason: null,
      pushed: true,
    });

    const intro = r.grouped.slack;
    expect(intro).toHaveLength(1);
    // co_autoapprove_true has autoApproveAfterAdminApproval on, so no action
    // buttons are needed — the company auto-approves without one.
    expect(intro[0].payload).toMatchObject({
      candidateId,
      hasActionButtons: false,
    });

    const fetched = await getSubmission(submissionId).expect(200);
    expect(fetched.body.status).toBe('APPROVED');
    expect(fetched.body.stages.map((s: any) => s.stageName)).toEqual(
      expect.arrayContaining(['Application Review', 'Company Review']),
    );
  });

  it('leaves a non-auto-approve recruiter at PENDING_ADMIN_APPROVAL, with no Kombo or Slack calls', async () => {
    const res = await submitCandidate(USERS.direct, submissionBody({ jobId: JOBS.active }));

    const r = await recorders(true);

    expect(r.grouped.kombo).toHaveLength(0);
    expect(r.grouped.slack).toHaveLength(0);

    const fetched = await getSubmission(res.body.submission.id).expect(200);
    expect(fetched.body.status).toBe('PENDING_ADMIN_APPROVAL');
  });

  // Not reachable cleanly through the public API: u_recruiter_autoapprove only
  // has direct access to job_kombo, and no seeded user combines autoApprove
  // with access to a non-Kombo job. Forcing it through an unrelated user (e.g.
  // spending bypass quota on job_active) would test bypass, not this branch.
  // Documented as a known gap in TESTING.md rather than faked here.
  it.todo(
    'sends the Slack intro but skips Kombo for an auto-approve recruiter on a non-Kombo job — no seeded user reaches this cleanly',
  );
});
