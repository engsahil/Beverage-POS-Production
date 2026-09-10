# Beverage POS — Production Setup & Operations Guide

Monorepo: `server/` (Express + Prisma + PostgreSQL API), `apps/admin/` (admin dashboard, Vite),
`apps/pos/` (POS terminal, Vite). API base path: `/api/v1`.

## 1. Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+ (empty database, e.g. `beverage_pos`)
- OpenSSL (for generating secrets) — or any random-string generator

## 2. Environment files (no secrets are committed — templates only)

| Template (committed)        | Copy to (git-ignored, never commit) |
|-----------------------------|-------------------------------------|
| `.env.example` (repo root)  | `.env` (repo root)                  |
| `server/.env.example`       | `server/.env` (optional override)   |
| `apps/admin/.env.example`   | `apps/admin/.env`                   |
| `apps/pos/.env.example`     | `apps/pos/.env`                     |

The server reads env from repo-root `.env` first, then `server/.env` (see
`server/src/lib/config.ts`). Every key is validated with zod at startup — an
invalid/missing key aborts boot with a `[CONFIG ERROR]` message naming the key.

### Required backend keys

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/beverage_pos?schema=public
JWT_ACCESS_SECRET=<random string, min 16 chars>
JWT_REFRESH_SECRET=<different random string, min 16 chars>
```

Generate secrets: `openssl rand -base64 48`

### Key backend keys (see `.env.example` for the full list)

| Key | Default (dev) | Notes |
|---|---|---|
| `PORT` | `4000` | API listen port |
| `NODE_ENV` | `development` | `development \| production \| test` |
| `JWT_ACCESS_EXPIRY` / `JWT_REFRESH_EXPIRY` | `15m` / `7d` | Token lifetimes |
| `CORS_ORIGINS` | localhost `:5173,:5174` (+ legacy) | Comma-separated; **must list your production frontend origins** |
| `RATE_LIMIT_*` | `900000` / `100` | Global rate-limit window (ms) / max requests |
| `BCRYPT_SALT_ROUNDS` | `10` | Use `12` in production |
| `MAX_LOGIN_ATTEMPTS` / `LOCKOUT_DURATION_MINUTES` | `5` / `15` | Brute-force lockout |
| `SEED_*` | dev admin + business | Only used by `prisma db seed` |
| `STORAGE_PROVIDER` | `local` | `local` or `s3` (backups/uploads) |
| `LOCAL_STORAGE_PATH` | `./storage` | Used when provider is `local` |
| `S3_*` | — | Only when `STORAGE_PROVIDER=s3` |
| `WHATSAPP_META_*` | — | Only if WhatsApp notifications are used |

### Frontend keys (per app `.env`)

| Key | Dev default | Notes |
|---|---|---|
| `VITE_API_URL` | `/api/v1` (vite proxy → `:4000`) | Split-deploy: `https://api.yourdomain.com/api/v1` |
| `VITE_POS_URL` (admin only) | `http://localhost:5173` | "Launch POS" button target |

## 3. Install, migrate, seed, run (local)

```bash
# from the repo root
npm install            # installs server + both apps (workspaces)

# 1) create database + schema
cd server
npx prisma migrate deploy     # production (applies committed migrations), or:
npx prisma migrate dev        # local dev (creates/applies migrations)

# 2) seed roles/permissions + first business + admin user
npm run db:seed               # uses SEED_* from .env (== npm run db:seed --workspace=server)

# 3) start the API
npm run dev                   # :4000 with reload, or: npm start (serves dist/)
```

```bash
# in two more terminals, from the repo root:
npm run dev --workspace=apps/pos    # POS terminal → http://localhost:5173
npm run dev --workspace=apps/admin  # Admin dashboard → http://localhost:5174
```

Vite proxies `/api/*` to `http://localhost:4000` in dev, so the default
`VITE_API_URL=/api/v1` works with no extra config.

## 4. First login & cashier setup

1. Log in to the **admin** app (`:5174`) with `SEED_ADMIN_USERNAME` /
   `SEED_ADMIN_PASSWORD` from your `.env` (defaults: `admin` / `Admin@123` — change
   immediately in production via Users → reset password).
2. Create a **branch** (required: users, shifts and checkouts are branch-scoped).
3. Create **cashier users** (Users → create; assign the `cashier` role and a branch).
   Password policy: min 8 chars, uppercase + lowercase + number + special character.
4. Seed data order for a working POS: Categories → Units → Products (+ variants) →
   Opening Stock (per branch) → POS login as cashier → open shift → sell.
5. Cashiers need an **active shift** per branch (`shifts.open` permission, included in
   the cashier role) before checkout; the POS header shows shift state.

## 5. Production build & deploy notes

```bash
npm run build --workspace=apps/pos     # tsc + vite → apps/pos/dist
npm run build --workspace=apps/admin   # tsc + vite → apps/admin/dist
cd server && npx tsc                   # emits server/dist (see note below)
```

- Frontend builds are strict (`tsc && vite build`) and must pass with zero errors.
- `server` typecheck currently reports ~159 **pre-existing** errors caused by a stale
  generated Prisma client in this snapshot (`Prisma.XWhereInput has no exported
  member` + cascading implicit-`any`s); `tsc` still **emits** `dist/` successfully.
  After `prisma generate` against the real database, re-run `npx tsc --noEmit` and
  expect that baseline to shrink — do not gate deploys on it until then.
- Serve `apps/*/dist` statically (Nginx, Vercel, Netlify, S3+CloudFront…) and point
  `VITE_API_URL` at the API origin; add both frontend origins to `CORS_ORIGINS`.
- Run the API with `NODE_ENV=production`, a managed PostgreSQL, and `pm2`/`systemd`
  (or a container). Keep `JWT_*_SECRET` in the host's secret manager, never in git.
- Backups: `STORAGE_PROVIDER=local` writes under `LOCAL_STORAGE_PATH` (BigInt-safe
  JSON serialization is built in); use `s3` + `S3_*` for durable off-host backups.

### Vercel notes (frontends)

- Create two projects: root directory `apps/pos`, and `apps/admin` (framework: Vite).
- Build command `npm run build`, output directory `dist`.
- Env per project: `VITE_API_URL=https://<your-api-host>/api/v1`
  (+ `VITE_POS_URL=https://<pos-host>` on the admin project).
- The Express API is **not** Vercel-serverless compatible as-is (Prisma + sockets +
  long-lived refresh flow) — host it on a VM/container (Render, Railway, Fly, EC2…).

## 6. Offline behavior (POS)

- If checkout is attempted with no network, the sale is queued in the browser's
  `localStorage` (`pos_offline_queue_v1`) and the cart is cleared with a notice.
- The **Offline Queue** page (`/offline`) lists queued ops and syncs them via
  authenticated `POST /api/v1/sync/process` (requires `pos.offline.sync`, granted to
  cashiers). Failures keep the item queued with a retry count + error message.
- Auto-sync cadence comes from `GET /settings/pos-offline` (defaults: on, 30s).

## 7. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `[CONFIG ERROR]` at boot | A `.env` key is missing/invalid — message names the key; compare with `.env.example` |
| `401` on every request | `JWT_*_SECRET` changed without re-login, or clock skew; log in again |
| `403` on a specific page | Role lacks the permission the route requires; check Roles page / seed |
| Checkout fails: "Branch is required" | Cashier user has no branch assigned (Users → edit) |
| Shift never shows active | Open a shift for the cashier's branch first; POS passes `?branchId=` automatically |
| Empty dropdowns (branches/products) | Seed order (§4) not followed; opening stock missing for the branch |
| Prisma `P1001`/`P1000` | `DATABASE_URL` wrong or DB not reachable; check host/credentials/network |
