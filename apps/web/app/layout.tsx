import * as React from 'react';
import ThemeRegistry from '@/components/ThemeRegistry';
import { Web3AuthProvider } from '@/components/Web3AuthProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeRegistry>
          <Web3AuthProvider clientId={process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID as string} chainIdHex={process.env.NEXT_PUBLIC_CHAIN_ID_HEX as string || '0x1'} rpcUrl={process.env.RPC_HTTP_URL as string || 'https://mainnet.infura.io/v3/demo'}>
            {children}
          </Web3AuthProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}
