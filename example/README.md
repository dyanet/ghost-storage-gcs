# GCS File Browser Example

A minimal TypeScript example demonstrating the `@dyanet/ghost-storage-gcs` plugin.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure GCS credentials

Copy the example config and edit with your settings:

```bash
cp config.example.json config.json
```

Edit `config.json`:

```json
{
  "bucket": "your-bucket-name",
  "key": "./service-account.json",
  "projectId": "your-project-id",
  "uniformBucketLevelAccess": true
}
```

- `bucket` (required): Your GCS bucket name
- `key` (optional): Path to your service account JSON key file
- `projectId` (optional): Your Google Cloud project ID
- `uniformBucketLevelAccess` (optional): Set to `true` if your bucket has uniform bucket-level access enabled (most modern buckets do)

### 3. Service Account Key

Download a service account key from the Google Cloud Console:

1. Go to IAM & Admin > Service Accounts
2. Create or select a service account with Storage Object Admin role
3. Create a new key (JSON format)
4. Save the file as `service-account.json` in this directory

## Running the Example

Build and run:

```bash
npm run build
npm start
```

The file browser provides these operations:

1. **Upload a file** - Upload a local file to GCS
2. **Download a file** - Download a file from GCS to local disk
3. **Check if file exists** - Verify a file exists in the bucket
4. **Exit** - Close the application
