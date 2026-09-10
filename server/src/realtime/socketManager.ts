/**
 * Phase 18: Socket Manager
 * 
 * Handles WebSocket authentication, connection management, and room assignments.
 * Ensures business/branch isolation and proper authorization.
 */

import { Server, Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/tokens.js';
import { SocketContext, getBusinessRoom, getBranchRoom, getUserRoom } from './types.js';
import { eventEmitter } from './eventEmitter.js';
import prisma from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

interface PosStatus {
  deviceId: string;
  cashierId: string;
  cashierName: string;
  businessId: string;
  branchId: string;
  branchName: string;
  status: 'ONLINE' | 'OFFLINE' | 'SYNCING' | 'SYNC_ERROR';
  lastHeartbeat: Date;
  pendingOperations: number;
}

class SocketManager {
  private posStatuses: Map<string, PosStatus> = new Map(); // deviceId -> status

  /**
   * Initialize Socket.IO server
   */
  initialize(serverIo: Server): void {
    // Authentication middleware
    serverIo.use(async (socket, next) => {
      try {
        await this.authenticateSocket(socket);
        next();
      } catch (error) {
        logger.warn('Socket authentication failed', {
          error: error instanceof Error ? error.message : String(error),
          socketId: socket.id,
        });
        next(new Error('Authentication failed'));
      }
    });

    // Connection handler
    serverIo.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    // Initialize event emitter
    eventEmitter.initialize(serverIo);

    logger.info('Socket.IO server initialized');
  }

  /**
   * Authenticate socket connection using JWT token
   */
  private async authenticateSocket(socket: Socket): Promise<void> {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token || typeof token !== 'string') {
      throw new Error('No authentication token provided');
    }

    // Verify JWT token
    const payload = verifyAccessToken(token);

    // Get user details
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
        branch: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.isActive) {
      throw new Error('User account is disabled');
    }

    // Verify business matches
    if (user.businessId !== payload.businessId) {
      throw new Error('Business mismatch');
    }

    // Extract permissions
    const permissions = user.role?.permissions.map(rp => rp.permission.name) || [];

    // Determine client type from query params
    const clientType = (socket.handshake.query.clientType as string) || 'ADMIN';

    // Build socket context
    const context: SocketContext = {
      userId: user.id,
      businessId: user.businessId,
      branchId: user.branchId || payload.branchId || undefined,
      roleId: user.roleId || undefined,
      permissions,
      deviceId: socket.handshake.query.deviceId as string || undefined,
      clientType: clientType === 'POS' ? 'POS' : 'ADMIN',
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
    };

    // Attach context to socket
    socket.data.context = context;
  }

  /**
   * Handle new socket connection
   */
  private handleConnection(socket: Socket): void {
    const context = socket.data.context as SocketContext;

    logger.info('Socket connected', {
      socketId: socket.id,
      userId: context.userId,
      businessId: context.businessId,
      clientType: context.clientType,
    });

    // Join business room
    socket.join(getBusinessRoom(context.businessId));

    // Join branch room if applicable
    if (context.branchId) {
      socket.join(getBranchRoom(context.businessId, context.branchId));
    }

    // Join user room (for direct messages)
    socket.join(getUserRoom(context.userId));

    // Handle POS-specific setup
    if (context.clientType === 'POS' && context.deviceId) {
      this.handlePosConnection(socket, context);
    }

    // Register event handlers
    this.registerSocketHandlers(socket);

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(socket, reason);
    });
  }

  /**
   * Handle POS client connection
   */
  private handlePosConnection(_socket: Socket, context: SocketContext): void {
    if (!context.deviceId || !context.branchId) return;

    // Get branch name
    prisma.branch.findUnique({
      where: { id: context.branchId },
      select: { name: true },
    }).then(branch => {
      if (!branch) return;

      // Store POS status
      const status: PosStatus = {
        deviceId: context.deviceId!,
        cashierId: context.userId,
        cashierName: '', // Will be populated from user lookup
        businessId: context.businessId,
        branchId: context.branchId!,
        branchName: branch.name,
        status: 'ONLINE',
        lastHeartbeat: new Date(),
        pendingOperations: 0,
      };

      this.posStatuses.set(context.deviceId!, status);

      // Get cashier name
      prisma.user.findUnique({
        where: { id: context.userId },
        select: { fullName: true },
      }).then(user => {
        if (user) {
          status.cashierName = user.fullName;
        }
      });

      // Emit POS connected event
      const event = eventEmitter.createBaseEvent(
        'pos:connected',
        context.businessId,
        context.userId,
        context.branchId,
        context.deviceId
      );

      eventEmitter.emitToBusiness({
        ...event,
        eventType: 'pos:connected',
        data: {
          deviceId: context.deviceId!,
          cashierId: context.userId,
          cashierName: status.cashierName,
          branchId: context.branchId!,
          branchName: branch.name,
        },
      } as any);
    });
  }

  /**
   * Register socket event handlers
   */
  private registerSocketHandlers(socket: Socket): void {
    const context = socket.data.context as SocketContext;

    // Heartbeat handler
    socket.on('heartbeat', (data: any) => {
      this.handleHeartbeat(socket, data);
    });

    // Sync status update (from POS)
    socket.on('sync:status', (data: any) => {
      this.handleSyncStatusUpdate(socket, data);
    });

    // Request POS status list (from Admin)
    socket.on('pos:status:list', async (callback: Function) => {
      if (context.clientType !== 'ADMIN') {
        callback({ error: 'Unauthorized' });
        return;
      }

      const statuses = Array.from(this.posStatuses.values()).filter(
        s => s.businessId === context.businessId
      );

      callback({ statuses });
    });
  }

  /**
   * Handle heartbeat from POS
   */
  private handleHeartbeat(socket: Socket, data: any): void {
    const context = socket.data.context as SocketContext;

    if (context.clientType !== 'POS' || !context.deviceId) {
      return;
    }

    // Update last heartbeat
    context.lastHeartbeat = new Date();

    // Update POS status
    const status = this.posStatuses.get(context.deviceId);
    if (status) {
      status.lastHeartbeat = new Date();
      status.status = data.status || 'ONLINE';
      status.pendingOperations = data.pendingOperations || 0;
    }
  }

  /**
   * Handle sync status update from POS
   */
  private handleSyncStatusUpdate(socket: Socket, data: any): void {
    const context = socket.data.context as SocketContext;

    if (context.clientType !== 'POS' || !context.deviceId) {
      return;
    }

    const status = this.posStatuses.get(context.deviceId);
    if (!status) return;

    const previousStatus = status.status;
    status.status = data.status;
    status.pendingOperations = data.pendingCount || 0;

    // Emit sync status changed event if status changed
    if (previousStatus !== data.status) {
      const event = eventEmitter.createBaseEvent(
        'pos:sync_status_changed',
        context.businessId,
        context.userId,
        context.branchId,
        context.deviceId
      );

      eventEmitter.emitToBusiness({
        ...event,
        eventType: 'pos:sync_status_changed',
        data: {
          deviceId: context.deviceId,
          cashierId: context.userId,
          previousStatus,
          newStatus: data.status,
          pendingCount: data.pendingCount || 0,
          conflictCount: data.conflictCount || 0,
          lastSyncAt: data.lastSyncAt,
        },
      } as any);
    }
  }

  /**
   * Handle socket disconnection
   */
  private handleDisconnection(socket: Socket, reason: string): void {
    const context = socket.data.context as SocketContext;

    logger.info('Socket disconnected', {
      socketId: socket.id,
      userId: context.userId,
      reason,
    });

    // Handle POS disconnection
    if (context.clientType === 'POS' && context.deviceId) {
      const status = this.posStatuses.get(context.deviceId);
      if (status) {
        // Emit POS disconnected event
        const event = eventEmitter.createBaseEvent(
          'pos:disconnected',
          context.businessId,
          context.userId,
          context.branchId,
          context.deviceId
        );

        eventEmitter.emitToBusiness({
          ...event,
          eventType: 'pos:disconnected',
          data: {
            deviceId: context.deviceId,
            cashierId: context.userId,
            cashierName: status.cashierName,
            reason,
          },
        } as any);

        // Remove from status map
        this.posStatuses.delete(context.deviceId);
      }
    }
  }

  /**
   * Get all POS statuses for a business
   */
  getPosStatuses(businessId: string): PosStatus[] {
    return Array.from(this.posStatuses.values()).filter(
      s => s.businessId === businessId
    );
  }

  /**
   * Clean up stale POS connections (no heartbeat in 60 seconds)
   */
  cleanupStaleConnections(): void {
    const now = new Date();
    const staleThreshold = 60 * 1000; // 60 seconds

    for (const [deviceId, status] of this.posStatuses.entries()) {
      const timeSinceHeartbeat = now.getTime() - status.lastHeartbeat.getTime();

      if (timeSinceHeartbeat > staleThreshold) {
        logger.info('Cleaning up stale POS connection', { deviceId });

        // Emit disconnected event
        const event = eventEmitter.createBaseEvent(
          'pos:disconnected',
          status.businessId,
          status.cashierId,
          status.branchId,
          deviceId
        );

        eventEmitter.emitToBusiness({
          ...event,
          eventType: 'pos:disconnected',
          data: {
            deviceId,
            cashierId: status.cashierId,
            cashierName: status.cashierName,
            reason: 'timeout',
          },
        } as any);

        this.posStatuses.delete(deviceId);
      }
    }
  }
}

// Export singleton instance
export const socketManager = new SocketManager();
