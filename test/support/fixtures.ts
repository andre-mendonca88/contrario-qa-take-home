/**
 * Seeded identifiers and request builders.
 *
 * Every id the seed guarantees is named here once, so a seed change breaks in a
 * single file rather than across dozens of string literals in assertions.
 */

export const USERS = {
  /** recruiter; direct access to job_active and job_exclusive */
  direct: 'u_recruiter_direct',
  /** recruiter; self-serve; no direct access */
  selfServe: 'u_recruiter_selfserve',
  /** recruiter; agency_1; no direct access */
  agency: 'u_recruiter_agency',
  /** not a recruiter */
  nonRecruiter: 'u_non_recruiter',
  /** recruiter; auto-approve on; direct access to job_kombo */
  autoApprove: 'u_recruiter_autoapprove',
  /** recruiter; bypass enabled; quota 1 */
  bypass1: 'u_recruiter_bypass1',
  /** recruiter; bypass enabled; quota 0 */
  bypass0: 'u_recruiter_bypass0',
  /** not seeded — exercises the unknown-caller path */
  unknown: 'u_does_not_exist',
} as const;

export const JOBS = {
  active: 'job_active',
  inactive: 'job_inactive',
  deleted: 'job_deleted',
  exclusive: 'job_exclusive',
  kombo: 'job_kombo',
  missing: 'job_definitely_not_seeded',
} as const;

export const RECRUITER_CANDIDATES = {
  /** résumé already on file — no upload needed */
  withResume: 'rc_with_resume',
  /** no résumé — an upload is required */
  noResume: 'rc_no_resume',
} as const;

/** Error strings the service returns. Mirrors MESSAGES in submission-creation.service.ts. */
export const MESSAGES = {
  NOT_RECRUITER: 'Only recruiters can submit candidates.',
  ANSWER_TOO_LONG: 'A screening answer exceeds the maximum allowed length.',
  RESUME_REQUIRED: 'A resume must be uploaded before submitting.',
  JOB_NOT_FOUND: 'Job not found.',
  EXCLUSIVE: 'This role is currently in an exclusive access period.',
  NO_ACCESS_AGENCY: 'Your agency does not have access to this role.',
  NO_ACCESS_SELF: 'You do not have access to this role.',
  BYPASS_EXHAUSTED: 'Role approval bypass quota exhausted.',
  COLLISION: 'This candidate has already been submitted to this role.',
} as const;

export const EVENTS = {
  submitted: 'api_candidate_submitted',
  failed: 'api_candidate_submission_failed',
  collision: 'api_candidate_submission_collision',
} as const;

let counter = 0;

/**
 * A candidate identity unique to this call.
 *
 * The collision rule keys on candidate email + job, so reusing a literal address
 * across tests makes the second test fail with a 409 for the wrong reason. Every
 * test that does not deliberately exercise collision gets a fresh identity.
 */
export function uniqueCandidate(overrides: Record<string, unknown> = {}) {
  counter += 1;
  const tag = `${Date.now()}-${counter}`;
  return {
    name: `Candidate ${tag}`,
    email: `candidate.${tag}@example.com`,
    linkedin: `https://linkedin.com/in/candidate-${tag}`,
    resumeUrl: 'https://public-bucket.example.com/seed/resume.pdf',
    ...overrides,
  };
}

/** A valid submit-candidate body; override any field per test. */
export function submissionBody(overrides: Record<string, any> = {}) {
  return {
    jobId: JOBS.active,
    candidate: uniqueCandidate(),
    screeningAnswers: [{ type: 'QUESTION', answer: 'Available immediately.' }],
    ...overrides,
  };
}
