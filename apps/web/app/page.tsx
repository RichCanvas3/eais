"use client";
import { AgentTable } from "@/components/AgentTable";
import { Container, Typography, Box, Paper, Button } from '@mui/material';
import { Web3AuthButton } from '@/components/Web3AuthButton';
import { useWeb3Auth } from '@/components/Web3AuthProvider';
import * as React from 'react';
import { AddAgentModal } from '@/components/AddAgentModal';

export default function Page() {
  const { isLoggedIn } = useWeb3Auth();
  const [open, setOpen] = React.useState(false);
  const registryAddress = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS as `0x${string}`;
  const rpcUrl = (process.env.NEXT_PUBLIC_RPC_URL as string) || 'https://rpc.ankr.com/eth_sepolia';
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>EAIS, Agent Identity Service for Ethereum Blockchain</Typography>
        <Typography variant="body1" color="text.secondary">Search and explore registered agents, domains and addresses.</Typography>
        <Box sx={{ mt: 2 }}>
          <Web3AuthButton />
          {isLoggedIn && (
            <Button sx={{ ml: 1 }} variant="outlined" onClick={() => setOpen(true)}>Create Agent</Button>
          )}
        </Box>
      </Box>
      <Paper elevation={0} sx={{ p: { xs: 1, sm: 2 }, bgcolor: 'transparent' }}>
        <AgentTable />
      </Paper>
      <AddAgentModal open={open} onClose={() => setOpen(false)} registryAddress={registryAddress} rpcUrl={rpcUrl} />
    </Container>
  );
}
