/**
 * S3 Storage Provider
 * Works with AWS S3, Cloudflare R2, MinIO, and other S3-compatible services
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import { StorageProvider, UploadResult, FileMetadata } from './types.js';
import { logger } from '../../lib/logger.js';

export interface S3Config {
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region?: string;
}

export class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;

    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region || 'auto',
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: !!config.endpoint, // Required for R2 and other S3-compatible services
    });

    logger.info('S3StorageProvider initialized', {
      bucket: this.bucket,
      endpoint: config.endpoint || 'AWS S3',
      region: config.region || 'auto',
    });
  }

  async upload(key: string, data: Buffer, contentType: string = 'application/octet-stream'): Promise<UploadResult> {
    try {
      const checksum = crypto.createHash('sha256').update(data).digest('hex');

      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
        ChecksumSHA256: checksum,
      }));

      logger.info('File uploaded to S3', { key, size: data.length, bucket: this.bucket });

      return {
        key,
        size: data.length,
        checksum,
      };
    } catch (error) {
      logger.error('Failed to upload file to S3', { key, error });
      throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async download(key: string): Promise<Buffer> {
    try {
      const response = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));

      if (!response.Body) {
        throw new Error('Empty response body');
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      const stream = response.Body as any;
      
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const data = Buffer.concat(chunks);
      logger.info('File downloaded from S3', { key, size: data.length, bucket: this.bucket });
      return data;
    } catch (error) {
      logger.error('Failed to download file from S3', { key, error });
      throw new Error(`Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));

      logger.info('File deleted from S3', { key, bucket: this.bucket });
    } catch (error) {
      logger.error('Failed to delete file from S3', { key, error });
      throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  async getMetadata(key: string): Promise<FileMetadata> {
    try {
      const response = await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));

      return {
        key,
        size: response.ContentLength || 0,
        contentType: response.ContentType,
        lastModified: response.LastModified || new Date(),
        checksum: response.ChecksumSHA256 || undefined,
      };
    } catch (error) {
      logger.error('Failed to get metadata from S3', { key, error });
      throw new Error(`Failed to get metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async list(prefix: string): Promise<FileMetadata[]> {
    try {
      const response = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
      }));

      const files: FileMetadata[] = [];

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key) {
              files.push({
                key: obj.Key,
                size: obj.Size || 0,
                lastModified: obj.LastModified || new Date(),
              });
          }
        }
      }

      logger.info('Listed files from S3', { prefix, count: files.length, bucket: this.bucket });
      return files;
    } catch (error) {
      logger.error('Failed to list files from S3', { prefix, error });
      throw new Error(`Failed to list files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Try to list objects (even if empty) to verify connection
      await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        MaxKeys: 1,
      }));
      return true;
    } catch (error) {
      logger.error('S3 health check failed', { error });
      return false;
    }
  }
}
