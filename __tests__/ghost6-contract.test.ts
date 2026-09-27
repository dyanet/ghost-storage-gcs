import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageBase } from 'ghost-storage-base';

/**
 * Contract tests against the real ghost-storage-base 3 (the base class Ghost 6
 * bundles). Only Google Cloud Storage is mocked, so the base class's own
 * getTargetDir / getUniqueFileName / generateUnique logic runs for real
 * against the adapter's exists().
 */

const mockUpload = vi.fn();
const mockExists = vi.fn();
const mockDelete = vi.fn();
const mockSave = vi.fn();
const mockFile = vi.fn((name: string) => ({
  name,
  exists: mockExists,
  delete: mockDelete,
  save: mockSave,
  createReadStream: vi.fn()
}));

vi.mock('@google-cloud/storage', () => ({
  Storage: vi.fn(function () {
    return { bucket: () => ({ upload: mockUpload, file: mockFile }) };
  })
}));

import GStore from '../src/index';

function yyyymm(): string {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

describe('Ghost 6 storage contract (ghost-storage-base 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExists.mockResolvedValue([false]);
    mockUpload.mockResolvedValue([{}]);
    mockSave.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue([{}]);
  });

  it('is a StorageBase and implements every required and abstract method', () => {
    const store = new GStore({ bucket: 'b' });
    expect(store).toBeInstanceOf(StorageBase);
    const required = [...store.requiredFns, 'saveRaw', 'urlToPath'];
    for (const fn of required) {
      expect(typeof (store as unknown as Record<string, unknown>)[fn], fn).toBe('function');
    }
  });

  describe('save()', () => {
    it('uploads into the dated YYYY/MM directory with a sanitised name', async () => {
      const store = new GStore({ bucket: 'b' });
      const url = await store.save({ name: 'my photo!.jpg', path: '/tmp/upload-1', type: 'image/jpeg' });
      expect(url).toBe(`https://b.storage.googleapis.com/${yyyymm()}/my-photo-.jpg`);
      expect(mockUpload).toHaveBeenCalledWith('/tmp/upload-1', expect.objectContaining({
        destination: `${yyyymm()}/my-photo-.jpg`,
        public: true,
        metadata: { cacheControl: 'public, max-age=2678400' }
      }));
    });

    it('honours the targetDir Ghost passes (e.g. media thumbnails)', async () => {
      const store = new GStore({ bucket: 'b', assetDomain: 'cdn.example.com' });
      const url = await store.save({ name: 'thumb.png', path: '/tmp/t', type: 'image/png' }, 'content/media/2026/09');
      expect(url).toBe('https://cdn.example.com/content/media/2026/09/thumb.png');
    });

    it('appends -1, -2 … until the name is free (real generateUnique over exists())', async () => {
      mockExists.mockResolvedValueOnce([true]).mockResolvedValueOnce([true]).mockResolvedValue([false]);
      const store = new GStore({ bucket: 'b' });
      const url = await store.save({ name: 'a.jpg', path: '/tmp/a', type: 'image/jpeg' }, 'x');
      expect(url.endsWith('/x/a-2.jpg')).toBe(true);
      expect(mockFile).toHaveBeenCalledWith('x/a.jpg');
      expect(mockFile).toHaveBeenCalledWith('x/a-1.jpg');
    });

    it('omits the per-object ACL for uniform bucket-level access buckets', async () => {
      const store = new GStore({ bucket: 'b', uniformBucketLevelAccess: true });
      await store.save({ name: 'a.jpg', path: '/tmp/a', type: 'image/jpeg' });
      expect(mockUpload.mock.calls[0]![1]).not.toHaveProperty('public');
    });
  });

  describe('saveRaw()', () => {
    it('writes the buffer to the exact path and returns its URL', async () => {
      const store = new GStore({ bucket: 'b', maxAge: 60 });
      const buf = Buffer.from('png-bytes');
      const url = await store.saveRaw(buf, 'content/images/size/w600/2026/09/a.png');
      expect(url).toBe('https://b.storage.googleapis.com/content/images/size/w600/2026/09/a.png');
      expect(mockFile).toHaveBeenCalledWith('content/images/size/w600/2026/09/a.png');
      expect(mockSave).toHaveBeenCalledWith(buf, expect.objectContaining({
        contentType: 'auto',
        resumable: false,
        public: true,
        metadata: { cacheControl: 'public, max-age=60' }
      }));
    });

    it('normalises Windows separators and leading slashes in the path', async () => {
      const store = new GStore({ bucket: 'b' });
      const url = await store.saveRaw(Buffer.alloc(0), '/content\\images\\a.png');
      expect(mockFile).toHaveBeenCalledWith('content/images/a.png');
      expect(url).toBe('https://b.storage.googleapis.com/content/images/a.png');
    });

    it('omits the ACL for uniform bucket-level access, and propagates upload errors', async () => {
      const store = new GStore({ bucket: 'b', uniformBucketLevelAccess: true });
      await store.saveRaw(Buffer.from('x'), 'a.png');
      expect(mockSave.mock.calls[0]![1]).not.toHaveProperty('public');
      mockSave.mockRejectedValueOnce(new Error('403 Forbidden'));
      await expect(store.saveRaw(Buffer.from('x'), 'b.png')).rejects.toThrow('403 Forbidden');
    });
  });

  describe('urlToPath()', () => {
    const store = new GStore({ bucket: 'b', assetDomain: 'cdn.example.com' });

    it('is the inverse of save()/saveRaw() URLs', async () => {
      const url = await store.saveRaw(Buffer.from('x'), 'content/images/2026/09/pic.jpg');
      expect(store.urlToPath(url)).toBe('content/images/2026/09/pic.jpg');
    });

    it('decodes percent-escapes and ignores query strings and fragments', () => {
      expect(store.urlToPath('https://cdn.example.com/2026/09/a%20b.jpg?v=3#x')).toBe('2026/09/a b.jpg');
    });

    it('accepts either protocol for the asset domain', () => {
      expect(store.urlToPath('http://cdn.example.com/a.jpg')).toBe('a.jpg');
    });

    it('rejects URLs on another host, and non-URLs', () => {
      expect(() => store.urlToPath('https://evil.example.com/a.jpg')).toThrow(/not stored in this Google Cloud Storage bucket/);
      expect(() => store.urlToPath('https://b.storage.googleapis.com/a.jpg')).toThrow(/not stored/);
      expect(() => store.urlToPath('/content/images/a.jpg')).toThrow(/Not a valid URL/);
    });

    it('works with the default bucket domain', () => {
      const def = new GStore({ bucket: 'my-bucket' });
      expect(def.urlToPath('https://my-bucket.storage.googleapis.com/2026/09/a.jpg')).toBe('2026/09/a.jpg');
    });
  });

  it('exists()/delete() resolve paths relative to targetDir the way the base class calls them', async () => {
    const store = new GStore({ bucket: 'b' });
    mockExists.mockResolvedValueOnce([true]);
    await expect(store.exists('a.jpg', '2026/09')).resolves.toBe(true);
    await expect(store.delete('a.jpg', '2026/09')).resolves.toBeUndefined();
    expect(mockFile).toHaveBeenCalledWith('2026/09/a.jpg');
  });
});
