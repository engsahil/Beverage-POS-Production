# Server - Beverage POS API

Backend API server for the Beverage Sales & POS Management System.

## Tech Stack

- **Runtime:** Node.js 20+
- **Framework:** Express.js
- **Language:** TypeScript
- **ORM:** Prisma
- **Database:** PostgreSQL
- **Authentication:** JWT (access + refresh tokens)
- **Validation:** Zod

## Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- npm 10+

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your database credentials and secrets
# IMPORTANT: Change JWT_ACCESS_SECRET and JWT_REFRESH_SECRET in production

# Run database migrations
npm run db:migrate

# Seed the database (creates admin user, roles, permissions)
npm run db:seed

# Start development server
npm run dev
```

### Environment Variables

See `.env.example` for all required environment variables.

Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_ACCESS_SECRET` - Secret for access tokens (change in production!)
- `JWT_REFRESH_SECRET` - Secret for refresh tokens (change in production!)
- `PORT` - Server port (default: 4000)
- `SEED_ADMIN_USERNAME` - Initial admin username
- `SEED_ADMIN_PASSWORD` - Initial admin password (change after first login!)

## API Endpoints

### Authentication
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Logout
- `POST /api/v1/auth/change-password` - Change password
- `GET /api/v1/auth/me` - Get current user

### Users
- `GET /api/v1/users` - List users
- `GET /api/v1/users/:id` - Get user
- `POST /api/v1/users` - Create user
- `PUT /api/v1/users/:id` - Update user
- `POST /api/v1/users/:id/disable` - Disable user
- `POST /api/v1/users/:id/enable` - Enable user
- `POST /api/v1/users/reset-password` - Reset user password

### Roles
- `GET /api/v1/roles` - List roles
- `GET /api/v1/roles/:id` - Get role
- `POST /api/v1/roles` - Create role
- `PUT /api/v1/roles/:id` - Update role
- `DELETE /api/v1/roles/:id` - Delete role

### Permissions
- `GET /api/v1/permissions` - List permissions
- `GET /api/v1/permissions/grouped` - Get permissions by module

## Default Credentials

After running `npm run db:seed`:

- **Username:** admin
- **Password:** Admin@123

⚠️ **CHANGE THESE IN PRODUCTION!**

## Scripts

```bash
npm run dev          # Start development server with hot reload
npm run build        # Build for production
npm run start        # Start production server
npm run test         # Run tests
npm run type-check   # Check TypeScript types
npm run db:migrate   # Run database migrations
npm run db:seed      # Seed database
npm run db:studio    # Open Prisma Studio
```

## Architecture

```
src/
├── api/
│   ├── routes/          # API route handlers
│   ├── middleware/      # Express middleware
│   └── validators/      # Zod validation schemas
├── services/            # Business logic
├── lib/                 # Core libraries (prisma, config, logger)
├── utils/               # Utility functions
└── index.ts             # Server entry point
```

## Security Features

- JWT-based authentication with token rotation
- Password hashing with bcrypt
- Rate limiting on all endpoints
- Input validation with Zod
- Role-based access control (RBAC)
- Audit logging for sensitive operations
- CORS protection
- Helmet security headers
- SQL injection protection (via Prisma)

## License

MIT
