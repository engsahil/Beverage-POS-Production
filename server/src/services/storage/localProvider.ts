/**
 * Local Storage Provider
 * Stores files on local filesystem (development/testing only)
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { StorageProvider, UploadResult, FileMetadata } from './types.js';
import { logger } from '../../lib/logger.js';

export class LocalStorageProvider implements StorageProvider {
  private basePath: string;

  constructor(basePath: string = './storage') {
    this.basePath = path.resolve(basePath);
    logger.info('LocalStorageProvider initialized', { basePath: this.basePath });
  }

  private getFullPath(key: string): string {
    return path.join(this.basePath, key);
  }

  async upload(key: string, data: Buffer, _contentType?: string): Promise<UploadResult> {
    const fullPath = this.getFullPath(key);
    const dir = path.dirname(fullPath);

    // Create directory if it doesn't exist
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(fullPath, data);

    // Calculate checksum
    const checksum = crypto.createHash('sha256').update(data).digest('hex');

    logger.info('File uploaded to local storage', { key, size: data.length });

    return {
      key,
      size: data.length,
      checksum,
    };
  }

  async download(key: string): Promise<Buffer> {
    const fullPath = this.getFullPath(key);

    try {
      const data = await fs.readFile(fullPath);
      logger.info('File downloaded from local storage', { key, size: data.length });
      return data;
    } catch (error) {
      logger.error('Failed to download file from local storage', { key, error });
      throw new Error(`File not found: ${key}`);
    }
  }

  async delete(key: string): Promise<void> {
    const fullPath = this.getFullPath(key);

    try {
      await fs.unlink(fullPath);
      logger.info('File deleted from local storage', { key });
    } catch (error) {
      logger.error('Failed to delete file from local storage', { key, error });
      throw new Error(`Failed to delete file: ${key}`);
    }
  }

  async exists(key: string): Promise<boolean> {
    const fullPath = this.getFullPath(key);

    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(key: string): Promise<FileMetadata> {
    const fullPath = this.getFullPath(key);

    try {
      const stats = await fs.stat(fullPath);
      const data = await fs.readFile(fullPath);
      const checksum = crypto.createHash('sha256').update(data).digest('hex');

      return {
        key,
        size: stats.size,
        lastModified: stats.mtime,
        checksum,
      };
    } catch (error) {
      logger.error('Failed to get metadata from local storage', { key, error });
      throw new Error(`File not found: ${key}`);
    }
  }

  async list(prefix: string): Promise<FileMetadata[]> {
    const fullPath = this.getFullPath(prefix);
    const results: FileMetadata[] = [];

    try {
      const files = await this.walkDirectory(fullPath, prefix);
      for (const file of files) {
        try {
          const metadata = await this.getMetadata(file);
          results.push(metadata);
        } catch {
          // Skip files that can't be read
        }
      }
    } catch (error) {
      logger.error('Failed to list files from local storage', { prefix, error });
    }

    return results;
  }

  private async walkDirectory(dir: string, prefix: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.join(prefix, entry.name);

        if (entry.isDirectory()) {
          const subFiles = await this.walkDirectory(fullPath, relativePath);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          files.push(relativePath);
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    return files;
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Check if base directory exists and is writable
      await fs.mkdir(this.basePath, { recursive: true });
      const testFile = path.join(this.basePath, '.healthcheck');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      return true;
    } catch (error) {
      logger.error('Local storage health check failed', { error });
      return false;
    }
  }
}
