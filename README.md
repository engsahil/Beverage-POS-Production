# Beverage POS - Complete Point of Sale System

A professional, production-ready Point of Sale system designed for Pakistani beverage businesses. Built with TypeScript, React, Node.js, Express, and PostgreSQL.

## Architecture

```
beverage-pos/
├── apps/
│   ├── pos/          # POS Frontend (React + Vite, port 3000)
│   └── admin/        # Admin Dashboard (React + Vite, port 3001)
├── server/           # Backend API (Express + Prisma, port 4000)
│   ├── src/
│   │   ├── api/      # Routes, middleware, validators
│   │   ├── services/ # Business logic
│   │   ├── realtime/ # Socket.IO events
│   │   └── lib/      # Config, Prisma, Logger
│   ├── prisma/       # Database schema + migrations
│   └── tests/        # Test suites
└── packages/         # Shared packages
    ├── offline-db/   # IndexedDB offline engine
    ├── realtime-client/ # Socket.IO client
    ├── types/        # Shared TypeScript types
    └── utils/        # Shared utilities
```

## Features

### POS (Cashier Interface)
- Product search by name, SKU, barcode
- Barcode scanner support (USB keyboard input)
- Cart management with quantity controls
- Per-item and order-level discounts
- Tax calculation per product
- Multiple payment methods (Cash, Card, Bank Transfer)
- Split payment support
- Customer selection for credit sales
- Shift open/close with cash reconciliation
- Receipt preview, print, and PDF download
- Online/offline indicator
- Sales history with reprint
- Hold/resume sales
- Keyboard shortcuts (F2=New, F4=Pay, F5=Hold, F8=History, Escape=Close)

### Admin Dashboard
- Dashboard with KPIs and charts
- Product management (CRUD, variants)
- Category and unit management
- Inventory tracking with stock adjustments
- Stock counts with variance tracking
- Stock transfers between branches
- Customer management with credit ledger and payments
- Vendor management
- Purchase orders (create, receive)
- Expense tracking with categories
- Claims management (damage, expiry, supplier)
- Sales targets and commission rules
- Cashier shift management
- Daily record open/close
- Sales reports (daily, weekly, monthly)
- User management (CRUD, enable/disable, password reset)
- Role and permission management (RBAC)
- Settings (business profile, receipt, POS)
- WhatsApp integration configuration
- Cloud backup management
- Data import (CSV upload with validation)
- Audit log viewer

### Backend (38 Features)
- JWT authentication with refresh tokens
- Role-based access control (RBAC)
- Complete CRUD for all entities
- Financial calculations with Decimal precision
- Stock ledger with full audit trail
- Idempotency for duplicate prevention
- Real-time events via Socket.IO
- Offline sync engine with conflict resolution
- Cloud backup with restore capability
- WhatsApp Business API integration
- CSV/Excel import/export
- Rate limiting and security headers

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- npm 9+

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your database credentials and secrets
```

### 3. Set Up Database
```bash
cd server
npx prisma migrate deploy
npx prisma db seed
```

### 4. Start Development Servers
```bash
# Terminal 1: Backend
cd server && npm run dev

# Terminal 2: POS Frontend
cd apps/pos && npm run dev

# Terminal 3: Admin Frontend
cd apps/admin && npm run dev
```

### 5. Access Applications
- **POS:** http://localhost:3000
- **Admin:** http://localhost:3001
- **API:** http://localhost:4000
- **Health:** http://localhost:4000/health

## Production Build

```bash
# Build all frontends
cd apps/pos && npm run build
cd apps/admin && npm run build

# Build backend
cd server && npm run build

# Start production server
cd server && npm start
```

## Database

### Run Migrations
```bash
cd server
npx prisma migrate dev --name migration_name
npx prisma migrate deploy  # Production
```

### Seed Data
```bash
cd server
npx prisma db seed
```

### Default Credentials (after seed)
- **Admin:** username: `admin`, password: `Admin@123`
- **Cashier:** username: `cashier`, password: `Cashier@123`

## Testing

```bash
# Backend tests
cd server && npm test

# Frontend type checks
cd apps/pos && npx tsc --noEmit
cd apps/admin && npx tsc --noEmit
```

## Environment Variables

See `.env.example` for all required variables.

Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT signing secret
- `PORT` - Server port (default: 4000)
- `CORS_ORIGINS` - Allowed frontend origins
- `STORAGE_PROVIDER` - Backup storage (local/s3)
- `WHATSAPP_API_TOKEN` - WhatsApp Business API token

## Offline Functionality

The POS supports offline operation:
1. Products are cached locally in IndexedDB
2. Sales can be created while offline
3. Queued sales sync automatically when online
4. Conflicts are detected and resolved safely
5. Duplicate prevention via idempotency keys

## Security

- JWT authentication with short-lived access tokens
- Refresh token rotation
- Password hashing with bcrypt
- Role-based access control at API level
- Rate limiting on sensitive endpoints
- CORS configuration
- Helmet security headers
- Input validation on all endpoints
- SQL injection protection via Prisma ORM
- No secrets in frontend bundles

## Deployment

### Docker (recommended)
```bash
# Build and run with docker-compose
docker-compose up -d
```

### Manual Deployment
1. Set up PostgreSQL
2. Configure environment variables
3. Run migrations
4. Build frontends
5. Start backend server
6. Configure reverse proxy (nginx)
7. Enable HTTPS

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, React Router
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL, Prisma ORM
- **Real-time:** Socket.IO
- **Offline:** IndexedDB
- **Auth:** JWT, bcrypt
- **Testing:** Node.js Test Runner

## License

Proprietary - All rights reserved.
