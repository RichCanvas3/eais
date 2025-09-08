import { sepolia } from 'viem/chains';

/**
 * Utility functions for handling MetaMask network configuration
 */

export const SEPOLIA_CONFIG = {
  chainId: `0x${sepolia.id.toString(16)}`, // 0xaa36a7
  chainName: 'Sepolia Testnet',
  nativeCurrency: {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: [
    process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.ankr.com/eth_sepolia',
  ],
  blockExplorerUrls: ['https://sepolia.etherscan.io'],
};

/**
 * Add Sepolia network to MetaMask if not already added
 */
export async function addSepoliaNetwork(): Promise<boolean> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('MetaMask not detected');
  }

  try {
    await (window as any).ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [SEPOLIA_CONFIG],
    });
    return true;
  } catch (error: any) {
    // If the network already exists, that's fine
    if (error.code === 4902) {
      return true;
    }
    console.error('Error adding Sepolia network:', error);
    return false;
  }
}

/**
 * Switch to Sepolia network
 */
export async function switchToSepoliaNetwork(): Promise<boolean> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('MetaMask not detected');
  }

  try {
    await (window as any).ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: SEPOLIA_CONFIG.chainId }],
    });
    return true;
  } catch (error: any) {
    // If the network doesn't exist, try to add it
    if (error.code === 4902) {
      return await addSepoliaNetwork();
    }
    console.error('Error switching to Sepolia network:', error);
    return false;
  }
}

/**
 * Get current network from MetaMask
 */
export async function getCurrentNetwork(): Promise<{ chainId: string; name?: string } | null> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    return null;
  }

  try {
    const chainId = await (window as any).ethereum.request({
      method: 'eth_chainId',
    });
    
    const networkName = await (window as any).ethereum.request({
      method: 'net_version',
    });

    return { chainId, name: networkName };
  } catch (error) {
    console.error('Error getting current network:', error);
    return null;
  }
}

/**
 * Check if current network is Sepolia
 */
export async function isSepoliaNetwork(): Promise<boolean> {
  const network = await getCurrentNetwork();
  return network?.chainId === SEPOLIA_CONFIG.chainId;
}
