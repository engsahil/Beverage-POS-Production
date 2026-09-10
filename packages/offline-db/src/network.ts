/**
 * Phase 16: Network Status Detection Module
 * 
 * Monitors network connectivity and provides connection status to the POS.
 * 
 * States:
 * - ONLINE: Connected to server, can sync
 * - OFFLINE: No connection, using local cache
 * - SYNCING: Currently synchronizing queued operations
 * - SYNC_ERROR: Connection exists but sync is failing
 */

import type { ConnectionStatus, NetworkState } from './types.js';

// Global network state
let currentState: NetworkState = {
  status: 'ONLINE',
  lastOnlineAt: new Date().toISOString(),
  lastSyncAt: null,
  pendingOperations: 0,
  syncErrors: 0,
};

// Event listeners
type NetworkStateListener = (state: NetworkState) => void;
const listeners: NetworkStateListener[] = [];

/**
 * Initialize network monitoring
 * Sets up browser online/offline event listeners
 */
export function initializeNetworkMonitoring(): void {
  if (typeof window === 'undefined') {
    // Not in browser environment (e.g., testing)
    return;
  }

  // Listen for browser online/offline events
  window.addEventListener('online', () => {
    updateConnectionStatus('ONLINE');
  });

  window.addEventListener('offline', () => {
    updateConnectionStatus('OFFLINE');
  });

  // Set initial state based on browser's navigator.onLine
  if (!navigator.onLine) {
    updateConnectionStatus('OFFLINE');
  }

  // Periodic connectivity check (ping server)
  setInterval(async () => {
    if (currentState.status === 'ONLINE' || currentState.status === 'SYNC_ERROR') {
      const isReachable = await checkServerReachability();
      if (!isReachable && currentState.status === 'ONLINE') {
        updateConnectionStatus('OFFLINE');
      } else if (isReachable && currentState.status === 'OFFLINE') {
        updateConnectionStatus('ONLINE');
      }
    }
  }, 30000); // Check every 30 seconds
}

/**
 * Check if server is reachable
 */
async function checkServerReachability(): Promise<boolean> {
  try {
    // Use a lightweight health check endpoint
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch('/health', {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-cache',
    });

    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Update connection status and notify listeners
 */
export function updateConnectionStatus(status: ConnectionStatus): void {
  const previousStatus = currentState.status;
  
  currentState = {
    ...currentState,
    status,
    lastOnlineAt: status === 'ONLINE' ? new Date().toISOString() : currentState.lastOnlineAt,
    lastSyncAt: status === 'ONLINE' ? new Date().toISOString() : currentState.lastSyncAt,
  };

  // Track sync errors
  if (status === 'SYNC_ERROR') {
    currentState.syncErrors++;
  } else if (status === 'ONLINE') {
    currentState.syncErrors = 0;
  }

  // Notify listeners if status changed
  if (previousStatus !== status) {
    notifyListeners();
  }
}

/**
 * Update pending operations count
 */
export function updatePendingOperationsCount(count: number): void {
  currentState = {
    ...currentState,
    pendingOperations: count,
  };
  notifyListeners();
}

/**
 * Update last sync timestamp
 */
export function updateLastSyncTime(): void {
  currentState = {
    ...currentState,
    lastSyncAt: new Date().toISOString(),
  };
  notifyListeners();
}

/**
 * Get current network state
 */
export function getNetworkState(): NetworkState {
  return { ...currentState };
}

/**
 * Check if currently online
 */
export function isOnline(): boolean {
  return currentState.status === 'ONLINE';
}

/**
 * Check if currently offline
 */
export function isOffline(): boolean {
  return currentState.status === 'OFFLINE';
}

/**
 * Subscribe to network state changes
 */
export function onNetworkStateChange(listener: NetworkStateListener): () => void {
  listeners.push(listener);
  
  // Return unsubscribe function
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  };
}

/**
 * Notify all listeners of state change
 */
function notifyListeners(): void {
  const state = getNetworkState();
  for (const listener of listeners) {
    try {
      listener(state);
    } catch (error) {
      console.error('Network state listener error:', error);
    }
  }
}

/**
 * Reset network state (for testing or logout)
 */
export function resetNetworkState(): void {
  currentState = {
    status: 'ONLINE',
    lastOnlineAt: new Date().toISOString(),
    lastSyncAt: null,
    pendingOperations: 0,
    syncErrors: 0,
  };
  notifyListeners();
}
