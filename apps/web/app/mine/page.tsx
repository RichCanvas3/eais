"use client";
import { Container, Typography, Box, Paper, Button, TextField, Alert, CircularProgress, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Card, CardContent, Grid } from '@mui/material';
import { useWeb3Auth } from '@/components/Web3AuthProvider';
import * as React from 'react';
import { sepolia } from 'viem/chains';
import ensService from '@/service/ensService';
import Link from 'next/link';

interface OwnedAgent {
  agentId: string;
  agentAddress: string;
  agentDomain: string;
  metadataURI: string | null;
  createdAtBlock: number;
  createdAtTime: number;
  derivedAddress: string;
}

interface MineResponse {
  owner: string;
  totalOwned: number;
  agents: OwnedAgent[];
}

export default function MinePage() {
  const { isLoggedIn, address: eoa, login } = useWeb3Auth();
  const [ownerAddress, setOwnerAddress] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<MineResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [ensNames, setEnsNames] = React.useState<Record<string, string | null>>({});

  // Set owner address to connected wallet when logged in
  React.useEffect(() => {
    if (isLoggedIn && eoa) {
      setOwnerAddress(eoa);
    }
  }, [isLoggedIn, eoa]);

  // Fetch ENS names for agent addresses
  const fetchEnsNames = async (agents: OwnedAgent[]) => {
    const ensMap: Record<string, string | null> = {};
    
    for (const agent of agents) {
      try {
        const ensName = await ensService.getEnsName(agent.agentAddress, sepolia);
        ensMap[agent.agentAddress] = ensName;
      } catch (error) {
        console.error(`Error fetching ENS name for ${agent.agentAddress}:`, error);
        ensMap[agent.agentAddress] = null;
      }
    }
    
    setEnsNames(ensMap);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!ownerAddress.trim()) {
      setError("Please enter an owner address");
      return;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(ownerAddress.trim())) {
      setError("Please enter a valid Ethereum address");
      return;
    }

    setLoading(true);
    setError(null);
    setData(null);
    setEnsNames({});

    try {
      const response = await fetch(`/api/agents/mine?owner=${encodeURIComponent(ownerAddress.trim())}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch mine data');
      }

      const result: MineResponse = await response.json();
      setData(result);
      
      // Fetch ENS names for the owned agents
      if (result.agents.length > 0) {
        await fetchEnsNames(result.agents);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h5" fontWeight={600}>Mine Agents - Find Your Agent Identities</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Link href="/" passHref>
              <Button variant="outlined" size="small">
                Back to Agents
              </Button>
            </Link>
            {!isLoggedIn && (
              <Button variant="contained" onClick={login} disableElevation size="small">
                Connect Wallet
              </Button>
            )}
          </Box>
        </Box>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          Enter an EOA address to find all agent identity IDs and associated AA addresses that are owned by that address.
        </Typography>
      </Box>

      <Paper elevation={0} sx={{ p: 3, mb: 3 }}>
        <form onSubmit={handleSubmit}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
            <TextField
              fullWidth
              label="Owner EOA Address"
              value={ownerAddress}
              onChange={(e) => setOwnerAddress(e.target.value)}
              placeholder="0x..."
              disabled={loading}
              helperText={isLoggedIn ? "Connected wallet address is pre-filled" : "Enter the EOA address to check ownership"}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={loading || !ownerAddress.trim()}
              sx={{ minWidth: 120 }}
            >
              {loading ? <CircularProgress size={20} /> : "Find Mine"}
            </Button>
          </Box>
        </form>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {data && (
        <Box>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Ownership Results
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">
                    Owner Address
                  </Typography>
                  <Typography variant="body1" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {data.owner}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">
                    Total Owned Agents
                  </Typography>
                  <Typography variant="h4" color="primary">
                    {data.totalOwned}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {data.agents.length > 0 ? (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Agent ID</TableCell>
                    <TableCell>Domain</TableCell>
                    <TableCell>Agent Address (AA)</TableCell>
                    <TableCell>ENS Name</TableCell>
                    <TableCell>Created</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.agents.map((agent) => (
                    <TableRow key={agent.agentId}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {agent.agentId}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {agent.agentDomain}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                            {agent.agentAddress}
                          </Typography>
                          <Button
                            size="small"
                            onClick={() => copyToClipboard(agent.agentAddress)}
                            sx={{ minWidth: 'auto', p: 0.5 }}
                          >
                            📋
                          </Button>
                        </Box>
                      </TableCell>
                      <TableCell>
                        {ensNames[agent.agentAddress] ? (
                          <Chip 
                            label={ensNames[agent.agentAddress]} 
                            size="small" 
                            color="primary" 
                            variant="outlined"
                          />
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            No ENS
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {formatTimestamp(agent.createdAtTime)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Block #{agent.createdAtBlock}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => window.open(`https://sepolia.etherscan.io/address/${agent.agentAddress}`, '_blank')}
                        >
                          View on Etherscan
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Alert severity="info">
              No agents found for this owner address. This means either:
              <ul>
                <li>The address has not created any agent identities</li>
                <li>The agents were created with a different derivation method</li>
                <li>There was an error in the ownership computation</li>
              </ul>
            </Alert>
          )}
        </Box>
      )}
    </Container>
  );
}
