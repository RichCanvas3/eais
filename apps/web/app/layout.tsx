import * as React from 'react';
import ThemeRegistry from '@/components/ThemeRegistry';
import { Web3AuthProvider } from '@/components/Web3AuthProvider';
import { OrgIdentityClientProvider } from '@/components/OrgIdentityClientProvider';
import {  AIAgentIdentityClientProvider } from '@/components/AIAgentIdentityClientProvider';
import { AIAgentIdentityClientsProvider } from '@/components/AIAgentIdentityClientsProvider';
import { AIAgentENSClientProvider } from '@/components/AIAgentENSClientProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeRegistry>
          <Web3AuthProvider
            clientId={process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID as string}
            chainIdHex={process.env.NEXT_PUBLIC_ETH_SEPOLIA_CHAIN_ID_HEX as string}
            rpcUrl={process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL as string}
          >
            <AIAgentENSClientProvider>
              <OrgIdentityClientProvider>
              
              <AIAgentIdentityClientProvider>
              <AIAgentIdentityClientsProvider>
                {children}
                </AIAgentIdentityClientsProvider>
              </AIAgentIdentityClientProvider>
              </OrgIdentityClientProvider>
            </AIAgentENSClientProvider>
            </Web3AuthProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}
