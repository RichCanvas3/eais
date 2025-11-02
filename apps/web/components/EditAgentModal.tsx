'use client';
import * as React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Stack, Typography, CircularProgress } from '@mui/material';
import { useWeb3Auth } from './Web3AuthProvider';
import { createPublicClient, http, custom, createWalletClient } from 'viem';
import { toMetaMaskSmartAccount, Implementation } from '@metamask/delegation-toolkit';
import { createBundlerClient } from 'viem/account-abstraction';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { useAgentENSClientFor } from './AIAgentENSClientsProvider';
import { useAgentIdentityClientFor } from './AIAgentIdentityClientsProvider';
import { getRpcUrl, getViemChain, getBundlerUrl, getChainIdHex, getChainConfig } from '../config/chains';

export type Agent = {
	chainId: number;
	agentId: string;
	agentAddress: string;
	agentName: string;
	owner?: string;
	metadataURI?: string | null;
	createdAtBlock: number;
	createdAtTime: number;
  description?: string | null;
  a2aEndpoint?: string | null;
  ensEndpoint?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  agent: Agent | null;
};

export function EditAgentModal({ open, onClose, agent }: Props) {
  const { provider, address: eoa } = useWeb3Auth();
  const [description, setDescription] = React.useState('');
  const [url, setUrl] = React.useState('');
  const [image, setImage] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Get chain-specific clients
  const chainIdHex = agent ? getChainIdHex(agent.chainId) : null;
  const agentENSClientForChain = useAgentENSClientFor(chainIdHex || '0xaa36a7');
  const agentIdentityClientForChain = useAgentIdentityClientFor(chainIdHex || '0xaa36a7');

  // Load current values from ENS when modal opens
  React.useEffect(() => {
    if (open && agent && agentENSClientForChain) {
      setLoading(true);
      setError(null);
      
      const loadEnsValues = async () => {
        try {
          const ensName = agent.ensEndpoint;
          if (!ensName) {
            setError('No ENS name found for this agent');
            setLoading(false);
            return;
          }

          // Fetch current values from ENS text records
          const currentUrl = await agentENSClientForChain.getAgentUrlByName(ensName);
          const currentImage = await agentENSClientForChain.getAgentImageByName(ensName);
          const currentDescription = await agentENSClientForChain.getAgentDescriptionByName(ensName);
          
          setDescription(currentDescription || agent.description || '');
          setUrl(currentUrl || '');
          setImage(currentImage || '');
        } catch (e: any) {
          setError(e?.message || 'Failed to load agent data');
        } finally {
          setLoading(false);
        }
      };

      loadEnsValues();
    }
  }, [open, agent, agentENSClientForChain]);

  // Reset form when modal closes
  React.useEffect(() => {
    if (!open) {
      setDescription('');
      setUrl('');
      setImage('');
      setError(null);
      setLoading(false);
      setSaving(false);
    }
  }, [open]);

  const handleSave = async () => {
    if (!agent || !provider || !eoa || !agentENSClientForChain) {
      setError('Missing required data');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const ensName = agent.ensEndpoint;
      if (!ensName) {
        throw new Error('No ENS name found for this agent');
      }

      // Get chain-specific configuration
      const agentChainId = agent.chainId;
      const rpcUrl = getRpcUrl(agentChainId);
      const chain = getViemChain(agentChainId);
      const bundlerUrl = getBundlerUrl(agentChainId);
      
      if (!rpcUrl || !chain || !bundlerUrl) {
        throw new Error(`Missing configuration for chain ${agentChainId}`);
      }

      // Switch wallet to the agent's chain
      const chainIdHex = getChainIdHex(agentChainId);
      const web3AuthProvider = provider as any;
      const eip1193 = web3AuthProvider;
      
      try {
        await eip1193.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: chainIdHex }]
        });
      } catch (switchError: any) {
        // If the chain doesn't exist (code 4902), try to add it
        if (switchError.code === 4902) {
          const chainConfig = getChainConfig(agentChainId);
          await eip1193.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: chainIdHex,
              chainName: chainConfig?.chainName || `Chain ${agentChainId}`,
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: [rpcUrl]
            }]
          });
        } else {
          throw switchError;
        }
      }
      
      // Add delay to allow wallet to adapt to chain switch
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Build agent account client for AA
      const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
      const walletClient = createWalletClient({ 
        chain: chain as any, 
        transport: custom(provider as any), 
        account: eoa as `0x${string}` 
      });
      
      const agentAccountClient = await toMetaMaskSmartAccount({
        address: agent.agentAddress as `0x${string}`,
        client: publicClient,
        implementation: Implementation.Hybrid,
        signatory: { walletClient },
      });

      // Prepare calls for each field
      const allCalls: { to: `0x${string}`; data: `0x${string}` }[] = [];

      if (description) {
        const { calls } = await agentENSClientForChain.prepareSetNameDescriptionCalls(ensName, description);
        allCalls.push(...calls);
      }

      if (url) {
        const { calls } = await agentENSClientForChain.prepareSetNameUriCalls(ensName, url);
        allCalls.push(...calls);
      }

      if (image) {
        const { calls } = await agentENSClientForChain.prepareSetNameImageCalls(ensName, image);
        allCalls.push(...calls);
      }

      if (allCalls.length === 0) {
        setError('No changes to save');
        setSaving(false);
        return;
      }

      // Execute calls via bundler
      const pimlicoClient = createPimlicoClient({ transport: http(bundlerUrl) });
      const bundlerClient = createBundlerClient({
        transport: http(bundlerUrl),
        paymaster: true as any,
        chain: chain as any,
        paymasterContext: { mode: 'SPONSORED' },
      } as any);

      const { fast: fee } = await pimlicoClient.getUserOperationGasPrice();

      const userOpHash = await bundlerClient.sendUserOperation({
        account: agentAccountClient as any,
        calls: allCalls,
        ...fee,
      });

      await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash });

      // Close modal on success
      onClose();
    } catch (e: any) {
      console.error('Error updating agent:', e);
      setError(e?.message || 'Failed to update agent');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Edit Agent</DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Stack spacing={2} alignItems="center" sx={{ py: 3 }}>
            <CircularProgress size={40} />
            <Typography variant="body2" color="text.secondary">
              Loading agent data...
            </Typography>
          </Stack>
        ) : (
          <Stack spacing={3} sx={{ pt: 2 }}>
            {error && (
              <Typography variant="body2" color="error">
                {error}
              </Typography>
            )}

            <TextField
              label="Description"
              fullWidth
              multiline
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter agent description"
              helperText="Description stored in ENS 'description' text record"
            />

            <TextField
              label="URL"
              fullWidth
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              helperText="URL stored in ENS 'url' text record"
            />

            <TextField
              label="Image URL"
              fullWidth
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="https://example.com/image.png"
              helperText="Image URL stored in ENS 'avatar' text record"
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          disabled={saving || loading || (!description && !url && !image)}
          sx={{
            backgroundColor: 'rgb(31, 136, 61)',
            color: '#ffffff',
            '&:hover': {
              backgroundColor: 'rgb(26, 115, 51)',
            },
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

