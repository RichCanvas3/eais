'use client';

import React, { useEffect, useState, createContext, useContext, useMemo } from 'react';
import { connectWallet, getWalletAddress, disconnectWallet, isWalletConnected } from '@/lib/wallet';
import { useWeb3Auth } from './Web3AuthProvider';
import type { Address } from 'viem';

interface WalletContextType {
  connected: boolean;
  address: Address | null;
  eip1193Provider: any | null; // EIP-1193 provider (Web3Auth or MetaMask)
  loading: boolean;
  privateKeyMode: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return context;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState<Address | null>(null);
  const [loading, setLoading] = useState(true);

  // Get Web3Auth context (Web3AuthProvider wraps WalletProvider in layout)
  const web3AuthCtx = useWeb3Auth();

  const {
    connected: web3AuthConnected,
    address: web3AuthAddress,
    provider: web3AuthProvider,
    loading: authLoading,
  } = web3AuthCtx || {};

  // Check if private key mode is enabled (server-side check)
  const [serverPrivateKeyMode, setServerPrivateKeyMode] = useState<boolean>(false);

  // Check server-side private key mode
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/address', { method: 'GET' });
        if (res.ok) {
          setServerPrivateKeyMode(true);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const privateKeyMode = serverPrivateKeyMode;

  // Combine Web3Auth and direct wallet connection
  const eoaConnected = web3AuthConnected || connected;
  const eoaAddress = web3AuthAddress || address;
  // Determine the EIP-1193 provider
  // Priority: Web3Auth provider > MetaMask provider > null (if private key mode)
  const eip1193Provider = useMemo(() => {
    // If in private key mode, provider should be null
    if (privateKeyMode) {
      return null;
    }

    // Prefer Web3Auth provider if connected
    if (web3AuthConnected && web3AuthProvider) {
      return web3AuthProvider;
    }

    // Fall back to MetaMask if available and connected
    if (connected) {
      const metamaskProvider = typeof window !== 'undefined' ? (window as any)?.ethereum : null;
      if (metamaskProvider) {
        return metamaskProvider;
      }
    }

    // Return Web3Auth provider if available (even if not connected yet)
    if (web3AuthProvider) {
      return web3AuthProvider;
    }

    // Return MetaMask provider if available (even if not connected yet)
    const metamaskProvider = typeof window !== 'undefined' ? (window as any)?.ethereum : null;
    return metamaskProvider ?? null;
  }, [web3AuthConnected, web3AuthProvider, connected, privateKeyMode]);

  // Update connected state when Web3Auth state changes
  useEffect(() => {
    if (web3AuthConnected && web3AuthAddress) {
      // Web3Auth is connected - use its address
      setAddress(web3AuthAddress as Address);
      setConnected(true);
    } else if (web3AuthConnected === false && !connected) {
      // Neither Web3Auth nor direct wallet is connected
      setAddress(null);
      setConnected(false);
    }
  }, [web3AuthConnected, web3AuthAddress, connected]);

  useEffect(() => {
    // Only run on client-side
    if (typeof window === 'undefined') {
      setLoading(false);
      return;
    }

    async function checkConnection() {
      try {
        const isConnected = await isWalletConnected();
        if (isConnected) {
          const addr = await getWalletAddress();
          setAddress(addr);
          setConnected(true);

          // Store address in session for server-side use
          // Note: For direct wallet, we can't get private key
          // The server will need to use the wallet's signing capabilities
          if (addr) {
            await fetch('/api/auth/wallet-address', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ address: addr }),
            });
          }
        }
      } catch (error) {
        console.error('Error checking wallet connection:', error);
      } finally {
        setLoading(false);
      }
    }

    // Add a small delay to ensure window is fully available
    const timer = setTimeout(() => {
      checkConnection();
    }, 100);

    // Listen for account changes
    if (typeof window !== 'undefined' && window.ethereum?.on) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          setConnected(false);
          setAddress(null);
        } else {
          setAddress(accounts[0] as Address);
          setConnected(true);
        }
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);

      return () => {
        clearTimeout(timer);
        if (typeof window !== 'undefined' && window.ethereum?.removeListener) {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        }
      };
    }

    return () => clearTimeout(timer);
  }, []);

  async function connect() {
    // Prevent multiple simultaneous connection attempts
    if (loading) {
      console.warn('Connection already in progress, ignoring duplicate request');
      return;
    }

    try {
      setLoading(true);
      const addr = await connectWallet();
      setAddress(addr);
      setConnected(true);

      // Store address in session
      await fetch('/api/auth/wallet-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr }),
      });
    } catch (error: any) {
      console.error('Error connecting wallet:', error);

      // wallet.ts handles -32002 by polling for up to 30 seconds
      // If we get here, either:
      // 1. User rejected the request
      // 2. Polling timeout (30 seconds) expired - user didn't approve in time
      // 3. Some other error occurred

      // If the error is about a pending request, provide helpful guidance
      if (error?.code === -32002 ||
          (error?.message && (
            error.message.includes('pending') ||
            error.message.includes('already')
          ))) {
        throw new Error(
          'A wallet connection request is already pending in MetaMask. ' +
          'Please check your MetaMask extension and approve or reject the pending connection request, then try again.'
        );
      }

      // Re-throw other errors
      throw error;
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    try {
      setLoading(true);
      await disconnectWallet();

      // Clear session
      await fetch('/api/auth/wallet-address', {
        method: 'DELETE',
      });

      setConnected(false);
      setAddress(null);
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
    } finally {
      setLoading(false);
    }
  }

  // Use combined state for context
  const contextValue = useMemo(() => ({
    connected: eoaConnected,
    address: eoaAddress as Address | null,
    eip1193Provider,
    loading,
    privateKeyMode,
    connect,
    disconnect,
  }), [eoaConnected, eoaAddress, eip1193Provider, loading, privateKeyMode, connect, disconnect]);

  return (
    <WalletContext.Provider value={contextValue}>
      {children}
    </WalletContext.Provider>
  );
}

