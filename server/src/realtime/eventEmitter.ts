/**
 * Phase 18: Real-Time Event Emitter
 * 
 * Central service for emitting real-time events after database transactions.
 * Handles event creation, authorization filtering, and delivery to connected clients.
 */

import { Server, Socket } from 'socket.io';
import {
  RealtimeEvent,
  RealtimeEventType,
  RealtimeEventBase,
  SocketContext,
  EventPermissions,
  getBusinessRoom,
  getBranchRoom,
} from './types.js';

class RealtimeEventEmitter {
  private io: Server | null = null;
  private initialized = false;

  /**
   * Initialize the event emitter with Socket.IO server instance
   */
  initialize(io: Server): void {
    this.io = io;
    this.initialized = true;
  }

  /**
   * Check if emitter is initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.io !== null;
  }

  /**
   * Emit event to all authorized clients in a business
   */
  emitToBusiness(event: RealtimeEvent): void {
    if (!this.io) {
      console.warn('RealtimeEventEmitter not initialized');
      return;
    }

    const room = getBusinessRoom(event.businessId);
    this.io.to(room).emit(event.eventType, event);
  }

  /**
   * Emit event to all authorized clients in a branch
   */
  emitToBranch(event: RealtimeEvent): void {
    if (!this.io) {
      console.warn('RealtimeEventEmitter not initialized');
      return;
    }

    if (!event.branchId) {
      console.warn('Cannot emit to branch: no branchId in event');
      return;
    }

    const room = getBranchRoom(event.businessId, event.branchId);
    this.io.to(room).emit(event.eventType, event);
  }

  /**
   * Emit event to specific user
   */
  emitToUser(userId: string, event: RealtimeEvent): void {
    if (!this.io) {
      console.warn('RealtimeEventEmitter not initialized');
      return;
    }

    const room = `user:${userId}`;
    this.io.to(room).emit(event.eventType, event);
  }

  /**
   * Emit event to all clients (use sparingly, prefer business/branch scope)
   */
  broadcast(event: RealtimeEvent): void {
    if (!this.io) {
      console.warn('RealtimeEventEmitter not initialized');
      return;
    }

    this.io.emit(event.eventType, event);
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create base event structure
   */
  createBaseEvent(
    eventType: RealtimeEventType,
    businessId: string,
    userId?: string,
    branchId?: string,
    deviceId?: string
  ): RealtimeEventBase {
    return {
      eventId: this.generateEventId(),
      eventType,
      businessId,
      branchId,
      timestamp: new Date().toISOString(),
      userId,
      deviceId,
    };
  }

  /**
   * Check if socket has permission to receive event
   */
  hasPermission(socket: Socket, eventType: RealtimeEventType): boolean {
    const context = socket.data.context as SocketContext;
    if (!context) return false;

    const requiredPermissions = EventPermissions[eventType];
    
    // If no permissions required, allow
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    // Check if user has any of the required permissions
    return requiredPermissions.some(perm => context.permissions.includes(perm));
  }

  /**
   * Get count of connected clients
   */
  getClientCount(): number {
    if (!this.io) return 0;
    return this.io.sockets.sockets.size;
  }

  /**
   * Get count of clients in a specific room
   */
  async getRoomClientCount(room: string): Promise<number> {
    if (!this.io) return 0;
    const sockets = await this.io.in(room).fetchSockets();
    return sockets.length;
  }
}

// Export singleton instance
export const eventEmitter = new RealtimeEventEmitter();
