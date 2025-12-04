declare module 'ghost-storage-base' {
  import { RequestHandler } from 'express';

  interface Image {
    path: string;
    name: string;
    type: string;
  }

  class StorageBase {
    constructor(config?: unknown);
    
    /**
     * Get the target directory for storing files (date-based)
     */
    getTargetDir(baseDir?: string): string;
    
    /**
     * Get a unique filename for the image
     */
    getUniqueFileName(image: Image, targetDir: string): Promise<string>;
    
    /**
     * Save an image to storage
     */
    save(image: Image): Promise<string>;
    
    /**
     * Middleware for serving files
     */
    serve(): RequestHandler;
    
    /**
     * Check if a file exists
     */
    exists(filename: string, targetDir?: string): Promise<boolean>;
    
    /**
     * Read a file from storage
     */
    read(options: { path: string }): Promise<Buffer>;
    
    /**
     * Delete a file from storage
     */
    delete(filename: string, targetDir?: string): Promise<boolean>;
  }

  export = StorageBase;
}
