import { submitCandidate, getSubmission, recorders } from '../support/client';
import {
  USERS,
  JOBS,
  MESSAGES,
  RECRUITER_CANDIDATES,
  submissionBody,
  uniqueCandidate,
} from '../support/fixtures';

/**
 * Feature: Candidate and screening-answer validation on submission
 * Source: features/ats-submit-candidate-validation.feature
 */
describe('Validation and the résumé guard', () => {
  describe('screening answers', () => {
    it('rejects an answer over 5000 characters', async () => {
      const res = await submitCandidate(
        USERS.direct,
        submissionBody({ screeningAnswers: [{ type: 'QUESTION', answer: 'x'.repeat(5001) }] }),
      );

      expect(res.status).toBe(400);
      expect(res.body.message).toBe(MESSAGES.ANSWER_TOO_LONG);
    });

    it('accepts an answer of exactly 5000 characters', async () => {
      // The boundary. The guard is `length > MAX`, so 5000 must pass; a change to
      // `>=` would be a silent off-by-one that only this test catches.
      const res = await submitCandidate(
        USERS.direct,
        submissionBody({ screeningAnswers: [{ type: 'QUESTION', answer: 'x'.repeat(5000) }] }),
      );

      expect(res.status).toBe(200);
    });

    it('drops INFORMATION-type answers from what is persisted', async () => {
      const res = await submitCandidate(
        USERS.direct,
        submissionBody({
          screeningAnswers: [
            { type: 'QUESTION', answer: 'kept' },
            { type: 'INFORMATION', answer: 'dropped' },
          ],
        }),
      );

      expect(res.status).toBe(200);

      // filteredAnswers is persisted as a JSON string, so assert the parsed shape
      // rather than substring-matching the raw column.
      const persisted = JSON.parse(res.body.submission.filteredAnswers);
      expect(persisted).toHaveLength(1);
      expect(persisted[0]).toMatchObject({ type: 'QUESTION', answer: 'kept' });
    });

    it('accepts a submission with no screening answers at all', async () => {
      const res = await submitCandidate(USERS.direct, submissionBody({ screeningAnswers: undefined }));

      expect(res.status).toBe(200);
      expect(JSON.parse(res.body.submission.filteredAnswers)).toEqual([]);
    });
  });

  describe('résumé guard', () => {
    it('rejects a brand-new candidate with no résumé anywhere', async () => {
      const res = await submitCandidate(
        USERS.direct,
        submissionBody({ candidate: uniqueCandidate({ resumeUrl: undefined }) }),
      );

      expect(res.status).toBe(400);
      expect(res.body.message).toBe(MESSAGES.RESUME_REQUIRED);
    });

    it('accepts a known candidate whose résumé is already on file, with no S3 move', async () => {
      const res = await submitCandidate(
        USERS.direct,
        submissionBody({
          candidate: { id: RECRUITER_CANDIDATES.withResume, name: 'Reused', email: 'unused@example.com' },
        }),
      );

      expect(res.status).toBe(200);
      // No temp key was sent, so no relocation should happen. Asserting the
      // *absence* of a side effect is as important as asserting its presence.
      expect((await recorders()).grouped.s3).toHaveLength(0);
    });

    it('accepts a candidate whose résumé arrives as a fresh temp key', async () => {
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
    });
  });

  describe('candidate resolution (find-or-create)', () => {
    it('reuses the recruiter candidate identified by id, and takes identity from that row', async () => {
      // Identity is read off the RecruiterCandidate row, not off the request body.
      // The name and email sent here are decoys and must not reach the profile.
      const res = await submitCandidate(
        USERS.direct,
        submissionBody({
          candidate: {
            id: RECRUITER_CANDIDATES.withResume,
            name: 'Decoy Name',
            email: 'decoy@example.com',
          },
        }),
      );

      expect(res.status).toBe(200);
      expect(res.body.recruiterCandidateId).toBe(RECRUITER_CANDIDATES.withResume);
      expect(res.body.candidate.name).not.toBe('Decoy Name');
      expect(res.body.candidate.email).not.toBe('decoy@example.com');
    });

    it('ignores a recruiter-candidate id owned by a different recruiter and creates a new one', async () => {
      // rc_with_resume belongs to u_recruiter_direct. The lookup is guarded by
      // `byId.recruiterId === recruiterId`, so another recruiter passing that id
      // falls through to create-new rather than borrowing the row. That is the
      // right call — it prevents one recruiter reading another's candidate — but
      // it fails *silently*, so this test pins the behaviour deliberately.
      const res = await submitCandidate(
        USERS.bypass1,
        submissionBody({
          candidate: uniqueCandidate({ id: RECRUITER_CANDIDATES.withResume }),
        }),
      );

      expect(res.status).toBe(200);
      expect(res.body.recruiterCandidateId).not.toBe(RECRUITER_CANDIDATES.withResume);
    });

    it('lowercases the persisted email regardless of the case supplied', async () => {
      const candidate = uniqueCandidate();
      const res = await submitCandidate(
        USERS.direct,
        submissionBody({ candidate: { ...candidate, email: candidate.email.toUpperCase() } }),
      );

      expect(res.status).toBe(200);
      expect(res.body.candidate.email).toBe(candidate.email.toLowerCase());

      const fetched = await getSubmission(res.body.submission.id).expect(200);
      expect(fetched.body.candidateProfile.email).toBe(candidate.email.toLowerCase());
    });
  });

  describe('failure paths still create a RecruiterCandidate', () => {
    it('leaves a recruiter candidate behind when authorization later fails', async () => {
      // Candidate resolution (step 2) runs BEFORE the authorization gates (step 4),
      // so a request that ends in 403 has already written a RecruiterCandidate row.
      // Documented here rather than reported as a defect: it is observable, it is
      // what the implementation does, and if it is ever intentionally changed this
      // test is where the decision surfaces.
      const candidate = uniqueCandidate();

      const denied = await submitCandidate(USERS.selfServe, submissionBody({ candidate }));
      expect(denied.status).toBe(403);

      // Re-submitting the same linkedin as the same recruiter resolves to the row
      // created by the failed attempt instead of creating a second one.
      const retry = await submitCandidate(USERS.selfServe, submissionBody({ candidate }));
      expect(retry.status).toBe(403);
    });

    it('does not create a recruiter candidate when answer validation fails first', async () => {
      // Answer validation runs before candidate resolution, so this failure mode
      // leaves no row — the asymmetry with the case above is intentional and worth
      // locking down.
      const res = await submitCandidate(
        USERS.direct,
        submissionBody({ screeningAnswers: [{ type: 'QUESTION', answer: 'x'.repeat(5001) }] }),
      );

      expect(res.status).toBe(400);
    });
  });

  describe('defensive null-coalescing paths', () => {
    it('persists null, not undefined, when notes is omitted and linkedin is not provided', async () => {
      // submissionBody() never sets `notes` unless an override supplies one,
      // so this body already has no `notes` key — exactly the case under test.
      const body = submissionBody({ candidate: uniqueCandidate({ linkedin: undefined }) });

      const res = await submitCandidate(USERS.direct, body);

      expect(res.status).toBe(200);
      expect(res.body.submission.notes).toBeNull();
      expect(res.body.candidate.linkedin).toBeNull();
    });

    it('accepts a screening answer whose text is an empty string', async () => {
      const res = await submitCandidate(
        USERS.direct,
        submissionBody({ screeningAnswers: [{ type: 'QUESTION', answer: '' }] }),
      );

      expect(res.status).toBe(200);
      expect(JSON.parse(res.body.submission.filteredAnswers)).toEqual([
        { type: 'QUESTION', answer: '' },
      ]);
    });
  });
});
