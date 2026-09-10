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

const isTest = process.env.NODE_ENV === 'test' || process.env.npm_lifecycle_event === 'test';

const envSchema = z.object({
  DATABASE_URL: z.string().url().default(isTest ? 'postgresql://postgres:postgres@localhost:5432/beverage_pos?schema=public' : (process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/beverage_pos?schema=public')),
  JWT_ACCESS_SECRET: z.string().min(16).default(isTest ? 'test-jwt-access-secret-minimum-32-chars-long' : (process.env.JWT_ACCESS_SECRET || 'dev-jwt-access-secret-minimum-32-chars-long')),
  JWT_REFRESH_SECRET: z.string().min(16).default(isTest ? 'test-jwt-refresh-secret-minimum-32-chars-long' : (process.env.JWT_REFRESH_SECRET || 'dev-jwt-refresh-secret-minimum-32-chars-long')),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default(isTest ? 'test' : 'development'),
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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("[CONFIG ERROR] Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

export const corsOrigins = config.CORS_ORIGINS.split(',').map(s => s.trim());
