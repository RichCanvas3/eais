import * as React from 'react';
import ThemeRegistry from '@/components/ThemeRegistry';
import { Web3AuthProvider } from '@/components/Web3AuthProvider';
import { WalletProvider } from '@/components/WalletProvider';
import { OrgIdentityClientProvider } from '@/components/OrgIdentityClientProvider';
import {  AIAgentIdentityClientProvider } from '@/components/AIAgentIdentityClientProvider';
import { AIAgentIdentityClientsProvider } from '@/components/AIAgentIdentityClientsProvider';
import { AIAgentENSClientProvider } from '@/components/AIAgentENSClientProvider';
import { AIAgentENSClientsProvider } from '@/components/AIAgentENSClientsProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeRegistry>
          <Web3AuthProvider>
            <WalletProvider>
              <AIAgentENSClientProvider>
                <AIAgentENSClientsProvider>
                  <OrgIdentityClientProvider>
                    <AIAgentIdentityClientProvider>
                      <AIAgentIdentityClientsProvider>
                        {children}
                      </AIAgentIdentityClientsProvider>
                    </AIAgentIdentityClientProvider>
                  </OrgIdentityClientProvider>
                </AIAgentENSClientsProvider>
              </AIAgentENSClientProvider>
            </WalletProvider>
          </Web3AuthProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}
