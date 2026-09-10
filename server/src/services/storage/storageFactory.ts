/**
 * Storage Factory
 * Creates appropriate storage provider based on configuration
 */

import { StorageProvider, StorageConfig } from './types.js';
import { LocalStorageProvider } from './localProvider.js';
import { S3StorageProvider } from './s3Provider.js';
import { logger } from '../../lib/logger.js';

let storageInstance: StorageProvider | null = null;

/**
 * Get or create storage provider instance
 */
export function getStorageProvider(config?: StorageConfig): StorageProvider {
  if (storageInstance) {
    return storageInstance;
  }

  const storageConfig = config || getStorageConfigFromEnv();

  switch (storageConfig.provider) {
    case 'local':
      storageInstance = new LocalStorageProvider(storageConfig.localPath);
      logger.info('Using local storage provider');
      break;

    case 's3':
      if (!storageConfig.s3) {
        throw new Error('S3 configuration required for s3 provider');
      }
      storageInstance = new S3StorageProvider(storageConfig.s3);
      logger.info('Using S3 storage provider');
      break;

    default:
      throw new Error(`Unknown storage provider: ${storageConfig.provider}`);
  }

  return storageInstance;
}

/**
 * Get storage configuration from environment variables
 */
function getStorageConfigFromEnv(): StorageConfig {
  const provider = process.env.STORAGE_PROVIDER as 'local' | 's3' || 'local';

  if (provider === 's3') {
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    const bucket = process.env.S3_BUCKET;

    if (!accessKeyId || !secretAccessKey || !bucket) {
      throw new Error('S3 configuration incomplete. Required: S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET');
    }

    return {
      provider: 's3',
      s3: {
        endpoint: process.env.S3_ENDPOINT,
        accessKeyId,
        secretAccessKey,
        bucket,
        region: process.env.S3_REGION,
      },
    };
  }

  return {
    provider: 'local',
    localPath: process.env.LOCAL_STORAGE_PATH || './storage',
  };
}

/**
 * Reset storage instance (for testing)
 */
export function resetStorageProvider(): void {
  storageInstance = null;
}
