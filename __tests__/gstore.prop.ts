import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { GStoreConfig } from '../src/types';

// Mock ghost-storage-base to avoid loading the actual module
vi.mock('ghost-storage-base', () => {
  return {
    default: class MockStorageBase {
      constructor(_config?: unknown) {}
      getTargetDir(_baseDir?: string): string {
        return '2024/01';
      }
      async getUniqueFileName(image: { name: string }, _targetDir: string): Promise<string> {
        return `2024/01/${image.name}`;
      }
    }
  };
});

// Mock @google-cloud/storage
const mockUpload = vi.fn().mockResolvedValue([{}]);
const mockExists = vi.fn().mockResolvedValue([true]);
const mockFile = vi.fn(() => ({
  exists: mockExists
}));
const mockBucket = vi.fn(() => ({
  upload: mockUpload,
  file: mockFile
}));

vi.mock('@google-cloud/storage', () => ({
  Storage: vi.fn(() => ({
    bucket: mockBucket
  })),
  Bucket: vi.fn(),
  File: vi.fn()
}));

// Import after mock setup
import GStore from '../src/index';

/**
 * Property-based tests for GStore
 * 
 * These tests verify correctness properties that should hold
 * across all valid inputs.
 */

// Arbitrary for valid bucket names (GCS bucket naming rules simplified)
const bucketNameArb = fc.hexaString({ minLength: 3, maxLength: 20 })
  .map(name => name.toLowerCase());

// Arbitrary for valid domain names
const domainArb = fc.tuple(
  fc.hexaString({ minLength: 3, maxLength: 15 }),
  fc.constantFrom('.com', '.io', '.net', '.org')
).map(([name, tld]) => name.toLowerCase() + tld);

// Arbitrary for maxAge values
const maxAgeArb = fc.oneof(
  fc.integer({ min: 0, max: 31536000 }),
  fc.constantFrom('3600', '86400', '2678400')
);

// Simple filename generator
const filenameArb = fc.tuple(
  fc.hexaString({ minLength: 4, maxLength: 12 }),
  fc.constantFrom('.jpg', '.png', '.gif', '.webp')
).map(([name, ext]) => name + ext);

describe('GStore Property Tests', () => {
  /**
   * **Feature: plugin-update, Property 1: URL generation correctness**
   * 
   * *For any* valid configuration, the generated storage URL SHALL:
   * - Use `http://` protocol when `insecure: true`, otherwise `https://`
   * - Use the custom `assetDomain` when provided, otherwise `{bucket}.storage.googleapis.com`
   * - Include the complete file path after the domain
   * 
   * **Validates: Requirements 4.5, 4.6**
   */
  describe('Property 1: URL generation correctness', () => {
    it('should use http:// when insecure is true, https:// otherwise', () => {
      fc.assert(
        fc.property(
          bucketNameArb,
          fc.boolean(),
          (bucket, insecure) => {
            const config: GStoreConfig = { bucket, insecure };
            const store = new GStore(config);
            const baseUrl = store.getBaseUrl();
            
            if (insecure) {
              expect(baseUrl.startsWith('http://')).toBe(true);
              expect(baseUrl.startsWith('https://')).toBe(false);
            } else {
              expect(baseUrl.startsWith('https://')).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should use custom assetDomain when provided, otherwise bucket.storage.googleapis.com', () => {
      fc.assert(
        fc.property(
          bucketNameArb,
          fc.option(domainArb, { nil: undefined }),
          (bucket, assetDomain) => {
            const config: GStoreConfig = { bucket, assetDomain };
            const store = new GStore(config);
            const baseUrl = store.getBaseUrl();
            
            if (assetDomain) {
              expect(baseUrl).toContain(assetDomain);
            } else {
              expect(baseUrl).toContain(`${bucket}.storage.googleapis.com`);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should end with trailing slash for path concatenation', () => {
      fc.assert(
        fc.property(
          bucketNameArb,
          fc.option(domainArb, { nil: undefined }),
          fc.boolean(),
          (bucket, assetDomain, insecure) => {
            const config: GStoreConfig = { bucket, assetDomain, insecure };
            const store = new GStore(config);
            const baseUrl = store.getBaseUrl();
            
            expect(baseUrl.endsWith('/')).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: plugin-update, Property 2: Configuration preservation**
   * 
   * *For any* valid configuration object passed to the constructor, 
   * all configuration values (bucket, assetDomain, insecure, maxAge) 
   * SHALL be preserved and accessible for use in storage operations.
   * 
   * **Validates: Requirements 2.2, 4.5**
   */
  describe('Property 2: Configuration preservation', () => {
    it('should preserve all configuration values through constructor', () => {
      fc.assert(
        fc.property(
          bucketNameArb,
          fc.option(domainArb, { nil: undefined }),
          fc.option(fc.boolean(), { nil: undefined }),
          fc.option(maxAgeArb, { nil: undefined }),
          fc.option(fc.string(), { nil: undefined }), // key
          fc.option(fc.string(), { nil: undefined }), // projectId
          (bucket, assetDomain, insecure, maxAge, key, projectId) => {
            const config: GStoreConfig = {
              bucket,
              ...(assetDomain !== undefined && { assetDomain }),
              ...(insecure !== undefined && { insecure }),
              ...(maxAge !== undefined && { maxAge }),
              ...(key !== undefined && { key }),
              ...(projectId !== undefined && { projectId })
            };
            
            const store = new GStore(config);
            const storedConfig = store.getConfig();
            
            // All provided config values should be preserved
            expect(storedConfig.bucket).toBe(bucket);
            
            if (assetDomain !== undefined) {
              expect(storedConfig.assetDomain).toBe(assetDomain);
            }
            if (insecure !== undefined) {
              expect(storedConfig.insecure).toBe(insecure);
            }
            if (maxAge !== undefined) {
              expect(storedConfig.maxAge).toBe(maxAge);
            }
            if (key !== undefined) {
              expect(storedConfig.key).toBe(key);
            }
            if (projectId !== undefined) {
              expect(storedConfig.projectId).toBe(projectId);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should apply correct defaults for optional config values', () => {
      fc.assert(
        fc.property(
          bucketNameArb,
          (bucket) => {
            const config: GStoreConfig = { bucket };
            const store = new GStore(config);
            const baseUrl = store.getBaseUrl();
            
            // Default insecure should be false (https)
            expect(baseUrl.startsWith('https://')).toBe(true);
            
            // Default assetDomain should be bucket.storage.googleapis.com
            expect(baseUrl).toContain(`${bucket}.storage.googleapis.com`);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: plugin-update, Property 3: Save method URL validity**
   * 
   * *For any* valid image input with a path, the save method SHALL return 
   * a string that is a valid URL starting with `http://` or `https://`.
   * 
   * **Validates: Requirements 4.1**
   */
  describe('Property 3: Save method URL validity', () => {
    it('should return a valid URL starting with http:// or https://', async () => {
      await fc.assert(
        fc.asyncProperty(
          bucketNameArb,
          fc.boolean(),
          fc.option(domainArb, { nil: undefined }),
          filenameArb,
          async (bucket, insecure, assetDomain, filename) => {
            const config: GStoreConfig = { bucket, insecure, assetDomain };
            const store = new GStore(config);
            
            const image = {
              path: `/tmp/${filename}`,
              name: filename,
              type: 'image/jpeg'
            };
            
            const url = await store.save(image);
            
            // URL must be a string
            expect(typeof url).toBe('string');
            
            // URL must start with http:// or https://
            const startsWithValidProtocol = url.startsWith('http://') || url.startsWith('https://');
            expect(startsWithValidProtocol).toBe(true);
            
            // Protocol should match insecure flag
            if (insecure) {
              expect(url.startsWith('http://')).toBe(true);
            } else {
              expect(url.startsWith('https://')).toBe(true);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * **Feature: plugin-update, Property 4: Exists method boolean return**
   * 
   * *For any* filename and target directory combination, the exists method 
   * SHALL return a boolean value (true or false), never undefined or other types.
   * 
   * **Validates: Requirements 4.2**
   */
  describe('Property 4: Exists method boolean return', () => {
    it('should always return a boolean value', async () => {
      // Simple directory generator
      const targetDirArb = fc.option(
        fc.array(fc.hexaString({ minLength: 2, maxLength: 8 }), { minLength: 1, maxLength: 3 })
          .map(parts => parts.join('/')),
        { nil: undefined }
      );

      await fc.assert(
        fc.asyncProperty(
          bucketNameArb,
          filenameArb,
          targetDirArb,
          async (bucket, filename, targetDir) => {
            const config: GStoreConfig = { bucket };
            const store = new GStore(config);
            
            const result = await store.exists(filename, targetDir);
            
            // Result must be a boolean
            expect(typeof result).toBe('boolean');
            
            // Result must be exactly true or false
            expect(result === true || result === false).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
