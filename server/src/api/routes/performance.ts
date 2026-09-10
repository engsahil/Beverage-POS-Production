/**
 * Phase 24: Performance Monitoring Routes
 * Provides system health and performance metrics
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import prisma from '../../lib/prisma.js';
import { config } from '../../lib/config.js';

const router = Router();

/**
 * GET /api/v1/performance/health
 * Detailed health check (requires authentication)
 */
router.get('/health', authenticate, authorize('system.view'), async (_req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    
    // Check database connection
    let dbStatus = 'healthy';
    let dbLatency = 0;
    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatency = Date.now() - dbStart;
    } catch (error) {
      dbStatus = 'unhealthy';
    }
    
    // Get system metrics
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    // Count active connections (approximate)
    const activeConnections = await prisma.session.count({
      where: {
        expiresAt: {
          gt: new Date(),
        },
      },
    });
    
    // Get queue status
    const pendingSync = await prisma.syncConflict.count({
      where: {
        status: 'PENDING',
      },
    });
    
    const health = {
      status: dbStatus === 'healthy' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: Math.floor(uptime),
        formatted: formatUptime(uptime),
      },
      database: {
        status: dbStatus,
        latency: `${dbLatency}ms`,
      },
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
      },
      connections: {
        active: activeConnections,
      },
      sync: {
        pendingConflicts: pendingSync,
      },
      environment: config.NODE_ENV,
      version: '1.0.0',
      responseTime: `${Date.now() - startTime}ms`,
    };
    
    return res.json({
      success: true,
      data: health,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: error instanceof Error ? error.message : 'Health check failed',
      },
    });
  }
});

/**
 * GET /api/v1/performance/metrics
 * Performance metrics (requires authentication)
 */
router.get('/metrics', authenticate, authorize('system.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const businessId = req.user.businessId;
    
    // Get business metrics
    const [
      productCount,
      customerCount,
      saleCount,
      inventoryCount,
      userCount,
    ] = await Promise.all([
      prisma.product.count({ where: { businessId } }),
      prisma.customer.count({ where: { businessId } }),
      prisma.sale.count({ where: { businessId } }),
      prisma.inventory.count({ where: { businessId } }),
      prisma.user.count({ where: { businessId } }),
    ]);
    
    // Get recent activity
    const recentSales = await prisma.sale.count({
      where: {
        businessId,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
    });
    
    const metrics = {
      business: {
        products: productCount,
        customers: customerCount,
        sales: {
          total: saleCount,
          last24h: recentSales,
        },
        inventory: inventoryCount,
        users: userCount,
      },
      timestamp: new Date().toISOString(),
    };
    
    return res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'METRICS_FAILED',
        message: error instanceof Error ? error.message : 'Failed to fetch metrics',
      },
    });
  }
});

/**
 * GET /api/v1/performance/database
 * Database statistics (requires authentication)
 */
router.get('/database', authenticate, authorize('system.view'), async (_req: Request, res: Response) => {
  try {
    // Get table counts
    const tables = [
      'products',
      'categories',
      'units',
      'customers',
      'vendors',
      'sales',
      'saleItems',
      'payments',
      'inventory',
      'stockMovements',
      'purchases',
      'purchaseItems',
      'expenses',
      'claims',
      'users',
      'sessions',
      'auditLogs',
    ];
    
    const counts: Record<string, number> = {};
    
    for (const table of tables) {
      try {
        const count = await (prisma as any)[table].count();
        counts[table] = count;
      } catch (error) {
        counts[table] = -1; // Table might not exist
      }
    }
    
    return res.json({
      success: true,
      data: {
        tables: counts,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_STATS_FAILED',
        message: error instanceof Error ? error.message : 'Failed to fetch database stats',
      },
    });
  }
});

/**
 * Helper: Format uptime
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  
  return parts.join(' ');
}

export default router;
