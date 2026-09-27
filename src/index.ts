import { Storage, Bucket, File } from '@google-cloud/storage';
import { StorageBase } from 'ghost-storage-base';
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
    super();

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
   * Upload options shared by save() and saveRaw(): cache headers, and a
   * public ACL unless the bucket uses uniform bucket-level access.
   */
  private uploadOptions(): { metadata: { cacheControl: string }; public?: boolean } {
    const opts: { metadata: { cacheControl: string }; public?: boolean } = {
      metadata: {
        cacheControl: `public, max-age=${this.maxAge}`
      }
    };
    if (!this.uniformBucketLevelAccess) {
      opts.public = true;
    }
    return opts;
  }

  /**
   * Save an uploaded file to Google Cloud Storage.
   *
   * Ghost passes a `targetDir` for some uploads (e.g. media thumbnails);
   * otherwise the file goes in the dated `YYYY/MM` directory.
   */
  async save(image: Image, targetDir?: string): Promise<string> {
    const dir = targetDir || this.getTargetDir();
    const targetFilename = this.normalizePathForGCS(
      await this.getUniqueFileName(image, dir)
    );

    await this.bucket.upload(image.path, {
      destination: targetFilename,
      ...this.uploadOptions()
    });
    return this.getBaseUrl() + targetFilename;
  }

  /**
   * Write a buffer to an exact path in the bucket and return its URL.
   * Ghost uses this for files it generates itself (e.g. resized images),
   * where it has already chosen the path.
   */
  async saveRaw(buffer: Buffer, targetPath: string): Promise<string> {
    const objectName = this.normalizePathForGCS(targetPath).replace(/^\/+/, '');
    await this.bucket.file(objectName).save(buffer, {
      ...this.uploadOptions(),
      contentType: 'auto',
      resumable: false
    });
    return this.getBaseUrl() + objectName;
  }

  /**
   * Convert one of this adapter's asset URLs back to its object path
   * (the inverse of save()/saveRaw()). Accepts either protocol for the
   * configured asset domain, and ignores any query string or fragment.
   */
  urlToPath(url: string): string {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Not a valid URL: ${url}`);
    }
    const base = new URL(this.getBaseUrl());
    if (parsed.host !== base.host || !parsed.pathname.startsWith(base.pathname)) {
      throw new Error(`${url} is not stored in this Google Cloud Storage bucket (${this.getBaseUrl()})`);
    }
    return decodeURIComponent(parsed.pathname.slice(base.pathname.length));
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
  async delete(filename: string, targetDir?: string): Promise<void> {
    const filePath = this.normalizePathForGCS(
      targetDir ? path.join(targetDir, filename) : filename
    );
    await this.bucket.file(filePath).delete();
  }
}

export default GStore;

// Ghost loads storage adapters with require() and expects module.exports to
// be the class itself, so the compiled CommonJS build replaces its exports
// object with GStore (keeping `.default` for ESM/esModuleInterop consumers).
// Guarded so ESM-based loaders such as vitest, where `module`/`exports`
// aren't this module's real export object, leave it alone.
if (
  typeof module !== 'undefined' &&
  typeof exports !== 'undefined' &&
  module.exports === exports &&
  Object.prototype.toString.call(exports) !== '[object Module]'
) {
  module.exports = GStore;
  module.exports.default = GStore;
}
