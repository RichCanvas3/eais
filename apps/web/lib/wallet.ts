import type { Address } from 'viem';

/**
 * Connect to MetaMask or other EIP-1193 wallet
 */
export async function connectWallet(): Promise<Address> {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('MetaMask or another EIP-1193 wallet is required');
  }

  const provider = window.ethereum;
  if (typeof provider.request !== 'function') {
    throw new Error('The detected wallet does not support request()');
  }

  // Check if there's a pending request
  // MetaMask error code -32002 means a request is already pending
  try {
    // Request account access
    const accounts = (await provider.request({
      method: 'eth_requestAccounts',
    })) as string[];

    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts found');
    }

    const address = accounts[0] as Address;
    return address;
  } catch (error: any) {
    // Handle -32002 (pending request) by polling
    if (error?.code === -32002) {
      // Poll for up to 30 seconds
      const maxAttempts = 60;
      const pollInterval = 500; // 500ms

      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        try {
          const accounts = (await provider.request({
            method: 'eth_requestAccounts',
          })) as string[];

          if (accounts && accounts.length > 0) {
            return accounts[0] as Address;
          }
        } catch (pollError: any) {
          // If we get a different error (not -32002), break and throw
          if (pollError?.code !== -32002) {
            throw pollError;
          }
          // Otherwise continue polling
        }
      }

      // If we've exhausted polling attempts, throw an error
      throw new Error(
        'Wallet connection request is pending. Please check your MetaMask extension and approve or reject the pending connection request, then try again.'
      );
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Get current wallet address
 */
export async function getWalletAddress(): Promise<Address | null> {
  if (typeof window === 'undefined' || !window.ethereum) {
    return null;
  }

  try {
    const provider = window.ethereum;
    if (typeof provider.request !== 'function') {
      return null;
    }
    const accounts = (await provider.request({
      method: 'eth_accounts',
    })) as string[];

    if (!accounts || accounts.length === 0) {
      return null;
    }

    return accounts[0] as Address;
  } catch {
    return null;
  }
}

/**
 * Disconnect wallet
 */
export async function disconnectWallet(): Promise<void> {
  // For MetaMask and most EIP-1193 wallets, there's no explicit disconnect
  // The connection is maintained until the user disconnects in the wallet UI
  // We just clear local state
  if (typeof window !== 'undefined' && window.ethereum) {
    // Listen for account changes which indicate disconnection
    // This is handled by the WalletProvider component
  }
}

/**
 * Check if wallet is connected
 */
export async function isWalletConnected(): Promise<boolean> {
  const address = await getWalletAddress();
  return address !== null;
}

