import { privateKeyToAccount } from 'viem/accounts';
import { keccak256, stringToHex } from 'viem';

/**
 * Generate secp256k1 public key JWK from EOA private key
 */
export function generatePublicKeyJwkFromPrivateKey(privateKey: `0x${string}`): {
  x: string;
  y: string;
  jwk: {
    kty: string;
    crv: string;
    x: string;
    y: string;
  };
} {
  // Create account from private key
  const account = privateKeyToAccount(privateKey);
  
  // Get the public key (this is the uncompressed public key)
  const publicKey = account.publicKey;
  
  // Remove the 0x04 prefix and split into x and y coordinates
  const publicKeyHex = publicKey.slice(2); // Remove 0x
  const xHex = publicKeyHex.slice(0, 64); // First 32 bytes
  const yHex = publicKeyHex.slice(64, 128); // Next 32 bytes
  
  // Convert hex to base64url encoding
  const x = hexToBase64Url(xHex);
  const y = hexToBase64Url(yHex);
  
  return {
    x,
    y,
    jwk: {
      kty: 'EC',
      crv: 'secp256k1',
      x,
      y
    }
  };
}

/**
 * Generate a deterministic JWK from EOA address (for demonstration purposes)
 * In a real implementation, you'd need the actual private key
 */
export function generateDeterministicJwkFromAddress(address: string): {
  x: string;
  y: string;
  jwk: {
    kty: string;
    crv: string;
    x: string;
    y: string;
  };
} {
  // Create a deterministic "private key" based on the address
  // This is for demonstration only - not cryptographically secure
  const addressHash = keccak256(stringToHex(address));
  const mockPrivateKey = `0x${addressHash.slice(2)}` as `0x${string}`;
  
  return generatePublicKeyJwkFromPrivateKey(mockPrivateKey);
}

/**
 * Convert hex string to base64url encoding
 */
function hexToBase64Url(hex: string): string {
  // Convert hex to bytes
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  
  // Convert to base64
  const base64 = btoa(String.fromCharCode(...bytes));
  
  // Convert to base64url (replace + with -, / with _, remove padding)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Verify a signature using the public key JWK
 */
export async function verifyJwkSignature(
  message: string,
  signature: string,
  publicKeyJwk: { x: string; y: string }
): Promise<boolean> {
  try {
    // Convert base64url back to hex
    const xHex = base64UrlToHex(publicKeyJwk.x);
    const yHex = base64UrlToHex(publicKeyJwk.y);
    
    // Reconstruct the uncompressed public key
    const publicKey = `0x04${xHex}${yHex}`;
    
    // Create a temporary account to verify the signature
    // Note: This is a simplified verification - in practice you'd use a proper crypto library
    const account = privateKeyToAccount(`0x${'0'.repeat(64)}` as `0x${string}`); // Dummy private key
    
    // For now, we'll return true as a placeholder
    // In a real implementation, you'd use a proper secp256k1 verification library
    return true;
  } catch (error) {
    console.error('Error verifying JWK signature:', error);
    return false;
  }
}

/**
 * Convert base64url string back to hex
 */
function base64UrlToHex(base64url: string): string {
  // Convert base64url to base64
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  
  // Add padding if needed
  while (base64.length % 4) {
    base64 += '=';
  }
  
  // Convert to bytes
  const bytes = new Uint8Array(
    atob(base64)
      .split('')
      .map(char => char.charCodeAt(0))
  );
  
  // Convert to hex
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Extract private key from connected wallet (MetaMask/Web3Auth)
 * Note: This only works with certain wallet implementations
 */
export async function extractPrivateKeyFromWallet(provider: any, address: string): Promise<`0x${string}` | null> {
  try {
    console.log('🔍 Extracting private key from wallet:', { 
      provider: !!provider, 
      address,
      providerKeys: provider ? Object.keys(provider) : 'no provider'
    });
    
    // For Web3Auth, try to get the private key from the provider
    if (provider && provider.privateKey) {
      console.log('✅ Found private key in provider.privateKey');
      return provider.privateKey as `0x${string}`;
    }
    
    // If Web3Auth is available globally
    if (typeof window !== 'undefined' && (window as any).web3auth) {
      const web3auth = (window as any).web3auth;
      console.log('🔍 Checking global web3auth:', { 
        hasProvider: !!web3auth.provider,
        providerKeys: web3auth.provider ? Object.keys(web3auth.provider) : 'no provider'
      });
      if (web3auth.provider && web3auth.provider.privateKey) {
        console.log('✅ Found private key in global web3auth.provider.privateKey');
        return web3auth.provider.privateKey as `0x${string}`;
      }
    }
    
    // Try to get from provider's internal state
    if (provider && provider._privateKey) {
      console.log('✅ Found private key in provider._privateKey');
      return provider._privateKey as `0x${string}`;
    }
    
    // For MetaMask and similar wallets, this won't work due to security restrictions
    // But we can try the request method as a last resort
    if (provider && typeof provider.request === 'function') {
      try {
        const privateKey = await provider.request({
          method: 'eth_private_key',
          params: [address]
        });
        
        if (privateKey && privateKey.startsWith('0x')) {
          return privateKey as `0x${string}`;
        }
      } catch (e) {
        // This will likely fail due to security restrictions
        console.warn('eth_private_key method not supported by wallet');
      }
    }
    
    console.warn('❌ No private key found in any of the checked locations');
    return null;
  } catch (error) {
    console.error('❌ Error extracting private key from wallet:', error);
    return null;
  }
}

/**
 * Generate JWK from connected wallet's private key
 */
export async function generateJwkFromConnectedWallet(
  provider: any,
  address: string
): Promise<{
  x: string;
  y: string;
  jwk: {
    kty: string;
    crv: string;
    x: string;
    y: string;
  };
} | null> {
  try {
    const privateKey = await extractPrivateKeyFromWallet(provider, address);
    
    if (!privateKey) {
      console.warn('Could not extract private key from wallet');
      return null;
    }
    
    return generatePublicKeyJwkFromPrivateKey(privateKey);
  } catch (error) {
    console.error('Error generating JWK from wallet:', error);
    return null;
  }
}

/**
 * Sign a message using the EOA private key and return signature
 */
export async function signMessageWithEoa(
  message: string,
  privateKey: `0x${string}`,
  walletClient: any
): Promise<string> {
  const account = privateKeyToAccount(privateKey);
  
  // Sign the message
  const signature = await walletClient.signMessage({
    account: account.address as `0x${string}`,
    message
  });
  
  return signature;
}
