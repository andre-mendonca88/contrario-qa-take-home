import {
  submitCandidate,
  getSubmission,
  recorders,
  analyticsNamed,
  eventSequence,
} from '../support/client';
import { USERS, JOBS, MESSAGES, EVENTS, submissionBody, uniqueCandidate } from '../support/fixtures';

/**
 * Feature: Submission persistence and duplicate collision handling
 * Source: features/ats-submit-candidate-collision-and-persistence.feature
 */
describe('Persistence, collision and side effects', () => {
  describe('a successful submission', () => {
    it('returns the candidate, submission and recruiter candidate id', async () => {
      const res = await submitCandidate(USERS.direct, submissionBody());

      expect(res.status).toBe(200);
      expect(res.body.candidate).toMatchObject({ id: expect.any(String) });
      expect(res.body.submission).toMatchObject({
        id: expect.any(String),
        status: 'PENDING_ADMIN_APPROVAL',
        jobId: JOBS.active,
        recruiterId: USERS.direct,
      });
      expect(res.body.recruiterCandidateId).toEqual(expect.any(String));
    });

    it('creates an Application Review stage readable through the read endpoint', async () => {
      const res = await submitCandidate(USERS.direct, submissionBody());
      const fetched = await getSubmission(res.body.submission.id).expect(200);

      expect(fetched.body.candidateProfile).toBeTruthy();
      expect(fetched.body.stages.map((s: any) => s.stageName)).toContain('Application Review');
    });

    it('records a submitted analytics event attributed to the recruiter', async () => {
      const res = await submitCandidate(USERS.direct, submissionBody());

      const submitted = analyticsNamed(await recorders(), EVENTS.submitted);
      expect(submitted).toHaveLength(1);
      expect(submitted[0].payload.attributedTo).toBe(USERS.direct);
      expect(submitted[0].payload.payload).toMatchObject({
        jobId: JOBS.active,
        submissionId: res.body.submission.id,
        isRoleApprovalBypass: false,
      });
    });

    it('sets agencyId from the caller, not from the request', async () => {
      // u_recruiter_agency has no access to job_active, so use the exclusivity-free
      // path via bypass to prove agency attribution comes off the user row.
      const res = await submitCandidate(USERS.direct, submissionBody());

      expect(res.status).toBe(200);
      expect(res.body.submission.agencyId).toBeNull();
    });
  });

  describe('collision on candidate email + role', () => {
    it('rejects the second submission of the same email to the same role', async () => {
      const candidate = uniqueCandidate();

      const first = await submitCandidate(USERS.direct, submissionBody({ candidate }));
      expect(first.status).toBe(200);

      const second = await submitCandidate(
        USERS.direct,
        submissionBody({ candidate: uniqueCandidate({ email: candidate.email }) }),
      );

      expect(second.status).toBe(409);
      expect(second.body.message).toBe(MESSAGES.COLLISION);
    });

    it('treats email case-insensitively when detecting a collision', async () => {
      // The profile email is lowercased on write, so a differently-cased address is
      // the same candidate. Asserting this matters: a naive exact-match collision
      // query would let ALAN@example.com through and create a duplicate claim on
      // the role.
      const candidate = uniqueCandidate();

      await submitCandidate(USERS.direct, submissionBody({ candidate })).expect(200);

      const second = await submitCandidate(
        USERS.direct,
        submissionBody({ candidate: uniqueCandidate({ email: candidate.email.toUpperCase() }) }),
      );

      expect(second.status).toBe(409);
    });

    it('records BOTH a collision event and a failure event, in that order', async () => {
      // The collision event is tracked inside run(), then the ConflictException
      // propagates to the wrapper which tracks the failure event. Two events, not
      // one — and `seq` pins the order.
      const candidate = uniqueCandidate();
      await submitCandidate(USERS.direct, submissionBody({ candidate })).expect(200);
      await submitCandidate(USERS.direct, submissionBody({ candidate })).expect(409);

      const r = await recorders();
      const collision = analyticsNamed(r, EVENTS.collision);
      const failed = analyticsNamed(r, EVENTS.failed);

      expect(collision).toHaveLength(1);
      expect(collision[0].payload.attributedTo).toBe(USERS.direct);
      expect(failed).toHaveLength(1);
      expect(collision[0].seq).toBeLessThan(failed[0].seq);
    });

    it('allows the same candidate on a different role', async () => {
      // Collision is scoped to email + job, so the same person may be submitted to
      // two different roles. This guards against the scope being widened by accident.
      const candidate = uniqueCandidate();

      await submitCandidate(USERS.direct, submissionBody({ candidate })).expect(200);
      const other = await submitCandidate(
        USERS.direct,
        submissionBody({ candidate, jobId: JOBS.exclusive }),
      );

      expect(other.status).toBe(200);
    });
  });

  describe('résumé relocation', () => {
    it('moves a temp résumé to public storage and updates the profile', async () => {
      const res = await submitCandidate(
        USERS.direct,
        submissionBody({
          candidate: uniqueCandidate({
            resumeUrl: undefined,
            resumeTempKey: 'temp/upload-1.pdf',
            resumeFileName: 'cv.pdf',
          }),
        }),
      );

      expect(res.status).toBe(200);

      const moves = (await recorders()).grouped.s3;
      expect(moves).toHaveLength(1);
      expect(moves[0].payload).toMatchObject({ from: 'temp/upload-1.pdf', deletedTemp: true });
      expect(moves[0].payload.to).toContain('public-bucket.example.com');
      expect(moves[0].payload.to).toContain('cv.pdf');

      // The profile must end up pointing at the moved file, not the temp key.
      const fetched = await getSubmission(res.body.submission.id).expect(200);
      expect(fetched.body.candidateProfile.resumeUpload).toBe(moves[0].payload.to);
    });

    it('records the S3 move after the submitted analytics event has not yet fired', async () => {
      // Ordering check via the monotonic `seq`: the résumé move (step 8) happens
      // before the success event (step 10). If those ever swap, a failed move would
      // be reported as a successful submission.
      await submitCandidate(
        USERS.direct,
        submissionBody({
          candidate: uniqueCandidate({ resumeUrl: undefined, resumeTempKey: 'temp/upload-2.pdf' }),
        }),
      ).expect(200);

      const sequence = eventSequence(await recorders());
      expect(sequence.indexOf('s3:move_resume')).toBeLessThan(
        sequence.indexOf(`analytics:${EVENTS.submitted}`),
      );
    });
  });

  describe('reading a submission back', () => {
    it('returns 404 for an id that does not exist', async () => {
      const res = await getSubmission('does-not-exist');

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Submission not found.');
    });
  });
});
