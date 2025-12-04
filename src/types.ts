/**
 * Configuration options for the GStore storage adapter
 */
export interface GStoreConfig {
  /** Google Cloud project ID */
  projectId?: string;
  /** Path to the service account key JSON file */
  key?: string;
  /** GCS bucket name (required) */
  bucket: string;
  /** Custom domain for serving assets */
  assetDomain?: string;
  /** Use HTTP instead of HTTPS for asset URLs */
  insecure?: boolean;
  /** Cache-Control max-age in seconds (default: 2678400 = 31 days) */
  maxAge?: number | string;
  /** Set to true if bucket has uniform bucket-level access enabled (disables per-object ACLs) */
  uniformBucketLevelAccess?: boolean;
}

/**
 * Ghost image object passed to storage adapter methods
 */
export interface Image {
  /** Local file path to the image */
  path: string;
  /** Original filename */
  name: string;
  /** MIME type of the image */
  type: string;
}

/**
 * Options for the read method
 */
export interface ReadOptions {
  /** Path to the file in storage */
  path: string;
}
