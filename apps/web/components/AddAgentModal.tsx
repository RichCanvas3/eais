'use client';
import * as React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Stack, Typography } from '@mui/material';
import { useWeb3Auth } from './Web3AuthProvider';
import { createAgentAdapter, ensureIdentityWithAA } from '@/lib/agentAdapter';
import { createPublicClient, http, custom, encodeFunctionData, keccak256, stringToHex, zeroAddress, createWalletClient, type Address } from 'viem';
import { sepolia } from 'viem/chains';
import { createBundlerClient } from 'viem/account-abstraction';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { toMetaMaskSmartAccount, Implementation } from '@metamask/delegation-toolkit';
import { identityRegistryAbi } from '@/lib/abi/identityRegistry';

type Props = {
  open: boolean;
  onClose: () => void;
  registryAddress: `0x${string}`;
  rpcUrl: string;
};

export function AddAgentModal({ open, onClose, registryAddress, rpcUrl }: Props) {
  const { provider, address } = useWeb3Auth();
  const [domain, setDomain] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const adapter = React.useMemo(() => createAgentAdapter({ registryAddress, rpcUrl }), [registryAddress, rpcUrl]);

  async function handleSubmit(e: React.FormEvent) {

    console.log('********************* handleSubmit', e);
    e.preventDefault();
    if (!provider) { setError('Please login first'); return; }
    if (!domain.trim()) { setError('Domain is required'); return; }
    setError(null);
    setIsSubmitting(true);
    try {
      const bundlerUrl = (process.env.NEXT_PUBLIC_BUNDLER_URL as string) || '';
      const domainLower = domain.trim().toLowerCase();

      // 0) Early exit if agent already exists for this domain
      try {
        const existing = await adapter.resolveByDomain(domainLower);
        if (existing && existing.agentAddress) {
          setIsSubmitting(false);
          setError('Agent already exists for this domain');
          return;
        }
      } catch {}

      // 1) Create Agent AA (Hybrid) similar to indiv account abstraction
      const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });

      // Owner/signatory based on current EOA from Web3Auth
      if (!address) { throw new Error('No EOA address from Web3Auth'); }
      const owner = address as Address;
      const signatory = { walletClient: createWalletClient({ chain: sepolia as any, transport: custom(provider as any), account: owner }) } as any;
      // Ensure viem client has a default account for signing (toolkit calls signTypedData without passing account)
      try { (signatory.walletClient as any).account = owner; } catch {}
      const salt: `0x${string}` = keccak256(stringToHex(domainLower)) as `0x${string}`;

      console.log('********************* toMetaMaskSmartAccount: ', address, salt);
      const agentAccountClient = await toMetaMaskSmartAccount({
        client: publicClient,
        implementation: Implementation.Hybrid,
        deployParams: [owner, [], [], []],
        signatory: signatory,
        deploySalt: salt,
      });

      const agentAddress = await agentAccountClient.getAddress();
      console.log('********************* agentAddress', agentAddress);

      // Ensure Agent AA is deployed (sponsored via Pimlico)
      console.info("ensure agent account client is deployed");
      const deployed = await agentAccountClient.isDeployed();
      if (!deployed) {
        const BUNDLER_URL = (process.env.NEXT_PUBLIC_BUNDLER_URL as string) || '';
        if (!BUNDLER_URL) throw new Error('Missing BUNDLER_URL for deployment');
        const pimlicoClient = createPimlicoClient({ transport: http(BUNDLER_URL) } as any);
        const bundlerClient = createBundlerClient({
          transport: http(BUNDLER_URL),
          paymaster: true,
          chain: sepolia,
          paymasterContext: { mode: 'SPONSORED' },
        } as any);
        const { fast: fee } = await (pimlicoClient as any).getUserOperationGasPrice();
        const userOperationHash = await (bundlerClient as any).sendUserOperation({
          account: agentAccountClient,
          calls: [{ to: zeroAddress }],
          ...fee,
        });
        await (bundlerClient as any).waitForUserOperationReceipt({ hash: userOperationHash });
      }
      console.log('********************* deployed', deployed);

      const BUNDLER_URL = (process.env.NEXT_PUBLIC_BUNDLER_URL as string) || '';

      console.log('********************* ensureIdentityWithAA');
      await ensureIdentityWithAA({
        publicClient,
        bundlerUrl: BUNDLER_URL,
        chain: sepolia,
        registry: registryAddress,
        domain: domain.trim().toLowerCase(),
        agentAccount: agentAccountClient,
      })

      /*
      // 2+3) Call IdentityRegistry.registerByDomain via AA + paymaster
      if (!bundlerUrl) throw new Error('Missing NEXT_PUBLIC_BUNDLER_URL for newAgent');
      const bundlerClient = createBundlerClient({ transport: http(bundlerUrl), chain: sepolia } as any);
      const data = encodeFunctionData({
        abi: (await import('@/lib/abi/identityRegistry')).identityRegistryAbi as any,
        functionName: 'registerByDomain',
        args: [domainLower, agentAddress],
      });
      const userOperationHash = await (bundlerClient as any).sendUserOperation({
        account: agentAccountClient,
        calls: [{ to: registryAddress, data }],
      });
      await (bundlerClient as any).waitForUserOperationReceipt({ hash: userOperationHash });
      */

      setIsSubmitting(false);
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err?.message ?? 'Failed to submit');
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Create new Agent</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">Connected EOA: {address ?? 'Not connected'}</Typography>
          <TextField label="Domain" placeholder="example.com or acme.eth" value={domain} onChange={(e) => setDomain(e.target.value)} fullWidth autoFocus />
          {error && <Typography variant="body2" color="error">{error}</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" disableElevation disabled={isSubmitting || !provider}>Create</Button>
      </DialogActions>
    </Dialog>
  );
}


