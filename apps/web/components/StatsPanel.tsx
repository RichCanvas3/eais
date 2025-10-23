'use client';
import * as React from 'react';
import { Box, Paper, Typography, Grid, Card, CardContent, Chip, CircularProgress, Alert, Dialog, DialogTitle, DialogContent, IconButton } from '@mui/material';
import { TrendingUp, Storage, Language, Schedule, Close } from '@mui/icons-material';

interface StatsData {
  summary: {
    totalAgents: number;
    totalChains: number;
    chains: Array<{
      chainId: number;
      chainName: string;
      agentCount: number;
    }>;
  };
  metadata: {
    chains: Array<{
      chainId: number;
      chainName: string;
      withMetadata: number;
      withoutMetadata: number;
      metadataPercentage: number;
    }>;
  };
  ens: {
    chains: Array<{
      chainId: number;
      chainName: string;
      withENS: number;
      withoutENS: number;
      ensPercentage: number;
    }>;
  };
  activity: {
    recent24h: Array<{
      chainId: number;
      chainName: string;
      recentCount: number;
    }>;
  };
  topAgents: Array<{
    chainId: number;
    chainName: string;
    agentId: string;
    agentName: string;
    ensName: string | null;
  }>;
}

interface StatsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function StatsPanel({ open, onClose }: StatsPanelProps) {
  const [stats, setStats] = React.useState<StatsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;

    const fetchStats = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/api/stats');
        if (!response.ok) {
          throw new Error('Failed to fetch stats');
        }
        const data = await response.json();
        setStats(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    // Refresh stats every 30 seconds when modal is open
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [open]);

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="lg" 
      fullWidth
      sx={{ '& .MuiDialog-paper': { maxHeight: '90vh' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" fontWeight={600}>
          Database Statistics
        </Typography>
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>
      
      <DialogContent sx={{ p: 3 }}>
        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} sx={{ mr: 2 }} />
            <Typography variant="body2" color="text.secondary">Loading statistics...</Typography>
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>Failed to load statistics: {error}</Alert>
        )}

        {stats && !loading && !error && (
          <>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Storage sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="body2" color="text.secondary">Total Agents</Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {stats.summary.totalAgents.toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <TrendingUp sx={{ mr: 1, color: 'secondary.main' }} />
                <Typography variant="body2" color="text.secondary">Active Chains</Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {stats.summary.totalChains}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Language sx={{ mr: 1, color: 'success.main' }} />
                <Typography variant="body2" color="text.secondary">With ENS</Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {stats.ens.chains.reduce((sum, chain) => sum + chain.withENS, 0).toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Schedule sx={{ mr: 1, color: 'warning.main' }} />
                <Typography variant="body2" color="text.secondary">Last 24h</Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {stats.activity.recent24h.reduce((sum, chain) => sum + chain.recentCount, 0).toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Chain Breakdown */}
      <Grid container spacing={2}>
        {stats.summary.chains.map((chain) => {
          const metadataStats = stats.metadata.chains.find(m => m.chainId === chain.chainId);
          const ensStats = stats.ens.chains.find(e => e.chainId === chain.chainId);
          const activityStats = stats.activity.recent24h.find(a => a.chainId === chain.chainId);

          return (
            <Grid item xs={12} md={6} key={chain.chainId}>
              <Card elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
                <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="h6" fontWeight={600}>
                      {chain.chainName}
                    </Typography>
                    <Chip 
                      label={`${chain.agentCount} agents`} 
                      size="small" 
                      color={chain.chainId === 11155111 ? 'primary' : chain.chainId === 84532 ? 'secondary' : 'default'}
                    />
                  </Box>
                  
                  <Box sx={{ mb: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Metadata: {metadataStats?.withMetadata || 0} / {chain.agentCount} 
                      ({metadataStats?.metadataPercentage || 0}%)
                    </Typography>
                  </Box>
                  
                  <Box sx={{ mb: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      ENS Names: {ensStats?.withENS || 0} / {chain.agentCount} 
                      ({ensStats?.ensPercentage || 0}%)
                    </Typography>
                  </Box>
                  
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Recent (24h): {activityStats?.recentCount || 0} new agents
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Top Agents */}
      {stats.topAgents.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            Recent Agents
          </Typography>
          <Grid container spacing={1}>
            {stats.topAgents.slice(0, 6).map((agent) => (
              <Grid item xs={12} sm={6} md={4} key={`${agent.chainId}-${agent.agentId}`}>
                <Card elevation={0} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider' }}>
                  <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        Agent #{agent.agentId}
                      </Typography>
                      <Chip 
                        label={agent.chainName} 
                        size="small" 
                        color={agent.chainId === 11155111 ? 'primary' : agent.chainId === 84532 ? 'secondary' : 'default'}
                        sx={{ fontSize: '0.7rem' }}
                      />
                    </Box>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {agent.agentName}
                    </Typography>
                    {agent.ensName && (
                      <Typography variant="caption" color="primary.main" noWrap>
                        {agent.ensName}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
