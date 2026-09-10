/**
 * Focused security tests for the JWT secret environment policy (C2).
 *
 * These tests are PURE configuration tests: they import only
 * server/src/lib/config.ts (dotenv/path/zod) and never touch the database
 * or the generated Prisma client, so they run in any environment.
 *
 * The "valid secret" values below are synthetic test fixtures used only to
 * prove that explicit strong secrets pass validation. They are not used to
 * sign anything and are not configuration.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateEnvironment, isInsecureJwtSecret } from '../src/lib/config.js';

const PROD_ENV = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;

// Synthetic, clearly test-only fixtures (64-char hex strings).
const GOOD_ACCESS = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
const GOOD_REFRESH = '6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b';

function prodEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return { ...PROD_ENV, ...overrides } as NodeJS.ProcessEnv;
}

describe('C2: JWT secret production policy', () => {
  describe('production must fail closed', () => {
    it('fails when JWT_ACCESS_SECRET is missing', () => {
      const result = validateEnvironment(prodEnv({ JWT_REFRESH_SECRET: GOOD_REFRESH }));
      assert.equal(result.success, false);
      if (result.success) return;
      const fields = result.error.flatten().fieldErrors as Record<string, string[] | undefined>;
      assert.ok(fields.JWT_ACCESS_SECRET && fields.JWT_ACCESS_SECRET.length > 0, 'expected JWT_ACCESS_SECRET error');
      assert.match(fields.JWT_ACCESS_SECRET[0], /required when NODE_ENV=production/i);
    });

    it('fails when JWT_REFRESH_SECRET is missing', () => {
      const result = validateEnvironment(prodEnv({ JWT_ACCESS_SECRET: GOOD_ACCESS }));
      assert.equal(result.success, false);
      if (result.success) return;
      const fields = result.error.flatten().fieldErrors as Record<string, string[] | undefined>;
      assert.ok(fields.JWT_REFRESH_SECRET && fields.JWT_REFRESH_SECRET.length > 0, 'expected JWT_REFRESH_SECRET error');
      assert.match(fields.JWT_REFRESH_SECRET[0], /required when NODE_ENV=production/i);
    });

    it('fails when both secrets are missing', () => {
      const result = validateEnvironment(prodEnv());
      assert.equal(result.success, false);
    });

    it('rejects the .env.example placeholder value', () => {
      const result = validateEnvironment(prodEnv({
        JWT_ACCESS_SECRET: 'change-this-to-a-strong-random-secret',
        JWT_REFRESH_SECRET: 'change-this-to-another-strong-random-secret',
      }));
      assert.equal(result.success, false);
      if (result.success) return;
      const fields = result.error.flatten().fieldErrors as Record<string, string[] | undefined>;
      assert.match(fields.JWT_ACCESS_SECRET?.[0] || '', /placeholder or development default/i);
    });

    it('rejects placeholder marker values (change-this / change-me / changeme)', () => {
      for (const v of ['change-this-to-anything-else-0123456789abcdef', 'please-change-me-0123456789abcdef0123', 'changeme-0123456789abcdef0123456789']) {
        const result = validateEnvironment(prodEnv({ JWT_ACCESS_SECRET: v, JWT_REFRESH_SECRET: GOOD_REFRESH }));
        assert.equal(result.success, false, `expected rejection for ${v}`);
      }
    });

    it('rejects weak secrets (too short, digits only, single repeated char)', () => {
      for (const v of ['short', '1234567890123456789012345678901234567890', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']) {
        const result = validateEnvironment(prodEnv({ JWT_ACCESS_SECRET: v, JWT_REFRESH_SECRET: GOOD_REFRESH }));
        assert.equal(result.success, false, `expected rejection for weak secret`);
      }
    });

    it('never accepts development fallback secrets in production', () => {
      const result = validateEnvironment(prodEnv({
        JWT_ACCESS_SECRET: 'dev-jwt-access-secret-minimum-32-chars-long',
        JWT_REFRESH_SECRET: 'dev-jwt-refresh-secret-minimum-32-chars-long',
      }));
      assert.equal(result.success, false);
    });

    it('never accepts test fallback secrets in production', () => {
      const result = validateEnvironment(prodEnv({
        JWT_ACCESS_SECRET: 'test-jwt-access-secret-minimum-32-chars-long',
        JWT_REFRESH_SECRET: 'test-jwt-refresh-secret-minimum-32-chars-long',
      }));
      assert.equal(result.success, false);
    });

    it('rejects identical access and refresh secrets', () => {
      const result = validateEnvironment(prodEnv({ JWT_ACCESS_SECRET: GOOD_ACCESS, JWT_REFRESH_SECRET: GOOD_ACCESS }));
      assert.equal(result.success, false);
      if (result.success) return;
      const fields = result.error.flatten().fieldErrors as Record<string, string[] | undefined>;
      assert.match(fields.JWT_REFRESH_SECRET?.[0] || '', /must be different/i);
    });

    it('succeeds with valid, distinct, explicitly supplied secrets', () => {
      const result = validateEnvironment(prodEnv({ JWT_ACCESS_SECRET: GOOD_ACCESS, JWT_REFRESH_SECRET: GOOD_REFRESH }));
      assert.equal(result.success, true);
      if (!result.success) return;
      assert.equal(result.data.JWT_ACCESS_SECRET, GOOD_ACCESS);
      assert.equal(result.data.JWT_REFRESH_SECRET, GOOD_REFRESH);
      assert.equal(result.data.NODE_ENV, 'production');
    });
  });

  describe('development/test remain usable', () => {
    it('development boots without secrets using explicit dev defaults', () => {
      const result = validateEnvironment({ NODE_ENV: 'development' } as NodeJS.ProcessEnv);
      assert.equal(result.success, true);
      if (!result.success) return;
      assert.equal(result.data.JWT_ACCESS_SECRET, 'dev-jwt-access-secret-minimum-32-chars-long');
      assert.equal(result.data.JWT_REFRESH_SECRET, 'dev-jwt-refresh-secret-minimum-32-chars-long');
      assert.equal(result.data.NODE_ENV, 'development');
    });

    it('test mode boots without secrets using explicit test defaults', () => {
      const result = validateEnvironment({ NODE_ENV: 'test' } as NodeJS.ProcessEnv);
      assert.equal(result.success, true);
      if (!result.success) return;
      assert.equal(result.data.JWT_ACCESS_SECRET, 'test-jwt-access-secret-minimum-32-chars-long');
      assert.equal(result.data.JWT_REFRESH_SECRET, 'test-jwt-refresh-secret-minimum-32-chars-long');
    });

    it('test mode is also detected via npm_lifecycle_event=test', () => {
      const result = validateEnvironment({ npm_lifecycle_event: 'test' } as NodeJS.ProcessEnv);
      assert.equal(result.success, true);
      if (!result.success) return;
      assert.equal(result.data.NODE_ENV, 'test');
    });

    it('development accepts explicitly configured secrets (>= 16 chars, no production denylist)', () => {
      const result = validateEnvironment({
        NODE_ENV: 'development',
        JWT_ACCESS_SECRET: 'my-local-dev-access-secret',
        JWT_REFRESH_SECRET: 'my-local-dev-refresh-secret',
      } as NodeJS.ProcessEnv);
      assert.equal(result.success, true);
      if (!result.success) return;
      assert.equal(result.data.JWT_ACCESS_SECRET, 'my-local-dev-access-secret');
      assert.equal(result.data.JWT_REFRESH_SECRET, 'my-local-dev-refresh-secret');
    });
  });

  describe('isInsecureJwtSecret', () => {
    it('flags known insecure values', () => {
      assert.equal(isInsecureJwtSecret('change-this-to-a-strong-random-secret'), true);
      assert.equal(isInsecureJwtSecret('dev-jwt-access-secret-minimum-32-chars-long'), true);
      assert.equal(isInsecureJwtSecret('test-jwt-refresh-secret-minimum-32-chars-long'), true);
      assert.equal(isInsecureJwtSecret('CHANGEME'), true);
      assert.equal(isInsecureJwtSecret('  change-this-to-a-strong-random-secret  '), true); // trim-safe
      assert.equal(isInsecureJwtSecret('1111111111'), true);
      assert.equal(isInsecureJwtSecret('1234567890'), true);
    });

    it('accepts strong random values', () => {
      assert.equal(isInsecureJwtSecret(GOOD_ACCESS), false);
      assert.equal(isInsecureJwtSecret('Xk9!mP2#vQ7@wZ4$nR8&uT3*yH6+jL0-'), false);
    });
  });

  describe('validateEnvironment hygiene', () => {
    it('does not mutate the environment passed to it', () => {
      const env = prodEnv({ JWT_ACCESS_SECRET: 'short' });
      const before = JSON.stringify(env);
      validateEnvironment(env);
      assert.equal(JSON.stringify(env), before);
    });

    it('evaluates the env argument, not the runner process env', () => {
      // The test runner itself runs with NODE_ENV=test; the function must
      // still apply production policy to the env it is given.
      const result = validateEnvironment(prodEnv());
      assert.equal(result.success, false);
    });

    it('defaults to process.env when called without arguments', () => {
      const result = validateEnvironment();
      // In the test runner (NODE_ENV=test) this must be a valid config.
      assert.equal(result.success, true);
    });
  });
});
