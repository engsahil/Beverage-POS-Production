/**
 * Phase 18: Realtime Client
 * 
 * Client-side Socket.IO wrapper for POS and Admin applications.
 * Handles connection, reconnection, event handling, and heartbeat.
 */

import { io, Socket } from 'socket.io-client';

export interface RealtimeClientConfig {
  serverUrl: string;
  token: string;
  clientType: 'POS' | 'ADMIN';
  deviceId?: string;
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onError?: (error: Error) => void;
}

export interface HeartbeatData {
  status: 'ONLINE' | 'OFFLINE' | 'SYNCING' | 'SYNC_ERROR';
  pendingOperations: number;
}

export interface SyncStatusData {
  status: string;
  pendingCount: number;
  conflictCount: number;
  lastSyncAt?: string;
}

export class RealtimeClient {
  private socket: Socket | null = null;
  private config: RealtimeClientConfig;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private eventHandlers: Map<string, Set<Function>> = new Map();
  private isConnected: boolean = false;

  constructor(config: RealtimeClientConfig) {
    this.config = config;
  }

  /**
   * Connect to the realtime server
   */
  connect(): void {
    if (this.socket?.connected) {
      return;
    }

    const query: Record<string, string> = {
      clientType: this.config.clientType,
    };

    if (this.config.deviceId) {
      query.deviceId = this.config.deviceId;
    }

    this.socket = io(this.config.serverUrl, {
      auth: {
        token: this.config.token,
      },
      query,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    });

    this.setupSocketHandlers();
  }

  /**
   * Setup socket event handlers
   */
  private setupSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.isConnected = true;
      console.log('[Realtime] Connected');
      
      // Start heartbeat for POS clients
      if (this.config.clientType === 'POS') {
        this.startHeartbeat();
      }

      this.config.onConnect?.();
      this.emitInternal('connect', {});
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      console.log('[Realtime] Disconnected:', reason);
      
      this.stopHeartbeat();
      this.config.onDisconnect?.(reason);
      this.emitInternal('disconnect', { reason });
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Realtime] Connection error:', error.message);
      this.config.onError?.(error);
      this.emitInternal('error', { error });
    });

    // Forward all server events to internal handlers
    this.socket.onAny((eventName, ...args) => {
      this.emitInternal(eventName, args[0]);
    });
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    this.stopHeartbeat();
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.isConnected = false;
  }

  /**
   * Check if connected
   */
  isClientConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Subscribe to an event
   */
  on(event: string, handler: Function): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    
    this.eventHandlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.eventHandlers.delete(event);
        }
      }
    };
  }

  /**
   * Unsubscribe from an event
   */
  off(event: string, handler: Function): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(event);
      }
    }
  }

  /**
   * Emit event to internal handlers
   */
  private emitInternal(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`[Realtime] Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Send heartbeat to server (POS only)
   */
  sendHeartbeat(data: HeartbeatData): void {
    if (this.socket?.connected) {
      this.socket.emit('heartbeat', data);
    }
  }

  /**
   * Start automatic heartbeat (every 30 seconds)
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat({
        status: 'ONLINE',
        pendingOperations: 0,
      });
    }, 30000);
  }

  /**
   * Stop automatic heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Send sync status update (POS only)
   */
  sendSyncStatus(data: SyncStatusData): void {
    if (this.socket?.connected) {
      this.socket.emit('sync:status', data);
    }
  }

  /**
   * Request POS status list (Admin only)
   */
  requestPosStatusList(): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('Not connected'));
        return;
      }

      this.socket.emit('pos:status:list', (response: any) => {
        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response.statuses);
        }
      });
    });
  }

  /**
   * Update authentication token (e.g., after token refresh)
   */
  updateToken(newToken: string): void {
    this.config.token = newToken;
    
    // Reconnect with new token
    if (this.socket) {
      this.socket.auth = { token: newToken };
      this.socket.connect();
    }
  }
}
