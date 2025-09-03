'use client';
import * as React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Stack, Typography } from '@mui/material';
import { useWeb3Auth } from './Web3AuthProvider';
import { createAgentAdapter } from '@/lib/agentAdapter';

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

      const [{ createPublicClient, http, custom, encodeFunctionData, keccak256, stringToHex, zeroAddress }, { sepolia }] = await Promise.all([
        import('viem'),
        import('viem/chains')
      ]);

      // 1) Create Agent AA (Hybrid) similar to indiv account abstraction
      const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
      const { createBundlerClient } = await import('permissionless');
      const { createPimlicoClient } = await import('permissionless/clients/pimlico');
      const { toMetaMaskSmartAccount, Implementation } = await import('permissionless/accounts');
      const { createWalletClient } = await import('viem');

      // Signatory based on current EOA
      const signatory = { walletClient: createWalletClient({ chain: sepolia, transport: custom(provider as any) }) } as any;
      const salt: `0x${string}` = keccak256(stringToHex(domainLower)) as `0x${string}`;
      const agentAccountClient = await toMetaMaskSmartAccount({
        client: publicClient,
        implementation: Implementation.Hybrid,
        deployParams: [signatory!.walletClient!.account!.address, [], [], []],
        signatory: { walletClient: signatory!.walletClient! },
        deploySalt: salt,
      } as any);
      const agentAddress = await agentAccountClient.getAddress();

      // Ensure Agent AA is deployed
      const deployed = await agentAccountClient.isDeployed();
      if (!deployed) {
        if (!bundlerUrl) throw new Error('Missing NEXT_PUBLIC_BUNDLER_URL for deployment');
        const pimlicoClient = createPimlicoClient({ transport: http(bundlerUrl) } as any);
        const bundlerClient = createBundlerClient({
          transport: http(bundlerUrl),
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

      // 2+3) Call IdentityRegistry.registerByDomain via AA + paymaster
      if (!bundlerUrl) throw new Error('Missing NEXT_PUBLIC_BUNDLER_URL for newAgent');
      const bundlerClient = createBundlerClient({
        transport: http(bundlerUrl),
        paymaster: true,
        chain: sepolia,
        paymasterContext: { mode: 'SPONSORED' },
      } as any);
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


