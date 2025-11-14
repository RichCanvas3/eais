/**
 * Web3Auth configuration and utilities (v8)
 * Client-side only - must be initialized in browser
 *
 * This module uses dynamic imports to prevent SSR execution
 */

// Types for Web3Auth (not imported at module level to prevent SSR execution)
type Web3Auth = any;
type WALLET_ADAPTERS = any;

import { getWeb3AuthClientId, getChainRpcUrl, getWeb3AuthChainSettings } from '@agentic-trust/core';

// Lazy-loaded Web3Auth instance (client-side only)
let web3AuthInstance: Web3Auth | null = null;
let initializationPromise: Promise<Web3Auth> | null = null;
let initModalPromise: Promise<void> | null = null;

/**
 * Get Web3Auth instance (client-side only, lazy-loaded)
 */
async function getWeb3Auth(): Promise<Web3Auth> {
  // Only initialize on client-side
  if (typeof window === 'undefined') {
    throw new Error('Web3Auth can only be used on the client-side');
  }

  // Return existing instance if available
  if (web3AuthInstance) {
    return web3AuthInstance;
  }

  // If initialization is in progress, wait for it
  if (initializationPromise) {
    return initializationPromise;
  }

  // Start initialization
  initializationPromise = (async () => {
    const { Web3Auth } = await import('@web3auth/modal');
    const { CHAIN_NAMESPACES } = await import('@web3auth/base');
    const { EthereumPrivateKeyProvider } = await import('@web3auth/ethereum-provider');
    const { OpenloginAdapter } = await import('@web3auth/openlogin-adapter');

    // Get client ID from environment variable (available on client via NEXT_PUBLIC_)
    const clientId = getWeb3AuthClientId();
    if (!clientId) {
      throw new Error('Web3Auth client ID is not set');
    }

    // Chain configuration
    const chainIdHex = process.env.NEXT_PUBLIC_CHAIN_ID || '0xaa36a7'; // default Sepolia
    const chainId = parseInt(chainIdHex, 16);
    const rpcUrl = getChainRpcUrl(chainId);

    // Derive display/explorer by chain
    const displayName =
      chainIdHex.toLowerCase() === '0xaa36a7'
        ? 'Ethereum Sepolia'
        : chainIdHex.toLowerCase() === '0x14a34'
        ? 'Base Sepolia'
        : 'EVM Chain';

    const blockExplorerUrl =
      chainIdHex.toLowerCase() === '0xaa36a7'
        ? 'https://sepolia.etherscan.io'
        : chainIdHex.toLowerCase() === '0x14a34'
        ? 'https://sepolia.basescan.org'
        : undefined;

    const chainConfig = {
      chainNamespace: CHAIN_NAMESPACES.EIP155,
      chainId: chainIdHex,
      rpcTarget: rpcUrl,
      displayName,
      blockExplorerUrl,
      ticker: 'ETH',
      tickerName: 'Ethereum',
      decimals: 18,
    };

    const privateKeyProvider = new EthereumPrivateKeyProvider({ config: { chainConfig } });

    // Create Web3Auth instance (similar to working example)
    const web3Auth = new Web3Auth({
      clientId,
      privateKeyProvider: privateKeyProvider as any,
      web3AuthNetwork: 'sapphire_devnet',
    });

    // Create OpenLogin adapter for social logins
    // Simplified configuration - let Web3Auth use default providers
    const openloginAdapter = new OpenloginAdapter({
      adapterSettings: {
        uxMode: 'popup',
        // No external wallet adapters configured, so only social login will show
      },
    });

    // Configure OpenLogin adapter
    web3Auth.configureAdapter(openloginAdapter as any);

    // Create MetaMask adapter (optional - for MetaMask login)
    if (process.env.NEXT_PUBLIC_ENABLE_METAMASK !== 'false') {
      const { MetamaskAdapter } = await import('@web3auth/metamask-adapter');
      const metamaskAdapter = new MetamaskAdapter({
        clientId,
      });
      web3Auth.configureAdapter(metamaskAdapter as any);
    }

    web3AuthInstance = web3Auth;
    return web3Auth;
  })();

  return initializationPromise;
}

/**
 * Initialize Web3Auth (call this on client-side)
 * This must be called and awaited before any connect operations
 */
export async function initWeb3Auth(): Promise<void> {
  // If already initialized, return immediately
  if (initModalPromise) {
    return initModalPromise;
  }

  // Start initialization
  initModalPromise = (async () => {
    const web3Auth = await getWeb3Auth();
    await web3Auth.initModal();

    // Wait a bit more to ensure all adapters are fully initialized
    // This is necessary because initModal() may return before adapters are ready
    // MetaMask adapter in particular needs extra time to detect browser extension
    await new Promise(resolve => setTimeout(resolve, 1500));
  })();

  return initModalPromise;
}

/**
 * Ensure Web3Auth is initialized before connecting
 * This ensures initModal() has fully completed
 */
async function ensureInitialized(): Promise<void> {
  // If initModal hasn't been called yet, call it now
  if (!initModalPromise) {
    await initWeb3Auth();
  }

  // Always wait for initialization promise to complete
  if (initModalPromise) {
    await initModalPromise;
  } else {
    throw new Error('Web3Auth initialization failed');
  }

  // Get Web3Auth instance and verify it's ready
  const web3Auth = await getWeb3Auth();

  // Check if Web3Auth has a ready property (Web3Auth v8)
  // If not, we'll rely on the delay in initWeb3Auth
  if (typeof web3Auth.ready !== 'undefined') {
    // Poll for ready state with timeout
    let attempts = 0;
    const maxAttempts = 30; // 3 seconds total (30 * 100ms)
    while (!web3Auth.ready && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    if (!web3Auth.ready) {
      throw new Error('Web3Auth is not ready. Please wait and try again.');
    }
  }

  // Additional wait to ensure adapters (especially MetaMask) are fully ready
  // This is critical for MetaMask adapter which can take longer to initialize
  await new Promise(resolve => setTimeout(resolve, 500));
}

/**
 * Login with social provider
 */
export async function loginWithSocial(provider: 'google' | 'facebook' | 'twitter' | 'github'): Promise<void> {
  // Ensure Web3Auth is fully initialized before connecting
  await ensureInitialized();

  const { WALLET_ADAPTERS } = await import('@web3auth/base');
  const web3Auth = await getWeb3Auth();

  try {
    const providerInstance = await web3Auth.connectTo(WALLET_ADAPTERS.OPENLOGIN, {
      loginProvider: provider,
    });
    return providerInstance as any;
  } catch (error: any) {
    // Handle user cancellation gracefully
    const errorMessage = error?.message || error?.toString() || '';
    const errorCode = error?.code || '';
    const errorName = error?.name || '';

    // Check for various popup closure indicators
    if (
      errorMessage.toLowerCase().includes('popup has been closed') ||
      errorMessage.toLowerCase().includes('closed by the user') ||
      errorMessage.toLowerCase().includes('user closed') ||
      errorCode === 'popup_closed_by_user' ||
      (errorName === 'LoginError' && errorMessage.toLowerCase().includes('popup'))
    ) {
      // Silently handle cancellation - don't throw, just return
      // This allows the UI to gracefully handle the cancellation
      throw new Error('Login cancelled');
    }
    throw error;
  }
}

/**
 * Login with MetaMask
 */
export async function loginWithMetaMask(): Promise<void> {
  // Ensure Web3Auth is fully initialized before connecting
  await ensureInitialized();

  // Additional wait specifically for MetaMask adapter
  // MetaMask adapter needs extra time to check browser extension availability
  await new Promise(resolve => setTimeout(resolve, 500));

  const { WALLET_ADAPTERS } = await import('@web3auth/base');
  const web3Auth = await getWeb3Auth();

  // Retry logic for MetaMask adapter
  let attempts = 0;
  const maxAttempts = 20; // 4 seconds total (20 * 200ms)
  let lastError: Error | null = null;

  while (attempts < maxAttempts) {
    try {
      const providerInstance = await web3Auth.connectTo(WALLET_ADAPTERS.METAMASK);
      return providerInstance as any;
    } catch (error: any) {
      lastError = error;
      const errorMessage = error?.message || error?.toString() || '';

      // If it's a "not ready" error, wait and retry with exponential backoff
      if (
        errorMessage.toLowerCase().includes('not ready') ||
        errorMessage.toLowerCase().includes('adapter is not ready') ||
        errorMessage.toLowerCase().includes('wallet adapter is not ready')
      ) {
        attempts++;
        if (attempts < maxAttempts) {
          // Exponential backoff: 200ms, 400ms, 600ms, etc. (capped at 1000ms)
          const delay = Math.min(200 * attempts, 1000);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue; // Retry
        }
      } else {
        // If it's a different error, throw immediately
        throw error;
      }
    }
  }

  // If we get here, we've exhausted all retries
  throw lastError || new Error('MetaMask adapter is not ready. Please wait and try again.');
}

/**
 * Logout
 */
export async function logout(): Promise<void> {
  const web3Auth = await getWeb3Auth();
  await web3Auth.logout();
}

/**
 * Get user info
 */
export async function getUserInfo() {
  const web3Auth = await getWeb3Auth();
  return web3Auth.getUserInfo();
}

/**
 * Check if user is connected
 */
export async function isConnected(): Promise<boolean> {
  try {
    const web3Auth = await getWeb3Auth();
    return web3Auth.connected;
  } catch {
    return false;
  }
}

/**
 * Get the provider
 */
export async function getProvider() {
  const web3Auth = await getWeb3Auth();
  return web3Auth.provider;
}

/**
 * Get private key from Web3Auth (for OpenLogin providers)
 */
export async function getPrivateKey(): Promise<string | null> {
  try {
    const web3Auth = await getWeb3Auth();
    if (!web3Auth.connected || !web3Auth.provider) {
      return null;
    }

    // For OpenLogin providers, we can get the private key
    const privateKey = await web3Auth.provider.request({ method: 'eth_private_key' });
    return privateKey as string;
  } catch (error) {
    console.error('Error getting private key:', error);
    return null;
  }
}

export async function ensureWeb3AuthChain(chainId: number): Promise<boolean> {
  try {
    const web3Auth = await getWeb3Auth();
    if (!web3Auth || !web3Auth.connected) {
      console.info('[web3auth] ensureWeb3AuthChain: Web3Auth not connected');
      return false;
    }

    const settings = getWeb3AuthChainSettings(chainId);
    if (!settings.rpcTarget) {
      console.warn('[web3auth] ensureWeb3AuthChain: missing rpcTarget for chain', chainId);
      return false;
    }

    const { CHAIN_NAMESPACES } = await import('@web3auth/base');

    if (typeof web3Auth.addChain === 'function') {
      try {
        await web3Auth.addChain({
          chainNamespace: CHAIN_NAMESPACES.EIP155,
          chainId: settings.chainId,
          rpcTarget: settings.rpcTarget,
          displayName: settings.displayName,
          blockExplorerUrl: settings.blockExplorerUrl,
          ticker: settings.ticker,
          tickerName: settings.tickerName,
          decimals: settings.decimals,
        });
        console.info('[web3auth] ensureWeb3AuthChain: registered chain config', chainId);
      } catch (addErr: any) {
        const message = addErr?.message?.toString().toLowerCase() ?? '';
        if (!message.includes('already added') && !message.includes('already exists')) {
          console.warn('[web3auth] ensureWeb3AuthChain: addChain failed', addErr);
          return false;
        }
      }
    }

    if (typeof web3Auth.switchChain === 'function') {
      try {
        await web3Auth.switchChain({ chainId: settings.chainId });
        console.info('[web3auth] ensureWeb3AuthChain: switched via Web3Auth API', chainId);
        return true;
      } catch (switchErr) {
        console.warn('[web3auth] ensureWeb3AuthChain: switchChain failed, falling back to provider request', switchErr);
      }
    }

    const provider = web3Auth.provider;
    if (!provider?.request) {
      console.warn('[web3auth] ensureWeb3AuthChain: provider does not support request');
      return false;
    }

    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: settings.chainId }],
      });
      console.info('[web3auth] ensureWeb3AuthChain: switched via wallet_switchEthereumChain', chainId);
      return true;
    } catch (switchErr: any) {
      const errorCode = switchErr?.code ?? switchErr?.data?.originalError?.code;
      if (errorCode !== 4902) {
        console.warn('[web3auth] ensureWeb3AuthChain: wallet_switchEthereumChain failed', switchErr);
        return false;
      }

      try {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: settings.chainId,
              chainName: settings.displayName,
              nativeCurrency: settings.nativeCurrency,
              rpcUrls: settings.rpcUrls,
              blockExplorerUrls: settings.blockExplorerUrls,
            },
          ],
        });
        console.info('[web3auth] ensureWeb3AuthChain: added chain via wallet_addEthereumChain', chainId);
        return true;
      } catch (addErr) {
        console.warn('[web3auth] ensureWeb3AuthChain: wallet_addEthereumChain failed', addErr);
        return false;
      }
    }
  } catch (error) {
    console.warn('[web3auth] ensureWeb3AuthChain: unexpected error', error);
    return false;
  }
}

