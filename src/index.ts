import { Storage, Bucket, File } from '@google-cloud/storage';
import StorageBase from 'ghost-storage-base';
import path from 'path';
import { RequestHandler } from 'express';
import { GStoreConfig, Image, ReadOptions } from './types';

// Re-export types for consumers
export { GStoreConfig, Image, ReadOptions } from './types';

/**
 * Google Cloud Storage adapter for Ghost
 */
class GStore extends StorageBase {
  private bucket: Bucket;
  private assetDomain: string;
  private insecure: boolean;
  private maxAge: number | string;
  private uniformBucketLevelAccess: boolean;
  private config: GStoreConfig;

  constructor(config: GStoreConfig) {
    super(config);

    if (!config.bucket) {
      throw new Error('Google Cloud Storage bucket is required');
    }

    this.config = config;

    const storageOptions: { keyFilename?: string; projectId?: string } = {};
    if (config.key) {
      storageOptions.keyFilename = config.key;
    }
    if (config.projectId) {
      storageOptions.projectId = config.projectId;
    }

    const gcs = new Storage(storageOptions);
    this.bucket = gcs.bucket(config.bucket);

    this.assetDomain = config.assetDomain || `${config.bucket}.storage.googleapis.com`;
    this.insecure = config.insecure ?? false;
    this.maxAge = config.maxAge ?? 2678400;
    this.uniformBucketLevelAccess = config.uniformBucketLevelAccess ?? false;
  }

  /**
   * Generate the base URL for assets based on configuration
   */
  getBaseUrl(): string {
    const protocol = this.insecure ? 'http' : 'https';
    return `${protocol}://${this.assetDomain}/`;
  }

  /**
   * Get the stored configuration
   */
  getConfig(): GStoreConfig {
    return this.config;
  }

  /**
   * Normalize path separators to forward slashes for GCS compatibility
   */
  private normalizePathForGCS(filePath: string): string {
    return filePath.replace(/\\/g, '/');
  }

  /**
   * Save an image to Google Cloud Storage
   */
  async save(image: Image): Promise<string> {
    const targetDir = this.getTargetDir();
    const targetFilename = this.normalizePathForGCS(
      await this.getUniqueFileName(image, targetDir)
    );
    const baseUrl = this.getBaseUrl();

    const opts: {
      destination: string;
      metadata: { cacheControl: string };
      public?: boolean;
    } = {
      destination: targetFilename,
      metadata: {
        cacheControl: `public, max-age=${this.maxAge}`
      }
    };

    // Only set public ACL if bucket doesn't use uniform bucket-level access
    if (!this.uniformBucketLevelAccess) {
      opts.public = true;
    }

    await this.bucket.upload(image.path, opts);
    return baseUrl + targetFilename;
  }

  /**
   * Middleware for serving files (no-op for GCS as URLs are absolute)
   */
  serve(): RequestHandler {
    return function (_req, _res, next) {
      next();
    };
  }

  /**
   * Check if a file exists in storage
   */
  async exists(filename: string, targetDir?: string): Promise<boolean> {
    const filePath = this.normalizePathForGCS(
      targetDir ? path.join(targetDir, filename) : filename
    );
    const [exists] = await this.bucket.file(filePath).exists();
    return exists;
  }


  /**
   * Read a file from storage
   */
  read(options: ReadOptions): Promise<Buffer> {
    const rs = this.bucket.file(options.path).createReadStream();
    let contents: Buffer | null = null;

    return new Promise((resolve, reject) => {
      rs.on('error', (err: Error) => {
        reject(err);
      });

      rs.on('data', (data: Buffer) => {
        if (!contents) {
          contents = data;
        } else {
          contents = Buffer.concat([contents, data]);
        }
      });

      rs.on('end', () => {
        resolve(contents || Buffer.alloc(0));
      });
    });
  }

  /**
   * Delete a file from storage
   */
  async delete(filename: string, targetDir?: string): Promise<boolean> {
    const filePath = this.normalizePathForGCS(
      targetDir ? path.join(targetDir, filename) : filename
    );
    await this.bucket.file(filePath).delete();
    return true;
  }
}

export default GStore;
module.exports = GStore;
