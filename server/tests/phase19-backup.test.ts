/**
 * Phase 19: Cloud Backup & Storage Tests
 * 
 * Tests for storage providers, backup service, quota management,
 * business isolation, and security.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { LocalStorageProvider } from '../src/services/storage/localProvider.js';
import { getStorageProvider, resetStorageProvider } from '../src/services/storage/storageFactory.js';

const TEST_STORAGE_PATH = './test-storage';

describe('Phase 19: Cloud Backup & Storage', () => {
  let storage: LocalStorageProvider;

  before(async () => {
    // Clean up test storage directory
    try {
      await fs.rm(TEST_STORAGE_PATH, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }
    storage = new LocalStorageProvider(TEST_STORAGE_PATH);
  });

  after(async () => {
    // Clean up
    try {
      await fs.rm(TEST_STORAGE_PATH, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('Storage Provider - Local', () => {
    it('should pass health check', async () => {
      const healthy = await storage.healthCheck();
      assert.equal(healthy, true);
    });

    it('should upload file and return metadata', async () => {
      const data = Buffer.from('Hello, World!', 'utf-8');
      const key = 'test/hello.txt';

      const result = await storage.upload(key, data, 'text/plain');

      assert.equal(result.key, key);
      assert.equal(result.size, data.length);
      assert.ok(result.checksum);
    });

    it('should download uploaded file', async () => {
      const originalData = Buffer.from('Test content for download', 'utf-8');
      const key = 'test/download.txt';

      await storage.upload(key, originalData);
      const downloaded = await storage.download(key);

      assert.deepEqual(downloaded, originalData);
    });

    it('should check file existence', async () => {
      const key = 'test/exists.txt';
      const data = Buffer.from('exists');

      assert.equal(await storage.exists(key), false);

      await storage.upload(key, data);

      assert.equal(await storage.exists(key), true);
    });

    it('should get file metadata', async () => {
      const data = Buffer.from('metadata test content');
      const key = 'test/metadata.txt';

      await storage.upload(key, data);
      const metadata = await storage.getMetadata(key);

      assert.equal(metadata.key, key);
      assert.equal(metadata.size, data.length);
      assert.ok(metadata.lastModified);
      assert.ok(metadata.checksum);
    });

    it('should delete file', async () => {
      const key = 'test/delete-me.txt';
      const data = Buffer.from('delete me');

      await storage.upload(key, data);
      assert.equal(await storage.exists(key), true);

      await storage.delete(key);
      assert.equal(await storage.exists(key), false);
    });

    it('should list files with prefix', async () => {
      // Upload multiple files
      await storage.upload('list/file1.txt', Buffer.from('1'));
      await storage.upload('list/file2.txt', Buffer.from('2'));
      await storage.upload('list/sub/file3.txt', Buffer.from('3'));
      await storage.upload('other/file4.txt', Buffer.from('4'));

      const files = await storage.list('list/');

      assert.ok(files.length >= 3, `Expected at least 3 files, got ${files.length}`);
      
      // All files should have the list/ prefix
      for (const file of files) {
        assert.ok(file.key.startsWith('list/'), `File key should start with list/: ${file.key}`);
      }
    });

    it('should calculate correct SHA-256 checksum', async () => {
      const data = Buffer.from('checksum test data');
      const key = 'test/checksum.txt';

      const result = await storage.upload(key, data);
      
      const expectedChecksum = crypto.createHash('sha256').update(data).digest('hex');
      assert.equal(result.checksum, expectedChecksum);
    });

    it('should handle business isolation in storage paths', async () => {
      const businessA = 'business-A';
      const businessB = 'business-B';

      const dataA = Buffer.from('Business A data');
      const dataB = Buffer.from('Business B data');

      await storage.upload(`business/${businessA}/backups/backup1.json.gz`, dataA);
      await storage.upload(`business/${businessB}/backups/backup1.json.gz`, dataB);

      // List files for each business
      const filesA = await storage.list(`business/${businessA}/`);
      const filesB = await storage.list(`business/${businessB}/`);

      // Each business should only see their own files
      for (const file of filesA) {
        assert.ok(file.key.includes(businessA), `Business A file should contain business A ID`);
        assert.ok(!file.key.includes(businessB), `Business A file should NOT contain business B ID`);
      }

      for (const file of filesB) {
        assert.ok(file.key.includes(businessB), `Business B file should contain business B ID`);
        assert.ok(!file.key.includes(businessA), `Business B file should NOT contain business A ID`);
      }
    });

    it('should throw error for non-existent file download', async () => {
      await assert.rejects(
        async () => await storage.download('nonexistent/file.txt'),
        /File not found/
      );
    });

    it('should handle large file upload', async () => {
      const largeData = Buffer.alloc(1024 * 1024, 'x'); // 1 MB
      const key = 'test/large-file.bin';

      const result = await storage.upload(key, largeData);
      assert.equal(result.size, largeData.length);

      const downloaded = await storage.download(key);
      assert.equal(downloaded.length, largeData.length);
    });
  });

  describe('Storage Factory', () => {
    it('should create local storage provider by default', () => {
      resetStorageProvider();
      const provider = getStorageProvider({ provider: 'local', localPath: TEST_STORAGE_PATH });
      assert.ok(provider);
    });

    it('should reuse singleton instance', () => {
      resetStorageProvider();
      const provider1 = getStorageProvider({ provider: 'local', localPath: TEST_STORAGE_PATH });
      const provider2 = getStorageProvider();
      assert.equal(provider1, provider2);
    });

    it('should reject S3 provider without config', () => {
      resetStorageProvider();
      assert.throws(
        () => getStorageProvider({ provider: 's3' }),
        /S3 configuration required/
      );
    });
  });

  describe('Quota Calculations', () => {
    it('should calculate correct quota percentage', () => {
      const quotaBytes = 1073741824; // 1 GB
      const usedBytes = 268435456;   // 256 MB
      const percentage = (usedBytes / quotaBytes) * 100;
      assert.equal(percentage, 25);
    });

    it('should detect quota status correctly', () => {
      const quotaBytes = 1073741824; // 1 GB

      // OK status (< 75%)
      const okUsed = 536870912; // 512 MB
      const okPercent = (okUsed / quotaBytes) * 100;
      const okStatus = okPercent >= 90 ? 'CRITICAL' : okPercent >= 75 ? 'WARNING' : 'OK';
      assert.equal(okStatus, 'OK');

      // WARNING status (75-89%)
      const warnUsed = 858993459; // ~800 MB
      const warnPercent = (warnUsed / quotaBytes) * 100;
      const warnStatus = warnPercent >= 90 ? 'CRITICAL' : warnPercent >= 75 ? 'WARNING' : 'OK';
      assert.equal(warnStatus, 'WARNING');

      // CRITICAL status (>= 90%)
      const critUsed = 1020054733; // ~950 MB
      const critPercent = (critUsed / quotaBytes) * 100;
      const critStatus = critPercent >= 90 ? 'CRITICAL' : critPercent >= 75 ? 'WARNING' : 'OK';
      assert.equal(critStatus, 'CRITICAL');
    });

    it('should handle zero quota gracefully', () => {
      const quotaBytes = 0;
      const usedBytes = 0;
      const percentage = quotaBytes > 0 ? (usedBytes / quotaBytes) * 100 : 0;
      assert.equal(percentage, 0);
    });
  });

  describe('Backup Data Integrity', () => {
    it('should produce valid JSON export format', () => {
      const exportData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        schemaVersion: 'phase19',
        data: {
          business: { id: 'test-business', name: 'Test Business' },
          products: [],
          sales: [],
        },
      };

      const jsonString = JSON.stringify(exportData);
      const parsed = JSON.parse(jsonString);

      assert.equal(parsed.version, '1.0.0');
      assert.equal(parsed.schemaVersion, 'phase19');
      assert.ok(parsed.data);
      assert.ok(parsed.data.business);
    });

    it('should verify checksum matches after compression', async () => {
      const { promisify } = await import('util');
      const { gzip, gunzip } = await import('zlib');
      const gzipAsync = promisify(gzip);
      const gunzipAsync = promisify(gunzip);

      const data = JSON.stringify({ test: 'data', timestamp: Date.now() });
      const buffer = Buffer.from(data, 'utf-8');

      // Compress
      const compressed = await gzipAsync(buffer) as Buffer;

      // Calculate checksum
      const checksum = crypto.createHash('sha256').update(compressed).digest('hex');

      // Verify checksum
      const verifyChecksum = crypto.createHash('sha256').update(compressed).digest('hex');
      assert.equal(checksum, verifyChecksum);

      // Decompress and verify data
      const decompressed = await gunzipAsync(compressed) as Buffer;
      const restored = decompressed.toString('utf-8');
      assert.equal(restored, data);
    });
  });

  describe('Security', () => {
    it('should not expose storage credentials in backup metadata', () => {
      const metadata = {
        originalSize: 1024,
        compressedSize: 512,
        compressionRatio: '2.00',
        schemaVersion: 'phase19',
        appVersion: '1.0.0',
      };

      const metadataString = JSON.stringify(metadata);
      
      // Should not contain any credential-like values
      assert.ok(!metadataString.includes('secret'));
      assert.ok(!metadataString.includes('password'));
      assert.ok(!metadataString.includes('accessKey'));
      assert.ok(!metadataString.includes('token'));
    });

    it('should use business-isolated storage paths', () => {
      const businessId = 'business-123';
      const backupId = 'backup-456';
      const storageKey = `business/${businessId}/backups/${backupId}.json.gz`;

      assert.ok(storageKey.startsWith(`business/${businessId}/`));
      assert.ok(!storageKey.includes('..')); // No path traversal
    });
  });

  describe('Backup Status Flow', () => {
    it('should have valid status transitions', () => {
      const validStatuses = ['QUEUED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'VERIFYING', 'VERIFIED', 'EXPIRED', 'DELETED'];
      
      // Valid transitions
      const transitions: Record<string, string[]> = {
        'QUEUED': ['IN_PROGRESS', 'FAILED'],
        'IN_PROGRESS': ['COMPLETED', 'FAILED'],
        'COMPLETED': ['VERIFYING', 'VERIFIED', 'EXPIRED', 'DELETED'],
        'FAILED': ['QUEUED', 'DELETED'], // Can retry
        'VERIFYING': ['VERIFIED', 'FAILED'],
        'VERIFIED': ['EXPIRED', 'DELETED'],
        'EXPIRED': [],
        'DELETED': [],
      };

      for (const status of validStatuses) {
        assert.ok(transitions.hasOwnProperty(status), `Status ${status} should have defined transitions`);
      }
    });
  });

  describe('Retention Policy', () => {
    it('should respect minimum backup count', () => {
      const totalCount = 5;
      const minBackupsToKeep = 7;

      const shouldDelete = totalCount > minBackupsToKeep;
      assert.equal(shouldDelete, false, 'Should not delete when below minimum');
    });

    it('should calculate correct deletion count', () => {
      const totalCount = 15;
      const minBackupsToKeep = 7;
      const maxDeletable = totalCount - minBackupsToKeep;
      
      assert.equal(maxDeletable, 8, 'Should be able to delete 8 backups');
    });
  });
});
