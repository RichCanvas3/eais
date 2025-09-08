"use client";
import { AgentTable } from "@/components/AgentTable";
import { Container, Typography, Box, Paper, Button } from '@mui/material';
import { useWeb3Auth } from '@/components/Web3AuthProvider';
import * as React from 'react';
import { AddAgentModal } from '@/components/AddAgentModal';
import Link from 'next/link';

export default function Page() {
  const { isLoggedIn, login, logout } = useWeb3Auth();
  const [open, setOpen] = React.useState(false);
  const registryAddress = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS as `0x${string}`;
  const rpcUrl = (process.env.NEXT_PUBLIC_RPC_URL as string) || 'https://rpc.ankr.com/eth_sepolia';
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h5" fontWeight={600}>EAIS, Agent Identity Service for Ethereum Blockchain</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Link href="/mine" passHref>
              <Button variant="outlined" size="small">
                Mine Agents
              </Button>
            </Link>
            <Button variant="contained" onClick={isLoggedIn ? logout : login} disableElevation size="small">
              {isLoggedIn ? 'Disconnect' : 'Login'}
            </Button>
          </Box>
        </Box>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>Search and explore registered agents, domains and addresses.</Typography>
      </Box>
      <Paper elevation={0} sx={{ p: { xs: 1, sm: 2 }, bgcolor: 'transparent' }}>
        <AgentTable />
      </Paper>
      <AddAgentModal open={open} onClose={() => setOpen(false)} registryAddress={registryAddress} rpcUrl={rpcUrl} />
    </Container>
  );
}
