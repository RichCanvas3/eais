"use client";
import { AgentTable } from "@/components/AgentTable";
import { StatsPanel } from "@/components/StatsPanel";
import { Container, Typography, Box, Paper, Button, Card, CardContent, Grid, Dialog, DialogTitle, DialogContent, DialogActions, TextField, IconButton } from '@mui/material';
import { useWeb3Auth } from '@/components/Web3AuthProvider';
import * as React from 'react';
import { AddAgentModal } from '@/components/AddAgentModal';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

export default function Page() {
  const { isLoggedIn, login, logout, address } = useWeb3Auth();
  const [open, setOpen] = React.useState(false);
  const [statsOpen, setStatsOpen] = React.useState(false);
  const [accessCodeOpen, setAccessCodeOpen] = React.useState(false);
  const [accessCode, setAccessCode] = React.useState<string | null>(null);
  const [accessCodeLoading, setAccessCodeLoading] = React.useState(false);

  const handleGetAccessCode = async () => {
    if (!address) return;
    
    setAccessCodeLoading(true);
    try {
      const response = await fetch('/api/getAccessCode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ address }),
      });

      if (!response.ok) {
        throw new Error('Failed to get access code');
      }

      const data = await response.json();
      setAccessCode(data.accessCode);
      setAccessCodeOpen(true);
    } catch (error) {
      console.error('Error getting access code:', error);
      alert('Failed to get access code. Please try again.');
    } finally {
      setAccessCodeLoading(false);
    }
  };

  const handleCopyAccessCode = () => {
    if (accessCode) {
      navigator.clipboard.writeText(accessCode);
      // You could show a toast notification here
    }
  };
  
  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Typography variant="h5" fontWeight={500} color="text.primary">Agentic Trust Layer</Typography>
            <Typography variant="body2" fontStyle="italic" color="text.secondary">by OrgTrust.eth</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {isLoggedIn && (
              <>
                <Button 
                  variant="outlined" 
                  onClick={handleGetAccessCode} 
                  disabled={accessCodeLoading}
                  disableElevation 
                  size="small" 
                  sx={{ borderColor: 'divider', color: 'text.secondary' }}
                >
                  {accessCodeLoading ? 'Loading...' : 'Get Indexer GraphQL Access Code'}
                </Button>
                <Button variant="outlined" onClick={() => setStatsOpen(true)} disableElevation size="small" sx={{ borderColor: 'divider', color: 'text.secondary' }}>
                  Stats
                </Button>
              </>
            )}
            <Button variant="outlined" onClick={isLoggedIn ? logout : login} disableElevation size="small" sx={{ borderColor: 'divider', color: 'text.primary' }}>
              {isLoggedIn ? 'Sign Out' : 'Sign In'}
            </Button>
          </Box>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: '800px' }}>
          Browse and manage ERC-8004 compliant agent identities across multiple blockchain networks.
        </Typography>
      </Box>
      
      {isLoggedIn ? (
        <Paper elevation={0} sx={{ p: { xs: 1, sm: 2 }, bgcolor: 'transparent' }}>
          <AgentTable />
        </Paper>
      ) : (
        <Box sx={{ py: 6 }}>
          <Box sx={{ textAlign: 'center', mb: 6 }}>
            <Typography variant="h4" fontWeight={500} color="text.primary" sx={{ mb: 2 }}>
              ERC-8004 Agent Explorer
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: '600px', mx: 'auto' }}>
              Browse registered agent identities on Ethereum Sepolia, Base Sepolia, and Optimism Sepolia.
            </Typography>

            <Button 
              variant="outlined" 
              size="medium" 
              onClick={login} 
              disableElevation
              sx={{ 
                px: 4, 
                py: 1.5, 
                borderColor: 'text.primary',
                color: 'text.primary',
                '&:hover': {
                  borderColor: 'text.primary',
                  bgcolor: 'action.hover'
                }
              }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                <Typography component="span" sx={{ textTransform: 'none' }}>Sign In</Typography>
                <Typography component="span" variant="caption" fontStyle="italic" color="text.secondary" sx={{ textTransform: 'none' }}>use your social login</Typography>
              </Box>
            </Button>
          </Box>
          
          <Grid container spacing={2} sx={{ maxWidth: '1000px', mx: 'auto', mt: 4 }}>
            <Grid item xs={12} sm={6} md={4}>
              <Card elevation={0} sx={{ p: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                <CardContent sx={{ p: '0 !important' }}>
                  <Typography variant="subtitle1" fontWeight={500} sx={{ mb: 1, color: 'text.primary' }}>
                    Social Authentication
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    Sign in using Google, Apple, Twitter, or other social providers. No crypto wallet required.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <Card elevation={0} sx={{ p: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                <CardContent sx={{ p: '0 !important' }}>
                  <Typography variant="subtitle1" fontWeight={500} sx={{ mb: 1, color: 'text.primary' }}>
                    On-Chain Identities
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    Each agent has a unique blockchain address with cryptographically verifiable ownership.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <Card elevation={0} sx={{ p: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                <CardContent sx={{ p: '0 !important' }}>
                  <Typography variant="subtitle1" fontWeight={500} sx={{ mb: 1, color: 'text.primary' }}>
                    ENS Integration
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    Human-readable names via Ethereum Name Service for easier identification and discovery.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <Card elevation={0} sx={{ p: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                <CardContent sx={{ p: '0 !important' }}>
                  <Typography variant="subtitle1" fontWeight={500} sx={{ mb: 1, color: 'text.primary' }}>
                    Multi-Chain Support
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    Manage agents across Ethereum L1 and L2 networks from a single interface.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <Card elevation={0} sx={{ p: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                <CardContent sx={{ p: '0 !important' }}>
                  <Typography variant="subtitle1" fontWeight={500} sx={{ mb: 1, color: 'text.primary' }}>
                    Indexer GraphQL Access
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    Query agent data via GraphQL API. Get your access token.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}
      
      <AddAgentModal open={open} onClose={() => setOpen(false)} />
      <StatsPanel open={statsOpen} onClose={() => setStatsOpen(false)} />
      
      <Dialog open={accessCodeOpen} onClose={() => setAccessCodeOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Indexer Access Code</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Use this access code to authenticate GraphQL requests. Include it in the Authorization header:
            <code style={{ display: 'block', marginTop: '8px', padding: '8px', background: '#f5f5f5', borderRadius: '4px', fontSize: '12px' }}>
              Authorization: Bearer {accessCode?.substring(0, 20)}...
            </code>
          </Typography>
          <TextField
            fullWidth
            value={accessCode || ''}
            label="Access Code"
            variant="outlined"
            InputProps={{
              readOnly: true,
              endAdornment: (
                <IconButton onClick={handleCopyAccessCode} size="small">
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              ),
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAccessCodeOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
