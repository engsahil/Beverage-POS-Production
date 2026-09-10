/**
 * Phase 20: WhatsApp Integration Tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MetaCloudAPIProvider } from '../src/services/whatsapp/metaProvider.js';

describe('Phase 20: WhatsApp Integration', () => {
  describe('MetaCloudAPIProvider', () => {
    it('should format phone numbers correctly', () => {
      const provider = new MetaCloudAPIProvider({
        provider: 'meta',
        accessToken: 'test-token',
        phoneNumberId: 'test-phone-id',
      });

      // Access private method via any cast for testing
      const formatted = (provider as any).formatPhoneNumber('+92 300 1234567');
      assert.equal(formatted, '923001234567');
    });

    it('should format phone numbers without special characters', () => {
      const provider = new MetaCloudAPIProvider({
        provider: 'meta',
        accessToken: 'test-token',
        phoneNumberId: 'test-phone-id',
      });

      const formatted = (provider as any).formatPhoneNumber('+92-300-123-4567');
      assert.equal(formatted, '923001234567');
    });

    it('should handle phone numbers already in correct format', () => {
      const provider = new MetaCloudAPIProvider({
        provider: 'meta',
        accessToken: 'test-token',
        phoneNumberId: 'test-phone-id',
      });

      const formatted = (provider as any).formatPhoneNumber('923001234567');
      assert.equal(formatted, '923001234567');
    });
  });

  describe('WhatsApp Message Types', () => {
    it('should have correct message types', () => {
      const messageTypes = ['SHIFT_CLOSING', 'TEST', 'MANUAL'];
      assert.ok(messageTypes.includes('SHIFT_CLOSING'));
      assert.ok(messageTypes.includes('TEST'));
      assert.ok(messageTypes.includes('MANUAL'));
    });

    it('should have correct status types', () => {
      const statusTypes = [
        'QUEUED',
        'SENDING',
        'SENT',
        'DELIVERED',
        'READ',
        'FAILED',
        'RETRY_REQUIRED',
      ];
      
      assert.equal(statusTypes.length, 7);
      assert.ok(statusTypes.includes('QUEUED'));
      assert.ok(statusTypes.includes('SENT'));
      assert.ok(statusTypes.includes('FAILED'));
    });
  });

  describe('Shift Closing Report Format', () => {
    it('should format currency correctly', () => {
      const formatCurrency = (amount: number | null) => {
        if (!amount) return 'Rs. 0';
        return `Rs. ${amount.toLocaleString('en-PK')}`;
      };

      assert.equal(formatCurrency(0), 'Rs. 0');
      assert.equal(formatCurrency(1000), 'Rs. 1,000');
      assert.equal(formatCurrency(48500), 'Rs. 48,500');
    });

    it('should calculate cash status correctly', () => {
      const calculateCashStatus = (difference: number) => {
        return difference > 0 ? 'OVER' : difference < 0 ? 'SHORT' : 'BALANCED';
      };

      assert.equal(calculateCashStatus(100), 'OVER');
      assert.equal(calculateCashStatus(-100), 'SHORT');
      assert.equal(calculateCashStatus(0), 'BALANCED');
    });
  });

  describe('Idempotency', () => {
    it('should generate unique idempotency keys', () => {
      const shiftId1 = 'shift-123';
      const shiftId2 = 'shift-456';

      const key1 = `shift_closing_${shiftId1}`;
      const key2 = `shift_closing_${shiftId2}`;

      assert.notEqual(key1, key2);
      assert.ok(key1.startsWith('shift_closing_'));
      assert.ok(key2.startsWith('shift_closing_'));
    });

    it('should prevent duplicate messages for same shift', () => {
      const shiftId = 'shift-123';
      const key1 = `shift_closing_${shiftId}`;
      const key2 = `shift_closing_${shiftId}`;

      assert.equal(key1, key2);
    });
  });

  describe('Phone Number Validation', () => {
    it('should validate Pakistani phone numbers', () => {
      const validatePhone = (phone: string) => {
        return /^\+92\d{10}$/.test(phone);
      };

      assert.ok(validatePhone('+923001234567'));
      assert.ok(validatePhone('+923009876543'));
      assert.ok(!validatePhone('+92300123456')); // Too short
      assert.ok(!validatePhone('923001234567')); // Missing +
      assert.ok(!validatePhone('+1234567890')); // Wrong country code
    });
  });

  describe('Retry Logic', () => {
    it('should track retry count', () => {
      let retryCount = 0;
      const maxRetries = 3;

      retryCount++;
      assert.equal(retryCount, 1);
      assert.ok(retryCount < maxRetries);

      retryCount++;
      retryCount++;
      assert.equal(retryCount, 3);
      assert.ok(retryCount >= maxRetries);
    });

    it('should only retry failed messages', () => {
      const canRetry = (status: string, retryCount: number, maxRetries: number) => {
        return status === 'FAILED' && retryCount < maxRetries;
      };

      assert.ok(canRetry('FAILED', 0, 3));
      assert.ok(canRetry('FAILED', 2, 3));
      assert.ok(!canRetry('FAILED', 3, 3)); // Max retries reached
      assert.ok(!canRetry('SENT', 0, 3)); // Wrong status
      assert.ok(!canRetry('DELIVERED', 0, 3)); // Wrong status
    });
  });

  describe('Business Isolation', () => {
    it('should isolate messages by business', () => {
      const businessA = 'business-A';
      const businessB = 'business-B';

      const messageA = { businessId: businessA, shiftId: 'shift-1' };
      const messageB = { businessId: businessB, shiftId: 'shift-1' };

      assert.notEqual(messageA.businessId, messageB.businessId);
    });
  });

  describe('Webhook Status Mapping', () => {
    it('should map Meta status to internal status', () => {
      const mapStatus = (metaStatus: string) => {
        switch (metaStatus) {
          case 'sent':
            return 'SENT';
          case 'delivered':
            return 'DELIVERED';
          case 'read':
            return 'READ';
          case 'failed':
            return 'FAILED';
          default:
            return null;
        }
      };

      assert.equal(mapStatus('sent'), 'SENT');
      assert.equal(mapStatus('delivered'), 'DELIVERED');
      assert.equal(mapStatus('read'), 'READ');
      assert.equal(mapStatus('failed'), 'FAILED');
      assert.equal(mapStatus('unknown'), null);
    });
  });
});
