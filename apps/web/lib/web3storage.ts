import { create } from '@web3-storage/w3up-client';

let web3StorageClient: Awaited<ReturnType<typeof create>> | null = null;
let web3StorageInitialized = false;

export async function initializeWeb3Storage() {
  if (web3StorageInitialized) return web3StorageClient;
  
  try {
    if (!process.env.WEB3_STORAGE_EMAIL || !process.env.WEB3_STORAGE_SPACE_DID) {
      console.log('Web3.Storage not configured, skipping initialization');
      return null;
    }

    console.log('Initializing Web3.Storage client...');
    web3StorageClient = await create();
    
    console.log('Logging in to Web3.Storage...');
    await web3StorageClient.login(process.env.WEB3_STORAGE_EMAIL);
    
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
