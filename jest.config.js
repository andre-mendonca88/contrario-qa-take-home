/** @type {import('jest').Config} */
module.exports = {
  displayName: 'api',
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/api/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', isolatedModules: true }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFilesAfterEnv: ['<rootDir>/test/support/setup.ts'],

  // --------------------------------------------------------------------------
  // Serial execution is a CORRECTNESS requirement, not a performance trade-off.
  //
  // The app has two pieces of shared global mutable state:
  //   1. one SQLite file (prisma/dev.db), truncated + re-seeded by POST /test/reset
  //   2. an in-memory RecorderService whose `seq` counter is module-global and is
  //      cleared by that same endpoint
  //
  // Jest parallelises across worker processes by default. Under parallelism one
  // test's reset wipes another's fixtures mid-flight, and recorder assertions read
  // a different test's side effects. Both failure modes are intermittent, which is
  // the worst kind.
  // --------------------------------------------------------------------------
  maxWorkers: 1,

  // Coverage is measured against the application source, not the tests.
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',              // bootstrap only; exercised by the e2e suite
    '!src/**/*.module.ts',       // DI wiring, no branches
    '!src/test-support/**',      // the seam itself, not production code
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'lcov', 'json-summary', 'html'],

  // Thresholds FAIL the run rather than merely reporting. An unenforced coverage
  // number is a vanity metric; this is what makes "85%" a gate instead of a claim.
  // Branch coverage is the one that matters here: the flow under test is a ladder
  // of authorization gates, so an uncovered branch is an uncovered rule.
  coverageThreshold: {
    global: { statements: 85, branches: 85, functions: 85, lines: 85 },
    // The core flow carries the business rules and is held to a higher bar.
    'src/ats/submission-creation.service.ts': {
      statements: 95, branches: 90, functions: 100, lines: 95,
    },
  },

  testTimeout: 20000,
  clearMocks: true,
  verbose: true,
};
