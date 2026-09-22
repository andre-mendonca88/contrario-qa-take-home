import { startApp, stopApp } from './app';
import { resetState } from './client';

/**
 * Boot the app once per Jest worker, then restore deterministic state before
 * every test.
 *
 * Resetting in beforeEach rather than beforeAll is deliberate: several rules in
 * the flow are stateful across requests — the bypass quota decrements, the
 * collision rule remembers prior submissions, and the recorder accumulates. A
 * test that inherited the previous test's state would pass or fail depending on
 * file order, which is the classic source of a suite nobody trusts.
 */
beforeAll(async () => {
  await startApp();
});

beforeEach(async () => {
  await resetState();
});

afterAll(async () => {
  await stopApp();
});
