import type React from "react"
import type { Metadata } from "next"
import { Inter, JetBrains_Mono, Instrument_Serif } from "next/font/google"
// import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import ThemeRegistry from '@/components/ThemeRegistry';
import { Web3AuthProvider } from '@/components/Web3AuthProvider';
import { OrgIdentityClientProvider } from '@/components/OrgIdentityClientProvider';
import { AIAgentIdentityClientProvider } from '@/components/AIAgentIdentityClientProvider';
import { AIAgentIdentityClientsProvider } from '@/components/AIAgentIdentityClientsProvider';
import { AIAgentENSClientProvider } from '@/components/AIAgentENSClientProvider';
import { AIAgentENSClientsProvider } from '@/components/AIAgentENSClientsProvider';

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" })
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-instrument-serif"
})

export const metadata: Metadata = {
  title: "Agentic Trust Layer",
  description: "ERC-8004 discovery and trust layer",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable} font-sans antialiased`}>
        <ThemeRegistry>
          <Web3AuthProvider
            clientId={process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID as string}
            chainIdHex={process.env.NEXT_PUBLIC_ETH_SEPOLIA_CHAIN_ID_HEX as string}
            rpcUrl={process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL as string}
          >
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
          </Web3AuthProvider>
        </ThemeRegistry>
        {/* <Analytics /> */}
      </body>
    </html>
  );
}
