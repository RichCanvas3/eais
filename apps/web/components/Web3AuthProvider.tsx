'use client';
import * as React from 'react';
import { createWeb3Auth } from '@/lib/web3auth';

type Web3AuthContextValue = {
  address: string | null;
  isLoggedIn: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  provider: any | null;
};

const Web3AuthContext = React.createContext<Web3AuthContextValue | undefined>(undefined);

export function useWeb3Auth() {
  const ctx = React.useContext(Web3AuthContext);
  if (!ctx) throw new Error('useWeb3Auth must be used within Web3AuthProvider');
  return ctx;
}

type Props = {
  children: React.ReactNode;
  clientId: string;
  chainIdHex: string;
  rpcUrl: string;
};

export function Web3AuthProvider({ children, clientId, chainIdHex, rpcUrl }: Props) {
  const [provider, setProvider] = React.useState<any | null>(null);
  const [address, setAddress] = React.useState<string | null>(null);
  const [web3auth, setWeb3auth] = React.useState<any | null>(null);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      const w3a = createWeb3Auth(clientId, chainIdHex, rpcUrl);
      await w3a.initModal();
      if (!mounted) return;
      setWeb3auth(w3a);
      if (w3a.provider) {
        setProvider(w3a.provider);
        try {
          const accounts = await w3a.provider.request({ method: 'eth_accounts' });
          setAddress((accounts as string[])?.[0] ?? null);
        } catch {}
      }
    })();
    return () => { mounted = false; };
  }, [clientId, chainIdHex, rpcUrl]);

  const login = React.useCallback(async () => {
    if (!web3auth) return;
    try {
      // Connect using Web3Auth connect() - will show OpenLogin modal with social providers
      const p = await web3auth.connect();
      setProvider(p);
      try {
        const accounts = await p.request({ method: 'eth_accounts' });
        setAddress(accounts?.[0] ?? null);
      } catch (error) {
        console.error('Error getting accounts:', error);
      }
    } catch (error) {
      console.error('Error connecting to Web3Auth:', error);
    }
  }, [web3auth]);

  const logout = React.useCallback(async () => {
    if (!web3auth) return;
    await web3auth.logout();
    setProvider(null);
    setAddress(null);
  }, [web3auth]);

  return (
    <Web3AuthContext.Provider value={{ address, isLoggedIn: !!address, login, logout, provider }}>
      {children}
    </Web3AuthContext.Provider>
  );
}


