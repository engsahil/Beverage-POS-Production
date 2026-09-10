/**
 * Phase 18: Real-Time Communication Tests
 * 
 * Tests for realtime event emission, business/branch isolation,
 * and permission filtering.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { io as Client } from 'socket.io-client';
import { eventEmitter } from '../src/realtime/eventEmitter.js';
import { RealtimeEvents } from '../src/realtime/types.js';
import { socketManager } from '../src/realtime/socketManager.js';

describe('Phase 18: Real-Time Communication', () => {
  let httpServer: any;
  let ioServer: Server;
  let port: number;

  before(async () => {
    // Check database availability first
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      await prisma.$connect();
      await prisma.$disconnect();
    } catch (err) {
      console.log('Phase 18: Database not available - tests will be cancelled');
      throw new Error('Database not available - skipping realtime tests');
    }
    
    httpServer = createServer();
    ioServer = new Server(httpServer, {
      cors: { origin: '*' },
    });
    
    socketManager.initialize(ioServer);
    eventEmitter.initialize(ioServer);
    
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        port = httpServer.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    await ioServer.close();
    await httpServer.close();
  });

  describe('Event Emitter', () => {
    it('should be initialized', () => {
      assert.strictEqual(eventEmitter.isInitialized(), true);
    });

    it('should create base event with correct structure', () => {
      const event = eventEmitter.createBaseEvent(
        RealtimeEvents.SALE_CREATED,
        'business-123',
        'user-456',
        'branch-789'
      );

      assert.ok(event.hasOwnProperty('eventId'));
      assert.strictEqual(event.eventType, RealtimeEvents.SALE_CREATED);
      assert.strictEqual(event.businessId, 'business-123');
      assert.strictEqual(event.userId, 'user-456');
      assert.strictEqual(event.branchId, 'branch-789');
      assert.notStrictEqual(event.timestamp, undefined);
      assert.match(event.eventId, /^evt_/);
    });

    it('should generate unique event IDs', () => {
      const event1 = eventEmitter.createBaseEvent(
        RealtimeEvents.SALE_CREATED,
        'business-123'
      );
      const event2 = eventEmitter.createBaseEvent(
        RealtimeEvents.SALE_CREATED,
        'business-123'
      );

      assert.notStrictEqual(event1.eventId, event2.eventId);
    });
  });

  describe('Business Isolation', () => {
    it('should emit events only to business room', (done) => {
      const businessA = 'business-A';
      const businessB = 'business-B';

      let receivedA = false;
      let receivedB = false;

      const clientA = Client(`http://localhost:${port}`, {
        auth: {
          token: 'mock-token-A',
        },
        query: {
          businessId: businessA,
          clientType: 'ADMIN',
        },
      });

      const clientB = Client(`http://localhost:${port}`, {
        auth: {
          token: 'mock-token-B',
        },
        query: {
          businessId: businessB,
          clientType: 'ADMIN',
        },
      });

      clientA.on('connect', () => {
        clientA.on(RealtimeEvents.SALE_CREATED, () => {
          receivedA = true;
        });
      });

      clientB.on('connect', () => {
        clientB.on(RealtimeEvents.SALE_CREATED, () => {
          receivedB = true;
        });

        // Wait for both clients to be connected and joined rooms
        setTimeout(() => {
          const event = eventEmitter.createBaseEvent(
            RealtimeEvents.SALE_CREATED,
            businessA,
            'user-1'
          );

          eventEmitter.emitToBusiness({
            ...event,
            eventType: RealtimeEvents.SALE_CREATED,
            data: {
              saleId: 'sale-1',
              saleNumber: 'INV-001',
              total: '100.00',
              subtotal: '90.00',
              taxAmount: '10.00',
              discountAmount: '0.00',
              paymentMethods: ['CASH'],
              itemCount: 1,
              cashierId: 'user-1',
              cashierName: 'Test Cashier',
            },
          } as any);

          // Wait for event delivery
          setTimeout(() => {
            assert.strictEqual(receivedA, true);
            assert.strictEqual(receivedB, false);
            clientA.disconnect();
            clientB.disconnect();
            done();
          }, 100);
        }, 200);
      });
    });
  });

  describe('Branch Isolation', () => {
    it('should emit events only to branch room', (done) => {
      const businessId = 'business-1';
      const branchA = 'branch-A';
      const branchB = 'branch-B';

      let receivedA = false;
      let receivedB = false;

      const clientA = Client(`http://localhost:${port}`, {
        auth: { token: 'mock-token' },
        query: { businessId, branchId: branchA, clientType: 'POS' },
      });

      const clientB = Client(`http://localhost:${port}`, {
        auth: { token: 'mock-token' },
        query: { businessId, branchId: branchB, clientType: 'POS' },
      });

      clientA.on('connect', () => {
        clientA.on(RealtimeEvents.SHIFT_OPENED, () => {
          receivedA = true;
        });
      });

      clientB.on('connect', () => {
        clientB.on(RealtimeEvents.SHIFT_OPENED, () => {
          receivedB = true;
        });

        setTimeout(() => {
          const event = eventEmitter.createBaseEvent(
            RealtimeEvents.SHIFT_OPENED,
            businessId,
            'user-1',
            branchA
          );

          eventEmitter.emitToBranch({
            ...event,
            eventType: RealtimeEvents.SHIFT_OPENED,
            data: {
              shiftId: 'shift-1',
              shiftNumber: 'SHIFT-001',
              cashierId: 'user-1',
              cashierName: 'Test Cashier',
              openingCash: '1000.00',
              openedAt: new Date().toISOString(),
            },
          } as any);

          setTimeout(() => {
            assert.strictEqual(receivedA, true);
            assert.strictEqual(receivedB, false);
            clientA.disconnect();
            clientB.disconnect();
            done();
          }, 100);
        }, 200);
      });
    });
  });

  describe('Event Types', () => {
    it('should define all required event types', () => {
      assert.strictEqual(RealtimeEvents.SALE_CREATED, 'sale:created');
      assert.strictEqual(RealtimeEvents.SALE_VOIDED, 'sale:voided');
      assert.strictEqual(RealtimeEvents.STOCK_CHANGED, 'stock:changed');
      assert.strictEqual(RealtimeEvents.LOW_STOCK, 'stock:low');
      assert.strictEqual(RealtimeEvents.OUT_OF_STOCK, 'stock:out');
      assert.strictEqual(RealtimeEvents.CUSTOMER_CREATED, 'customer:created');
      assert.strictEqual(RealtimeEvents.CUSTOMER_UPDATED, 'customer:updated');
      assert.strictEqual(RealtimeEvents.CUSTOMER_CREDIT_CHANGED, 'customer:credit_changed');
      assert.strictEqual(RealtimeEvents.CUSTOMER_RECOVERY_RECORDED, 'customer:recovery_recorded');
      assert.strictEqual(RealtimeEvents.SHIFT_OPENED, 'shift:opened');
      assert.strictEqual(RealtimeEvents.SHIFT_CLOSED, 'shift:closed');
      assert.strictEqual(RealtimeEvents.EXPENSE_CREATED, 'expense:created');
      assert.strictEqual(RealtimeEvents.EXPENSE_CANCELLED, 'expense:cancelled');
      assert.strictEqual(RealtimeEvents.POS_CONNECTED, 'pos:connected');
      assert.strictEqual(RealtimeEvents.POS_DISCONNECTED, 'pos:disconnected');
      assert.strictEqual(RealtimeEvents.POS_HEARTBEAT, 'pos:heartbeat');
      assert.strictEqual(RealtimeEvents.POS_SYNC_STATUS_CHANGED, 'pos:sync_status_changed');
    });
  });
});
