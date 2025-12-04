import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GStoreConfig } from '../src/types';

// Mock ghost-storage-base
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
const mockUpload = vi.fn();
const mockExists = vi.fn();
const mockDelete = vi.fn();
const mockCreateReadStream = vi.fn();
const mockFile = vi.fn(() => ({
  exists: mockExists,
  delete: mockDelete,
  createReadStream: mockCreateReadStream
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

import GStore from '../src/index';

describe('GStore Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpload.mockResolvedValue([{}]);
    mockExists.mockResolvedValue([true]);
    mockDelete.mockResolvedValue([{}]);
  });

  describe('Constructor', () => {
    it('should throw error when bucket is not provided', () => {
      expect(() => new GStore({} as GStoreConfig)).toThrow('Google Cloud Storage bucket is required');
    });

    it('should create instance with minimal config', () => {
      const store = new GStore({ bucket: 'test-bucket' });
      expect(store).toBeInstanceOf(GStore);
    });

    it('should create instance with full config', () => {
      const config: GStoreConfig = {
        bucket: 'test-bucket',
        projectId: 'my-project',
        key: '/path/to/key.json',
        assetDomain: 'cdn.example.com',
        insecure: true,
        maxAge: 3600
      };
      const store = new GStore(config);
      expect(store.getConfig()).toEqual(config);
    });

    it('should apply default values for optional config', () => {
      const store = new GStore({ bucket: 'test-bucket' });
      const baseUrl = store.getBaseUrl();
      
      // Default insecure is false (https)
      expect(baseUrl.startsWith('https://')).toBe(true);
      // Default assetDomain is bucket.storage.googleapis.com
      expect(baseUrl).toContain('test-bucket.storage.googleapis.com');
    });
  });

  describe('Error Handling', () => {
    it('should propagate upload errors', async () => {
      const uploadError = new Error('Upload failed');
      mockUpload.mockRejectedValueOnce(uploadError);
      
      const store = new GStore({ bucket: 'test-bucket' });
      const image = { path: '/tmp/test.jpg', name: 'test.jpg', type: 'image/jpeg' };
      
      await expect(store.save(image)).rejects.toThrow('Upload failed');
    });

    it('should propagate exists errors', async () => {
      const existsError = new Error('Check failed');
      mockExists.mockRejectedValueOnce(existsError);
      
      const store = new GStore({ bucket: 'test-bucket' });
      
      await expect(store.exists('test.jpg')).rejects.toThrow('Check failed');
    });

    it('should propagate delete errors', async () => {
      const deleteError = new Error('Delete failed');
      mockDelete.mockRejectedValueOnce(deleteError);
      
      const store = new GStore({ bucket: 'test-bucket' });
      
      await expect(store.delete('test.jpg')).rejects.toThrow('Delete failed');
    });
  });

  describe('read method', () => {
    it('should return Buffer from file contents', async () => {
      const testData = Buffer.from('test file contents');
      const mockStream = {
        on: vi.fn((event: string, callback: (data?: Buffer | Error) => void) => {
          if (event === 'data') {
            setTimeout(() => callback(testData), 0);
          }
          if (event === 'end') {
            setTimeout(() => callback(), 10);
          }
          return mockStream;
        })
      };
      mockCreateReadStream.mockReturnValue(mockStream);
      
      const store = new GStore({ bucket: 'test-bucket' });
      const result = await store.read({ path: 'test.jpg' });
      
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString()).toBe('test file contents');
    });

    it('should return empty Buffer for empty file', async () => {
      const mockStream = {
        on: vi.fn((event: string, callback: () => void) => {
          if (event === 'end') {
            setTimeout(() => callback(), 0);
          }
          return mockStream;
        })
      };
      mockCreateReadStream.mockReturnValue(mockStream);
      
      const store = new GStore({ bucket: 'test-bucket' });
      const result = await store.read({ path: 'empty.jpg' });
      
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should reject on stream error', async () => {
      const streamError = new Error('Stream error');
      const mockStream = {
        on: vi.fn((event: string, callback: (err?: Error) => void) => {
          if (event === 'error') {
            setTimeout(() => callback(streamError), 0);
          }
          return mockStream;
        })
      };
      mockCreateReadStream.mockReturnValue(mockStream);
      
      const store = new GStore({ bucket: 'test-bucket' });
      
      await expect(store.read({ path: 'test.jpg' })).rejects.toThrow('Stream error');
    });
  });

  describe('delete method', () => {
    it('should return true on successful delete', async () => {
      mockDelete.mockResolvedValue([{}]);
      
      const store = new GStore({ bucket: 'test-bucket' });
      const result = await store.delete('test.jpg');
      
      expect(result).toBe(true);
    });

    it('should handle delete with targetDir', async () => {
      mockDelete.mockResolvedValue([{}]);
      
      const store = new GStore({ bucket: 'test-bucket' });
      const result = await store.delete('test.jpg', '2024/01');
      
      expect(result).toBe(true);
      // path.join uses platform-specific separators, so check the call was made with correct parts
      const calledPath = mockFile.mock.calls[0][0] as string;
      expect(calledPath).toMatch(/2024[/\\]01[/\\]test\.jpg/);
    });
  });

  describe('serve method', () => {
    it('should return a middleware function', () => {
      const store = new GStore({ bucket: 'test-bucket' });
      const middleware = store.serve();
      
      expect(typeof middleware).toBe('function');
    });

    it('should call next() when invoked', () => {
      const store = new GStore({ bucket: 'test-bucket' });
      const middleware = store.serve();
      const next = vi.fn();
      
      middleware({} as any, {} as any, next);
      
      expect(next).toHaveBeenCalled();
    });
  });
});
