import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try loading from root or server dir
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ==========================================
// JWT secret policy (C2 hardening)
// ==========================================
//
// Production (NODE_ENV=production) fails closed:
//   * JWT_ACCESS_SECRET / JWT_REFRESH_SECRET must be EXPLICITLY supplied.
//     A missing secret never silently becomes a usable secret.
//   * Secrets must be >= 32 characters and must not match known placeholder
//     or development-default values.
//   * The two secrets must differ from each other.
//
// Development/test keep the historical convenient defaults so local
// development and the test suite continue to work unchanged. Those default
// values are themselves on the production denylist, so a development
// fallback can never be accepted in production.

const DEV_JWT_ACCESS_DEFAULT = 'dev-jwt-access-secret-minimum-32-chars-long';
const DEV_JWT_REFRESH_DEFAULT = 'dev-jwt-refresh-secret-minimum-32-chars-long';
const TEST_JWT_ACCESS_DEFAULT = 'test-jwt-access-secret-minimum-32-chars-long';
const TEST_JWT_REFRESH_DEFAULT = 'test-jwt-refresh-secret-minimum-32-chars-long';

// Values that must NEVER be accepted as a production JWT secret:
// the development/test fallback defaults and the placeholder values that
// ship in .env.example / server/.env.example templates.
const KNOWN_INSECURE_SECRETS: ReadonlySet<string> = new Set([
  DEV_JWT_ACCESS_DEFAULT,
  DEV_JWT_REFRESH_DEFAULT,
  TEST_JWT_ACCESS_DEFAULT,
  TEST_JWT_REFRESH_DEFAULT,
  'change-this-to-a-strong-random-secret',
  'change-this-to-another-strong-random-secret',
  'change-this-to-a-strong-random-secret-min-16-chars',
  'change-this-to-another-strong-random-secret-min-16-chars',
  'change-this-to-a-strong-random-secret-minimum-32-chars',
  'change-this-to-another-strong-random-secret-minimum-32-chars',
  'changeme',
  'change-me',
  'secret',
  'jwt-secret',
  'jwt_secret',
  'your-secret',
  'your-secret-here',
  'your-jwt-secret',
  'your-jwt-access-secret',
  'your-jwt-refresh-secret',
  'supersecret',
  'super-secret',
]);

/**
 * Detect values that must never be accepted as a production JWT secret.
 * Exported for focused security tests. Never logs or returns the value.
 */
export function isInsecureJwtSecret(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (KNOWN_INSECURE_SECRETS.has(v)) return true;
  // Template placeholder markers
  if (v.includes('change-this') || v.includes('change-me') || v.includes('changeme')) return true;
  if (v.includes('placeholder') || v.includes('dummy-secret') || v.includes('sample-secret')) return true;
  // Trivial values
  if (v.length > 0 && /^(.)\1+$/.test(v)) return true; // a single repeated character
  if (/^\d+$/.test(v)) return true; // digits only
  return false;
}

function productionJwtSecret(field: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET') {
  return z
    .string({
      required_error: `${field} is required when NODE_ENV=production — the server refuses to start without it`,
      invalid_type_error: `${field} must be a string`,
    })
    .min(32, `${field} must be at least 32 characters in production`)
    .refine((v) => !isInsecureJwtSecret(v), {
      message: `${field} matches a known placeholder or development default and is rejected in production — generate a real secret (e.g. openssl rand -base64 48)`,
    });
}

function devJwtSecret(field: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET', fallback: string) {
  return z.string().min(16, `${field} must be at least 16 characters`).default(fallback);
}

/**
 * Build the environment schema for a given environment mode.
 * Exported for focused security tests.
 */
export function buildEnvSchema(opts: { production: boolean; test: boolean }) {
  return z
    .object({
      DATABASE_URL: z.string().url().default('postgresql://postgres:postgres@localhost:5432/beverage_pos?schema=public'),
      JWT_ACCESS_SECRET: opts.production
        ? productionJwtSecret('JWT_ACCESS_SECRET')
        : devJwtSecret('JWT_ACCESS_SECRET', opts.test ? TEST_JWT_ACCESS_DEFAULT : DEV_JWT_ACCESS_DEFAULT),
      JWT_REFRESH_SECRET: opts.production
        ? productionJwtSecret('JWT_REFRESH_SECRET')
        : devJwtSecret('JWT_REFRESH_SECRET', opts.test ? TEST_JWT_REFRESH_DEFAULT : DEV_JWT_REFRESH_DEFAULT),
      JWT_ACCESS_EXPIRY: z.string().default('15m'),
      JWT_REFRESH_EXPIRY: z.string().default('7d'),
      PORT: z.coerce.number().default(4000),
      NODE_ENV: z.enum(['development', 'production', 'test']).default(opts.test ? 'test' : 'development'),
      CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001,http://localhost:5173,http://localhost:5174'),
      RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
      RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
      BCRYPT_SALT_ROUNDS: z.coerce.number().default(10),
      MAX_LOGIN_ATTEMPTS: z.coerce.number().default(5),
      LOCKOUT_DURATION_MINUTES: z.coerce.number().default(15),
      SEED_ADMIN_USERNAME: z.string().default('admin'),
      SEED_ADMIN_PASSWORD: z.string().default('Admin@123'),
      SEED_ADMIN_EMAIL: z.string().email().default('admin@beverage-pos.local'),
      SEED_BUSINESS_NAME: z.string().default('Beverage POS Development'),
    })
    .superRefine((data, ctx) => {
      if (opts.production && data.JWT_ACCESS_SECRET === data.JWT_REFRESH_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values in production',
        });
      }
    });
}

/**
 * Pure environment validation (no process.exit, no logging, no mutation).
 * Exported for focused security tests.
 */
export function validateEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const opts = {
    production: env.NODE_ENV === 'production',
    test: env.NODE_ENV === 'test' || env.npm_lifecycle_event === 'test',
  };
  return buildEnvSchema(opts).safeParse(env);
}

const parsed = validateEnvironment(process.env);

if (!parsed.success) {
  console.error('[CONFIG ERROR] Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '[CONFIG ERROR] Refusing to start: production requires explicit, strong JWT_ACCESS_SECRET and JWT_REFRESH_SECRET values.'
    );
  }
  process.exit(1);
}

export const config = parsed.data;

export const corsOrigins = config.CORS_ORIGINS.split(',').map(s => s.trim());
