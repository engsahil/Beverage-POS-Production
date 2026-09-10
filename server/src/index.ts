import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { config, corsOrigins } from './lib/config.js';
import { logger } from './lib/logger.js';
import prisma from './lib/prisma.js';
import { apiLimiter } from './api/middleware/rateLimiter.js';
import { errorHandler, notFoundHandler } from './api/middleware/errorHandler.js';
import { requestTimer, cacheControl, securityHeaders } from './api/middleware/performance.js';
import { socketManager } from './realtime/socketManager.js';
import authRoutes from './api/routes/auth.js';
import userRoutes from './api/routes/users.js';
import roleRoutes from './api/routes/roles.js';
import permissionRoutes from './api/routes/permissions.js';
import categoryRoutes from './api/routes/categories.js';
import unitRoutes from './api/routes/units.js';
import productRoutes from './api/routes/products.js';
import inventoryRoutes from './api/routes/inventory.js';
import vendorRoutes from './api/routes/vendors.js';
import purchaseRoutes from './api/routes/purchases.js';
import stockCountRoutes from './api/routes/stockCounts.js';
import transferRoutes from './api/routes/transfers.js';
import batchRoutes from './api/routes/batches.js';
import posRoutes from './api/routes/pos.js';
import saleRoutes from './api/routes/sales.js';
import receiptRoutes from './api/routes/receipts.js';
import customerRoutes from './api/routes/customers.js';
import expenseCategoryRoutes from './api/routes/expenseCategories.js';
import expenseRoutes from './api/routes/expenses.js';
import claimRoutes from './api/routes/claims.js';
import targetRoutes from './api/routes/targets.js';
import commissionRoutes from './api/routes/commissions.js';
import shiftRoutes from './api/routes/shifts.js';
import dailyRecordRoutes from './api/routes/dailyRecords.js';
import reportRoutes from './api/routes/reports.js';
import dashboardRoutes from './api/routes/dashboard.js';
import offlineRoutes from './api/routes/offline.js';
import syncRoutes from './api/routes/sync.js';
import backupRoutes from './api/routes/backups.js';
import whatsappRoutes from './api/routes/whatsapp.js';
import webhookRoutes from './api/routes/webhooks.js';
import dataManagementRoutes from './api/routes/dataManagement.js';
import settingsRoutes from './api/routes/settings.js';
import performanceRoutes from './api/routes/performance.js';
import branchRoutes from './api/routes/branches.js';
import customerPaymentRoutes from './api/routes/customerPayments.js';
import auditLogRoutes from './api/routes/auditLogs.js';

const app = express();
const httpServer = createServer(app);

// Global BigInt-safe JSON serialization (API boundary safety net).
// Prisma BigInt columns would otherwise crash res.json() with
// "Do not know how to serialize a BigInt". Database values are untouched.
app.set('json replacer', (_key: string, value: unknown) =>
  typeof value === 'bigint' ? Number(value) : value
);

// Initialize Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigins,
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// Initialize socket manager
socketManager.initialize(io);

// Start periodic cleanup of stale connections (every 30 seconds)
setInterval(() => {
  socketManager.cleanupStaleConnections();
}, 30000);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Performance middleware
app.use(compression());
app.use(requestTimer);
app.use(securityHeaders);
app.use(cacheControl);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use('/api', apiLimiter);

// Health check
app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/roles', roleRoutes);
app.use('/api/v1/permissions', permissionRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/units', unitRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/vendors', vendorRoutes);
app.use('/api/v1/purchases', purchaseRoutes);
app.use('/api/v1/stock-counts', stockCountRoutes);
app.use('/api/v1/transfers', transferRoutes);
app.use('/api/v1/batches', batchRoutes);
app.use('/api/v1/pos', posRoutes);
app.use('/api/v1/sales', saleRoutes);
app.use('/api/v1/receipts', receiptRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/expense-categories', expenseCategoryRoutes);
app.use('/api/v1/expenses', expenseRoutes);
app.use('/api/v1/claims', claimRoutes);
app.use('/api/v1/targets', targetRoutes);
app.use('/api/v1/commissions', commissionRoutes);
app.use('/api/v1/shifts', shiftRoutes);
app.use('/api/v1/daily-records', dailyRecordRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/offline', offlineRoutes);
app.use('/api/v1/sync', syncRoutes);
app.use('/api/v1/backups', backupRoutes);
app.use('/api/v1/whatsapp', whatsappRoutes);
app.use('/api/v1/data', dataManagementRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/performance', performanceRoutes);
app.use('/api/v1/branches', branchRoutes);
app.use('/api/v1/customer-payments', customerPaymentRoutes);
app.use('/api/v1/audit-logs', auditLogRoutes);

// Webhook routes (no authentication)
app.use('/webhooks', webhookRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('Database connected successfully');

    // Start HTTP server (with Socket.IO)
    httpServer.listen(config.PORT, () => {
      logger.info(`Server started`, {
        port: config.PORT,
        env: config.NODE_ENV,
        url: `http://localhost:${config.PORT}`,
        realtime: 'enabled',
      });
    });
  } catch (error) {
    logger.error('Failed to start server', { error: String(error) });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  httpServer.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  httpServer.close();
  await prisma.$disconnect();
  process.exit(0);
});

// Start the server
startServer();

export default app;
