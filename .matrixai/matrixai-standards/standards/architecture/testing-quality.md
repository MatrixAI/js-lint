# Rules
- [MXS-ARCH-TQ-001] All tests MUST run via `npm test` to ensure the TypeScript build step precedes Jest and shares the same compiler options.
- [MXS-ARCH-TQ-009] For repos using profiles `library-js` or `application-js`, `#...` imports are internal-only and MUST be used only under `tests/` (not in `src/` nor scripts). In these profiles, `package.json` `imports` maps `#*` to `./dist/*`, so `#...` resolves to compiled output in `dist/`; build/compile MUST occur before running tests that import via `#...`. This rule does not apply to `worker-js-cloudflare` nor `docusaurus-js-cloudflare`.
- [MXS-ARCH-TQ-002] Jest config MUST keep SWC transform with decorator flag, Node env, and ESM extensions to match TS settings.
- [MXS-ARCH-TQ-003] Default timeout is 20s; long-running tests MUST override per-test timeout argument.
- [MXS-ARCH-TQ-004] Tests MUST mirror domain layout (e.g., `tests/client/handlers/*` for client handlers) to keep coverage traceable.
- [MXS-ARCH-TQ-005] Global setup/teardown MUST stay in `tests/globalSetup.ts` and `tests/globalTeardown.ts` to manage shared resources.
- [MXS-ARCH-TQ-006] Coverage collection MUST target `src/**/*.{ts,tsx,js,jsx}` excluding `.d.ts`.
- [MXS-ARCH-TQ-007] JUnit reports MUST emit to `tmp/junit` with file attributes enabled for CI consumption.
- [MXS-ARCH-TQ-008] Test caches and coverage outputs MUST stay under `tmp/` to avoid polluting repo roots.

## Exhibits (non-normative)
- Jest config fragment with SWC and ESM alignment `jest.config.mjs`:
  ```js
  const config = {
    testEnvironment: 'node',
    extensionsToTreatAsEsm: ['.ts', '.tsx'],
    transform: {
      '^.+\\.(t|j)sx?$': [
        '@swc/jest',
        { jsc: { target: 'es2022', parser: { syntax: 'typescript', decorators: true } } },
      ],
    },
    setupFilesAfterEnv: ['./tests/setupAfterEnv.ts'],
  };

  export default config;
  ```
- Timeout enforcement helper `tests/setupAfterEnv.ts`:
  ```ts
  import { beforeEach, afterEach, jest } from '@jest/globals';

  beforeEach(() => {
    jest.setTimeout(20_000);
  });

  afterEach(() => {
    jest.useRealTimers();
  });
  ```
- Test wrapper pattern mirroring domain layout `tests/client/handlers/agent.test.ts` (library-js/application-js: `#...` in tests resolves to `dist/` via package `imports`; build first):
  ```ts
  import { handleAgent } from '#client/handlers/agent.js';

  describe('client/handlers/agent', () => {
    it('responds with agent state', async () => {
      const response = await handleAgent({ id: 'alpha' });
      expect(response.status).toBe('ok');
    });
  });
  ```
