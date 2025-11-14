'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWeb3Auth } from './Web3AuthProvider';
import { useWallet } from './WalletProvider';

export function LoginPage() {
  const router = useRouter();
  const { connect, loading, isLoggedIn } = useWeb3Auth();
  const { connect: walletConnect, connected: walletConnected, loading: walletLoading } = useWallet();

  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoggedIn || walletConnected) {
      router.replace('/');
    }
  }, [isLoggedIn, walletConnected, router]);

  const handleSocialLogin = async (provider: 'google' | 'facebook' | 'twitter' | 'github') => {
    try {
      setConnecting(true);
      setError(null);
      await connect('social', provider);
      // Don't set connecting to false here - let the provider handle it
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect';
      // Don't show error for user cancellation
      if (!errorMessage.toLowerCase().includes('cancelled')) {
        setError(errorMessage);
      }
      setConnecting(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
    }}>
      <div style={{
        padding: '3rem',
        backgroundColor: '#fff',
        borderRadius: '12px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        maxWidth: '500px',
        width: '100%',
      }}>
        <h1 style={{ marginBottom: '2rem', fontSize: '2rem', fontWeight: 'bold', textAlign: 'center' }}>
          Agent Trust Admin Login
        </h1>

        {error && (
          <div style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            backgroundColor: '#ffebee',
            borderRadius: '4px',
            color: '#c62828',
            border: '1px solid #f44336',
          }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <button
            onClick={() => handleSocialLogin('google')}
            disabled={loading || connecting}
            style={{
              padding: '1rem',
              backgroundColor: '#4285f4',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: loading || connecting ? 'not-allowed' : 'pointer',
              opacity: loading || connecting ? 0.6 : 1,
            }}
          >
            {connecting ? 'Connecting...' : 'Continue with Google'}
          </button>
          <button
            onClick={() => handleSocialLogin('github')}
            disabled={loading || connecting}
            style={{
              padding: '1rem',
              backgroundColor: '#24292e',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: loading || connecting ? 'not-allowed' : 'pointer',
              opacity: loading || connecting ? 0.6 : 1,
            }}
          >
            {connecting ? 'Connecting...' : 'Continue with GitHub'}
          </button>
          <button
            onClick={() => handleSocialLogin('twitter')}
            disabled={loading || connecting}
            style={{
              padding: '1rem',
              backgroundColor: '#1da1f2',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: loading || connecting ? 'not-allowed' : 'pointer',
              opacity: loading || connecting ? 0.6 : 1,
            }}
          >
            {connecting ? 'Connecting...' : 'Continue with Twitter'}
          </button>
          <button
            onClick={() => handleSocialLogin('facebook')}
            disabled={loading || connecting}
            style={{
              padding: '1rem',
              backgroundColor: '#1877f2',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: loading || connecting ? 'not-allowed' : 'pointer',
              opacity: loading || connecting ? 0.6 : 1,
            }}
          >
            {connecting ? 'Connecting...' : 'Continue with Facebook'}
          </button>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            margin: '1rem 0',
          }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#ddd' }} />
            <span style={{ color: '#666' }}>OR</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#ddd' }} />
          </div>
          <button
            onClick={async () => {
              try {
                setConnecting(true);
                setError(null);
                await walletConnect();
                // Connection successful - setConnecting will be set to false by the provider
                setConnecting(false);
              } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Failed to connect wallet';
                setError(errorMessage);
                setConnecting(false);
              }
            }}
            disabled={connecting || walletConnected}
            style={{
              padding: '1rem',
              backgroundColor: '#627EEA',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: connecting || walletConnected ? 'not-allowed' : 'pointer',
              opacity: connecting || walletConnected ? 0.6 : 1,
            }}
          >
            {walletConnected ? 'Wallet Connected' : connecting ? 'Connecting...' : (walletLoading ? 'Initializing Wallet...' : 'Connect Direct Wallet')}
          </button>
        </div>
        <p style={{
          marginTop: '2rem',
          fontSize: '0.85rem',
          color: '#666',
          textAlign: 'center',
        }}>
          Secure authentication powered by Web3Auth or direct wallet connection
        </p>
      </div>
    </div>
  );
}

