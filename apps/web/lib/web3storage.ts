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
  if (web3StorageInitialized && web3StorageClient) return web3StorageClient;
  
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
      // In serverless, use /tmp for store to cache credentials across warm requests
      try {
        const tmpDir = '/tmp/.w3access';
        if (!fs.existsSync(tmpDir)) {
          fs.mkdirSync(tmpDir, { recursive: true });
        }
        // Use file store in /tmp for credential persistence across warm requests
        store = new StoreConf({ profile: 'default' });
        console.log('Using /tmp store for serverless environment (credentials cached)');
      } catch (e: any) {
        console.warn('Failed to create /tmp store, using in-memory store:', e?.message || e);
        store = new StoreMemory();
        console.log('Falling back to in-memory store (slower, will re-authenticate each request)');
      }
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
    
    // Create client with timeout protection
    const clientPromise = create({ store });
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Web3.Storage client creation timeout')), 15000); // 15 second timeout
    });
    
    web3StorageClient = await Promise.race([clientPromise, timeoutPromise]) as Awaited<ReturnType<typeof create>>;
    
    console.log('Logging in to Web3.Storage...');
    const email = process.env.WEB3_STORAGE_EMAIL;
    if (!email || !email.includes('@')) {
      throw new Error('Invalid email format');
    }
    
    // Login with timeout
    const loginPromise = web3StorageClient.login(email as `${string}@${string}`);
    const loginTimeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Web3.Storage login timeout')), 20000); // 20 second timeout
    });
    await Promise.race([loginPromise, loginTimeout]);
    
    console.log('Getting available spaces...');
    // Get spaces with timeout
    const spacesPromise = web3StorageClient.spaces();
    const spacesTimeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Web3.Storage spaces fetch timeout')), 20000); // 20 second timeout
    });
    const spaces = await Promise.race([spacesPromise, spacesTimeout]) as Awaited<ReturnType<typeof web3StorageClient.spaces>>;
    
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
    // Reset initialization state on error so we can retry
    web3StorageInitialized = false;
    web3StorageClient = null;
    return null;
  }
}
