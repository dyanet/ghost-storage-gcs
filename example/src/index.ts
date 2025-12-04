import GStore, { GStoreConfig } from '@dyanet/ghost-storage-gcs';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

interface ExampleConfig {
  bucket: string;
  key?: string;
  projectId?: string;
  uniformBucketLevelAccess?: boolean;
}

function loadConfig(): ExampleConfig {
  const configPath = path.join(__dirname, '..', 'config.json');
  if (!fs.existsSync(configPath)) {
    console.error('Error: config.json not found.');
    console.error('Please create config.json with your GCS bucket and key path.');
    console.error('See README.md for instructions.');
    process.exit(1);
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw);
}

function createStore(config: ExampleConfig): GStore {
  const storeConfig: GStoreConfig = {
    bucket: config.bucket,
    key: config.key,
    projectId: config.projectId,
    uniformBucketLevelAccess: config.uniformBucketLevelAccess,
  };
  return new GStore(storeConfig);
}

async function uploadFile(store: GStore, localPath: string): Promise<string> {
  const absolutePath = path.resolve(localPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }
  const image = {
    path: absolutePath,
    name: path.basename(absolutePath),
    type: 'application/octet-stream',
  };
  const url = await store.save(image);
  return url;
}

async function downloadFile(store: GStore, remotePath: string): Promise<Buffer> {
  return store.read({ path: remotePath });
}

async function checkExists(store: GStore, remotePath: string): Promise<boolean> {
  return store.exists(remotePath);
}


function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function printMenu(): void {
  console.log('\n=== GCS File Browser ===');
  console.log('1. Upload a file');
  console.log('2. Download a file');
  console.log('3. Check if file exists');
  console.log('4. Exit');
  console.log('========================\n');
}

async function main(): Promise<void> {
  console.log('Loading configuration...');
  const config = loadConfig();
  console.log(`Bucket: ${config.bucket}`);

  console.log('Initializing GStore...');
  const store = createStore(config);
  console.log('GStore initialized successfully.\n');

  const rl = createReadlineInterface();

  let running = true;
  while (running) {
    printMenu();
    const choice = await prompt(rl, 'Select an option (1-4): ');

    switch (choice) {
      case '1': {
        const localPath = await prompt(rl, 'Enter local file path to upload: ');
        if (!localPath) {
          console.log('No path provided.');
          break;
        }
        try {
          console.log('Uploading...');
          const url = await uploadFile(store, localPath);
          console.log(`Upload successful! URL: ${url}`);
        } catch (err) {
          console.error('Upload failed:', (err as Error).message);
        }
        break;
      }
      case '2': {
        const remotePath = await prompt(rl, 'Enter remote file path to download: ');
        if (!remotePath) {
          console.log('No path provided.');
          break;
        }
        const savePath = await prompt(rl, 'Enter local path to save file: ');
        if (!savePath) {
          console.log('No save path provided.');
          break;
        }
        try {
          console.log('Downloading...');
          const data = await downloadFile(store, remotePath);
          fs.writeFileSync(savePath, data);
          console.log(`Download successful! Saved to: ${savePath}`);
        } catch (err) {
          console.error('Download failed:', (err as Error).message);
        }
        break;
      }
      case '3': {
        const checkPath = await prompt(rl, 'Enter remote file path to check: ');
        if (!checkPath) {
          console.log('No path provided.');
          break;
        }
        try {
          const exists = await checkExists(store, checkPath);
          console.log(`File exists: ${exists}`);
        } catch (err) {
          console.error('Check failed:', (err as Error).message);
        }
        break;
      }
      case '4':
        running = false;
        console.log('Goodbye!');
        break;
      default:
        console.log('Invalid option. Please select 1-4.');
    }
  }

  rl.close();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
