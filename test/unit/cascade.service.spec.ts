import { Logger } from '@nestjs/common';
import { CascadeService } from '../../src/ats/cascade.service';
import { KomboService } from '../../src/integrations/kombo.service';
import { SlackService } from '../../src/integrations/slack.service';
import { RecorderService } from '../../src/integrations/recorder.service';

/**
 * Unit tests for CascadeService, run against a mocked Prisma client rather
 * than the HTTP API.
 *
 * Why a unit test here and not another API test: three branches in this file
 * are genuinely unreachable through POST /ats/submit-candidate.
 *   - "submission not found": schedule() is only ever called internally, right
 *     after a submission is created, with that submission's own id.
 *   - "inactive_job": the job is validated active (step 4a) before a
 *     submission can be created at all, so by the time the cascade reads it
 *     back it cannot have become inactive through the public API.
 *   - "duplicate_in_ats": the step-5 collision check already rejects a second
 *     submission with the same candidate email on the same job with a 409,
 *     so no second submission sharing an email+job can exist for the cascade
 *     to find.
 * All three require constructing state Prisma would never produce through the
 * real flow, which is exactly what a mock is for. RecorderService, KomboService
 * and SlackService are real (not mocked) so the recorded payloads are asserted
 * the same way the API tests assert them, through GET /test/recorders shape.
 */
describe('CascadeService (unit)', () => {
  function makePrismaMock() {
    return {
      candidateSubmission: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      candidateStage: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
  }

  function makeCascade(prisma: ReturnType<typeof makePrismaMock>) {
    const recorder = new RecorderService();
    const kombo = new KomboService(recorder);
    const slack = new SlackService(recorder);
    const cascade = new CascadeService(prisma as any, kombo, slack);
    return { cascade, recorder };
  }

  it('returns early when the submission cannot be found, with no Kombo or Slack calls', async () => {
    const prisma = makePrismaMock();
    prisma.candidateSubmission.findUnique.mockResolvedValue(null);
    const { cascade, recorder } = makeCascade(prisma);

    cascade.schedule('does-not-exist');
    await cascade.flush();

    expect(prisma.candidateSubmission.update).not.toHaveBeenCalled();
    expect(prisma.candidateStage.create).not.toHaveBeenCalled();
    expect(recorder.grouped().kombo).toHaveLength(0);
    expect(recorder.grouped().slack).toHaveLength(0);
  });

  it('blocks the Kombo push with blockedReason "inactive_job" when the job is no longer active', async () => {
    const prisma = makePrismaMock();
    prisma.candidateSubmission.findUnique.mockResolvedValue({
      id: 'sub-inactive',
      jobId: 'job_kombo',
      companyId: 'co_1',
      candidateProfileId: 'profile-inactive',
      job: { source: 'kombo', active: false, deletedAt: null },
      company: { autoApproveAfterAdminApproval: false },
      candidateProfile: { email: 'blocked@example.com' },
    });
    const { cascade, recorder } = makeCascade(prisma);

    cascade.schedule('sub-inactive');
    await cascade.flush();

    // The findFirst duplicate check is only reached on the active-job branch,
    // so it must not be called here.
    expect(prisma.candidateSubmission.findFirst).not.toHaveBeenCalled();

    const push = recorder.grouped().kombo;
    expect(push).toHaveLength(1);
    expect(push[0].payload).toMatchObject({
      jobId: 'job_kombo',
      candidateId: 'profile-inactive',
      blockedReason: 'inactive_job',
      pushed: false,
    });

    // Status still advances and the Slack intro still fires; only the Kombo
    // push is blocked.
    expect(recorder.grouped().slack).toHaveLength(1);
    expect(prisma.candidateSubmission.update).toHaveBeenCalledTimes(1);
    expect(prisma.candidateSubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PENDING_COMPANY_APPROVAL' } }),
    );
  });

  it('blocks the Kombo push with blockedReason "duplicate_in_ats" when another submission shares the email and job', async () => {
    const prisma = makePrismaMock();
    prisma.candidateSubmission.findUnique.mockResolvedValue({
      id: 'sub-dup',
      jobId: 'job_kombo',
      companyId: 'co_1',
      candidateProfileId: 'profile-dup',
      job: { source: 'kombo', active: true, deletedAt: null },
      company: { autoApproveAfterAdminApproval: false },
      candidateProfile: { email: 'dup@example.com' },
    });
    prisma.candidateSubmission.findFirst.mockResolvedValue({ id: 'some-other-submission' });
    const { cascade, recorder } = makeCascade(prisma);

    cascade.schedule('sub-dup');
    await cascade.flush();

    expect(prisma.candidateSubmission.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          jobId: 'job_kombo',
          id: { not: 'sub-dup' },
          candidateProfile: { email: 'dup@example.com' },
        }),
      }),
    );

    const push = recorder.grouped().kombo;
    expect(push).toHaveLength(1);
    expect(push[0].payload).toMatchObject({
      blockedReason: 'duplicate_in_ats',
      pushed: false,
    });
  });

  it('logs and does not throw when the cascade run itself rejects', async () => {
    // schedule() never awaits run() directly — it attaches a .catch() so a
    // failure in the fire-and-forget cascade can never surface as an unhandled
    // rejection or crash the request that triggered it. Forcing Prisma to throw
    // is the only way to exercise that handler.
    const prisma = makePrismaMock();
    prisma.candidateSubmission.findUnique.mockRejectedValue(new Error('db unavailable'));
    const { cascade } = makeCascade(prisma);

    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    cascade.schedule('sub-throws');
    await expect(cascade.flush()).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('sub-throws'));
    errorSpy.mockRestore();
  });
});
