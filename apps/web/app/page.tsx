"use client";
import { Button } from "@/components/ui/button";
import { AgentTable } from "@/components/AgentTable";
import { StatsPanel } from "@/components/StatsPanel";
import { useWeb3Auth } from '@/components/Web3AuthProvider';
import * as React from 'react';
import { AddAgentModal } from '@/components/AddAgentModal';
import Link from 'next/link';

export default function Page() {
  const { isLoggedIn, login, logout } = useWeb3Auth();
  const [open, setOpen] = React.useState(false);
  const [statsOpen, setStatsOpen] = React.useState(false);
  
  if (isLoggedIn) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="font-serif text-xl">Agentic Trust Layer</div>
            <nav className="hidden md:flex items-center gap-8">
              <Link href="https://github.com/Agentic-Trust-Layer/eais" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Documentation
              </Link>
              <Link href="https://github.com/Agentic-Trust-Layer/eais" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                GitHub
              </Link>
            </nav>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setStatsOpen(true)}>
                View Stats
              </Button>
              <Button variant="outline" size="sm" onClick={logout}>
                Disconnect
              </Button>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8">
          <div className="mb-6">
            <h1 className="text-3xl font-semibold mb-2">Agent Explorer</h1>
            <p className="text-muted-foreground">Discover, evaluate, and connect with AI agents in the agentic ecosystem.</p>
          </div>
          <AgentTable />
        </main>
        
        <AddAgentModal open={open} onClose={() => setOpen(false)} />
        <StatsPanel open={statsOpen} onClose={() => setStatsOpen(false)} />
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="font-serif text-xl">Agentic Trust Layer</div>
          <nav className="hidden md:flex items-center gap-8">
            <Link href="https://github.com/Agentic-Trust-Layer/eais" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Documentation
            </Link>
            <Link href="https://github.com/Agentic-Trust-Layer/eais" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              GitHub
            </Link>
          </nav>
          <Button variant="outline" size="sm" onClick={login}>
            Open App
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-24 md:py-32">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-muted/30 text-sm text-muted-foreground mb-4">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            ERC-8004 discovery and trust layer
          </div>

          <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl text-balance leading-tight">
            Decentralized Trust Infrastructure
          </h1>

          <p className="font-mono text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto text-pretty leading-relaxed">
            A protocol-level solution for agent discovery, verification, and trust establishment in decentralized
            systems.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button size="lg" className="min-w-[160px]" onClick={login}>
              Open App
            </Button>
            <Button size="lg" variant="outline" className="min-w-[160px] bg-transparent" asChild>
              <Link href="https://github.com/Agentic-Trust-Layer/eais">
                Read Docs
              </Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
