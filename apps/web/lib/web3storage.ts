import { create } from '@web3-storage/w3up-client';
import { StoreConf, StoreMemory } from '@web3-storage/w3up-client/stores';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let web3StorageClient: Awaited<ReturnType<typeof create>> | null = null;
let web3StorageInitialized = false;

// Get a writable store location for serverless environments
function getStoreLocation(): string {
  // In Vercel/serverless, use /tmp which is writable
  const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (isServerless) {
    const tmpDir = '/tmp/.w3access';
    // Ensure directory exists
    try {
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
    } catch (e) {
      console.warn('Failed to create /tmp/.w3access:', e);
      throw e;
    }
    return tmpDir;
  }
  // For local development, use temp directory or default location
  try {
    const homeDir = os.homedir();
    const defaultDir = path.join(homeDir, '.config', 'w3access');
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }
    return defaultDir;
  } catch (e) {
    // Fallback to project directory
    const fallbackDir = path.join(process.cwd(), '.w3access');
    if (!fs.existsSync(fallbackDir)) {
      fs.mkdirSync(fallbackDir, { recursive: true });
    }
    return fallbackDir;
  }
}

export async function initializeWeb3Storage() {
  if (web3StorageInitialized) return web3StorageClient;
  
  try {
    if (!process.env.WEB3_STORAGE_EMAIL || !process.env.WEB3_STORAGE_SPACE_DID) {
      console.log('Web3.Storage not configured, skipping initialization');
      return null;
    }

    console.log('Initializing Web3.Storage client...');
    
    // Use in-memory store for serverless (credentials don't need to persist)
    // Use file store for local development
    let store: StoreConf | StoreMemory;
    const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
    
    if (isServerless) {
      // In serverless, use in-memory store (will re-authenticate each invocation)
      store = new StoreMemory();
      console.log('Using in-memory store for serverless environment');
    } else {
      // In local development, try to use file store
      try {
        const storeLocation = getStoreLocation();
        // StoreConf uses profile name, not path - create a profile directory
        store = new StoreConf({ profile: 'default' });
        console.log(`Using file store for local development`);
      } catch (e: any) {
        console.warn('Failed to create file store, using in-memory store:', e?.message || e);
        store = new StoreMemory();
        console.log('Using in-memory store (credentials will not persist)');
      }
    }
    
    web3StorageClient = await create({ store });
    
    console.log('Logging in to Web3.Storage...');
    const email = process.env.WEB3_STORAGE_EMAIL;
    if (!email || !email.includes('@')) {
      throw new Error('Invalid email format');
    }
    await web3StorageClient.login(email as `${string}@${string}`);
    
    console.log('Getting available spaces...');
    const spaces = await web3StorageClient.spaces();
    console.log(`Found ${spaces.length} spaces`);
    
    // Check if the configured space is available
    const targetSpaceDid = process.env.WEB3_STORAGE_SPACE_DID;
    const spaceAvailable = spaces.find(s => s.did() === targetSpaceDid);
    
    if (spaceAvailable) {
      console.log(`✅ Target space ${targetSpaceDid} is available and ready to use`);
      
      // Store the target space for direct uploads
      (web3StorageClient as any).targetSpace = spaceAvailable;
      console.log('✅ Target space stored for direct uploads');
      
      web3StorageInitialized = true;
      console.log('Web3.Storage client initialized successfully');
      return web3StorageClient;
    } else {
      console.log(`⚠️  Target space ${targetSpaceDid} is not available`);
      console.log('💡 This means your configured space needs to be activated.');
      console.log('📧 To activate your space:');
      console.log('1. Visit https://console.web3.storage/');
      console.log('2. Log in with your email');
      console.log('3. Look for authorization emails or pending invitations');
      console.log('4. Accept the invitation to activate your space');
      return null;
    }
  } catch (error: any) {
    console.error('Error initializing Web3.Storage:', error?.message || error);
    return null;
  }
}
