import * as React from 'react';
import ThemeRegistry from '@/components/ThemeRegistry';
import { Web3AuthProvider } from '@/components/Web3AuthProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeRegistry>
          <Web3AuthProvider
            clientId={process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID as string}
            chainIdHex={(process.env.NEXT_PUBLIC_CHAIN_ID_HEX as string) || '0xaa36a7'}
            rpcUrl={(process.env.NEXT_PUBLIC_RPC_URL as string) || 'https://rpc.ankr.com/eth_sepolia'}
          >
            {children}
          </Web3AuthProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}
