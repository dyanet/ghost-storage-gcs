# @dyanet/ghost-storage-gcs

Google Cloud Storage adapter for Ghost CMS.

## Versions

| Adapter | Ghost | Node.js | Notes |
|---------|-------|---------|-------|
| **3.x** | 6.x (ghost-storage-base 3) | 22.12+ | Implements `saveRaw` / `urlToPath`; honours Ghost's `targetDir` |
| 2.x | 5.x (ghost-storage-base 1) | 18+ | Maintenance only |

Install `@dyanet/ghost-storage-gcs@2` for Ghost 5 / older Node.js.

## Installation

```bash
cd /var/www/ghost
npm install @dyanet/ghost-storage-gcs
mkdir -p content/adapters/storage/gcs
echo "module.exports = require('@dyanet/ghost-storage-gcs');" > content/adapters/storage/gcs/index.js
```

## Configuration

Add a `storage` block to your `config.production.json`:

```json
{
  "storage": {
    "active": "gcs",
    "gcs": {
      "bucket": "your-bucket-name",
      "key": "path/to/service-account.json"
    }
  }
}
```

## Configuration Options

| Option | Required | Description |
|--------|----------|-------------|
| `bucket` | Yes | Google Cloud Storage bucket name |
| `key` | No | Path to service account JSON key file |
| `projectId` | No | Google Cloud project ID |
| `assetDomain` | No | Custom domain for serving files |
| `insecure` | No | Use HTTP instead of HTTPS (default: false) |
| `maxAge` | No | Cache-Control max-age in seconds (default: 2678400) |
| `uniformBucketLevelAccess` | No | Set to `true` if bucket has uniform bucket-level access enabled (default: false) |

## Upgrading from 2.x

- Requires Node.js 22.12 or later (as does current Ghost).
- Built on `ghost-storage-base` 3 and `@google-cloud/storage` 8. No configuration changes.
- New: `saveRaw()` writes Ghost-generated files (such as resized images) straight to the bucket, and `urlToPath()` maps an asset URL back to its object path, so Ghost features that depend on them work.
- `delete()` now resolves to `undefined` (it resolved to `true` in 2.x), per the Ghost 6 storage contract.

## Troubleshooting

### "Cannot insert legacy ACL for an object when uniform bucket-level access is enabled"

This error occurs when your GCS bucket has uniform bucket-level access enabled (the default for new buckets). The plugin tries to set per-object ACLs which is not allowed with uniform access.

**Solution:** Add `"uniformBucketLevelAccess": true` to your configuration:

```json
{
  "storage": {
    "active": "gcs",
    "gcs": {
      "bucket": "your-bucket-name",
      "key": "path/to/service-account.json",
      "uniformBucketLevelAccess": true
    }
  }
}
```

Note: With uniform bucket-level access, file visibility is controlled by bucket-level IAM policies rather than per-object ACLs.

### Files uploaded with backslashes in the name (Windows)

On Windows, file paths use backslashes (`\`) which can cause issues with GCS object names. Version 2.0.0+ automatically normalizes all paths to use forward slashes (`/`) for GCS compatibility.

If you're using an older version, upgrade to 2.0.0 or later.

## License

MIT
