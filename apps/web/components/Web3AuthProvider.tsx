'use client';

import React, { useEffect, useState, createContext, useContext } from 'react';
import { initWeb3Auth, loginWithSocial, loginWithMetaMask, logout, getUserInfo, isConnected, getProvider, getPrivateKey } from '@/lib/web3auth';
import { privateKeyToAccount } from 'viem/accounts';

interface Web3AuthContextType {
  connected: boolean;
  isLoggedIn: boolean; // Alias for connected for backward compatibility
  userInfo: any;
  address: string | null;
  provider: any;
  loading: boolean;
  connect: (method: 'social' | 'metamask', provider?: 'google' | 'facebook' | 'twitter' | 'github') => Promise<void>;
  disconnect: () => Promise<void>;
  login: () => Promise<void>; // Alias for connect('social') for backward compatibility
  logout: () => Promise<void>; // Alias for disconnect for backward compatibility
}

const Web3AuthContext = createContext<Web3AuthContextType | undefined>(undefined);

export function useWeb3Auth() {
  const context = useContext(Web3AuthContext);
  if (!context) {
    throw new Error('useWeb3Auth must be used within Web3AuthProvider');
  }
  return context;
}

export function Web3AuthProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [provider, setProvider] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Only run on client-side
    if (typeof window === 'undefined') {
      setLoading(false);
      return;
    }

    async function initialize() {
      try {
        await initWeb3Auth();
        setInitialized(true);

        // Check if already connected
        const connected = await isConnected();
        if (connected) {
          const providerInstance = await getProvider();
          if (providerInstance) {
            setProvider(providerInstance);
            await handleConnected();
          }
        }
      } catch (error) {
        console.error('Failed to initialize Web3Auth:', error);
        // Don't set loading to false on error - let user retry
      } finally {
        setLoading(false);
      }
    }

    // Add a small delay to ensure window is fully available
    const timer = setTimeout(() => {
      initialize();
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  async function handleConnected() {
    try {
      const info = await getUserInfo();
      setUserInfo(info);
      setConnected(true);
      // Get private key from Web3Auth
      // Web3Auth stores the private key and we need to get it from the provider
      const provider = await getProvider();
      if (provider) {
        setProvider(provider);
        // For Web3Auth, we can get the private key from the provider
        // Note: This is only available server-side or through Web3Auth's SDK
        // We'll use the provider to get the address first
        const accounts = await provider.request({ method: 'eth_accounts' });
        if (accounts && accounts.length > 0) {
          setAddress(accounts[0]);
        }

        // Get private key from Web3Auth
        const privateKey = await getPrivateKey();

        if (privateKey) {
          // Normalize private key: ensure it has 0x prefix and is the correct length
          let normalizedKey = privateKey.trim();
          if (!normalizedKey.startsWith('0x')) {
            normalizedKey = `0x${normalizedKey}`;
          }

          // Ensure it's 64 hex characters (32 bytes) after 0x
          if (normalizedKey.length !== 66) {
            // If it's shorter, pad with zeros; if longer, truncate
            const hexPart = normalizedKey.slice(2);
            if (hexPart.length < 64) {
              normalizedKey = `0x${hexPart.padStart(64, '0')}`;
            } else if (hexPart.length > 64) {
              normalizedKey = `0x${hexPart.slice(0, 64)}`;
            }
          }

          // Store in session via API
          const response = await fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ privateKey: normalizedKey }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to store private key in session');
          }

          // Derive address from private key for display
          const account = privateKeyToAccount(normalizedKey as `0x${string}`);
          setAddress(account.address);
        } else {
          // For MetaMask, we can't get private key directly
          // The address was already set from eth_accounts above
          console.warn('Private key not available (MetaMask), using provider for signing');
        }
      }
    } catch (error) {
      console.error('Error handling connection:', error);
    }
  }

  async function connect(method: 'social' | 'metamask', provider?: 'google' | 'facebook' | 'twitter' | 'github') {
    try {
      setLoading(true);

      // Ensure Web3Auth is initialized before connecting
      if (!initialized) {
        await initWeb3Auth();
        setInitialized(true);
        // Wait a bit longer to ensure initialization is fully complete
        await new Promise(resolve => setTimeout(resolve, 300));
      } else {
        // Even if initialized, wait a bit to ensure adapters are ready
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (method === 'social' && provider) {
        await loginWithSocial(provider);
      } else if (method === 'metamask') {
        await loginWithMetaMask();
      }

      await handleConnected();
    } catch (error: any) {
      // Don't log cancellation errors - they're expected user behavior
      const errorMessage = error?.message || error?.toString() || '';
      if (!errorMessage.toLowerCase().includes('cancelled')) {
        console.error('Error connecting:', error);
      }
      // Re-throw with a more user-friendly message for popup closures
      if (errorMessage.toLowerCase().includes('cancelled') ||
          errorMessage.toLowerCase().includes('popup has been closed')) {
        throw new Error('Login cancelled');
      }
      throw error;
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    try {
      setLoading(true);
      await logout();

      // Clear session
      await fetch('/api/auth/session', {
        method: 'DELETE',
      });

      setConnected(false);
      setUserInfo(null);
      setAddress(null);
      setProvider(null);
    } catch (error) {
      console.error('Error disconnecting:', error);
    } finally {
      setLoading(false);
    }
  }

  // Alias functions for backward compatibility
  const login = async () => {
    // Default to Google for backward compatibility
    await connect('social', 'google');
  };

  return (
    <Web3AuthContext.Provider
      value={{
        connected,
        isLoggedIn: connected, // Alias for backward compatibility
        userInfo,
        address,
        provider,
        loading,
        connect,
        disconnect,
        login, // Alias for backward compatibility
        logout: disconnect, // Alias for backward compatibility
      }}
    >
      {children}
    </Web3AuthContext.Provider>
  );
}
