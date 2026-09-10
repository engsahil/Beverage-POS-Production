/**
 * Storage Provider Types
 * Abstraction layer for cloud storage providers
 */

export interface StorageProvider {
  /**
   * Upload file to storage
   * @param key - Object key/path (e.g., "business/{id}/backups/backup-123.json.gz")
   * @param data - File data as Buffer
   * @param contentType - MIME type
   * @returns Upload result with path and metadata
   */
  upload(key: string, data: Buffer, contentType?: string): Promise<UploadResult>;

  /**
   * Download file from storage
   * @param key - Object key/path
   * @returns File data as Buffer
   */
  download(key: string): Promise<Buffer>;

  /**
   * Delete file from storage
   * @param key - Object key/path
   */
  delete(key: string): Promise<void>;

  /**
   * Check if file exists
   * @param key - Object key/path
   */
  exists(key: string): Promise<boolean>;

  /**
   * Get file metadata
   * @param key - Object key/path
   */
  getMetadata(key: string): Promise<FileMetadata>;

  /**
   * List files with prefix
   * @param prefix - Key prefix (e.g., "business/{id}/backups/")
   */
  list(prefix: string): Promise<FileMetadata[]>;

  /**
   * Health check - verify provider connection
   */
  healthCheck(): Promise<boolean>;
}

export interface UploadResult {
  key: string;
  size: number;
  checksum?: string;
}

export interface FileMetadata {
  key: string;
  size: number;
  contentType?: string;
  lastModified: Date;
  checksum?: string;
}

export interface StorageConfig {
  provider: 'local' | 's3';
  localPath?: string;
  s3?: {
    endpoint?: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    region?: string;
  };
}
