"use client";
import { AgentTable } from "@/components/AgentTable";
import { Container, Typography, Box, Paper, Button, Card, CardContent, Grid } from '@mui/material';
import { useWeb3Auth } from '@/components/Web3AuthProvider';
import * as React from 'react';
import { AddAgentModal } from '@/components/AddAgentModal';

export default function Page() {
  const { isLoggedIn, login, logout } = useWeb3Auth();
  const [open, setOpen] = React.useState(false);
  const registryAddress = process.env.NEXT_PUBLIC_ETH_SEPOLIA_IDENTITY_REGISTRY as `0x${string}`;
  const rpcUrl = process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL as string;
  
  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h5" fontWeight={600}>Agentic Trust Layer - Agent Explorer</Typography>
          <Button variant="contained" onClick={isLoggedIn ? logout : login} disableElevation size="small">
            {isLoggedIn ? 'Disconnect' : 'Login'}
          </Button>
        </Box>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>Discover, evaluate, and connect with AI agents in the agentic ecosystem.</Typography>
      </Box>
      
      {isLoggedIn ? (
        <Paper elevation={0} sx={{ p: { xs: 1, sm: 2 }, bgcolor: 'transparent' }}>
          <AgentTable />
        </Paper>
      ) : (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h3" fontWeight={600} sx={{ mb: 3, color: 'primary.main' }}>
            Create and Manage your Agent Identity with only your social login
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 4, maxWidth: '600px', mx: 'auto' }}>
            Connect with your social account to start creating and managing AI agent identities on the blockchain. 
            No complex wallet setup required - just your familiar social login.
          </Typography>
          <Button 
            variant="contained" 
            size="large" 
            onClick={login} 
            disableElevation
            sx={{ px: 4, py: 1.5, fontSize: '1.1rem' }}
          >
            Get Started with Social Login
          </Button>
          
          <Grid container spacing={3} sx={{ mt: 6, maxWidth: '800px', mx: 'auto' }}>
            <Grid item xs={12} md={4}>
              <Card elevation={0} sx={{ p: 2, textAlign: 'center', border: '1px solid', borderColor: 'divider' }}>
                <CardContent>
                  <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
                    Easy Setup
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Create agent identities with just your social login - no wallet complexity
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card elevation={0} sx={{ p: 2, textAlign: 'center', border: '1px solid', borderColor: 'divider' }}>
                <CardContent>
                  <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
                    Secure & Decentralized
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Your agent identities are secured on the blockchain with full ownership
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card elevation={0} sx={{ p: 2, textAlign: 'center', border: '1px solid', borderColor: 'divider' }}>
                <CardContent>
                  <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
                    Full Control
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Manage your agents, set URLs, and control all aspects of your identity
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}
      
      <AddAgentModal open={open} onClose={() => setOpen(false)} registryAddress={registryAddress} rpcUrl={rpcUrl} />
    </Container>
  );
}
