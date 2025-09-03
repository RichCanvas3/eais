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
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [homepage, setHomepage] = React.useState('');
  const [trustModels, setTrustModels] = React.useState<string>('feedback');
  const [url, setUrl] = React.useState('');
  const [version, setVersion] = React.useState('1.0.0');
  const [preferredTransport, setPreferredTransport] = React.useState('JSONRPC');
  const [protocolVersion, setProtocolVersion] = React.useState('0.3.0');
  const [capPush, setCapPush] = React.useState(true);
  const [capStream, setCapStream] = React.useState(true);
  const [defaultInputModes, setDefaultInputModes] = React.useState('text,text/plain');
  const [defaultOutputModes, setDefaultOutputModes] = React.useState('text,text/plain');
  const [skillId, setSkillId] = React.useState('finder');
  const [skillName, setSkillName] = React.useState('Find accommodation');
  const [skillDesc, setSkillDesc] = React.useState('Helps with searching listings');
  const [skillTags, setSkillTags] = React.useState('airbnb search');
  const [skillExamples, setSkillExamples] = React.useState('Find a room in LA, CA, Apr 15–18, 2 adults');

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
      // Save initial agent_card fields server-side
      try {
        await fetch('/api/agent-cards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain: domainLower,
            card: {
              name: name || undefined,
              description: description || undefined,
              url: url || undefined,
              version: version || undefined,
              preferredTransport: preferredTransport || undefined,
              protocolVersion: protocolVersion || undefined,
              homepage: homepage || undefined,
              trustModels: trustModels.split(',').map((x) => x.trim()).filter(Boolean),
              capabilities: { pushNotifications: !!capPush, streaming: !!capStream },
              defaultInputModes: defaultInputModes.split(',').map((x) => x.trim()).filter(Boolean),
              defaultOutputModes: defaultOutputModes.split(',').map((x) => x.trim()).filter(Boolean),
              skills: [
                {
                  id: skillId || undefined,
                  name: skillName || undefined,
                  description: skillDesc || undefined,
                  tags: skillTags.split(',').map((x) => x.trim()).filter(Boolean),
                  examples: skillExamples.split('\n').join(',').split(',').map((x) => x.trim()).filter(Boolean),
                }
              ],
            }
          }),
        });
      } catch {}

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
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
          <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth />
          <TextField label="URL" value={url} onChange={(e) => setUrl(e.target.value)} fullWidth />
          <TextField label="Version" value={version} onChange={(e) => setVersion(e.target.value)} fullWidth />
          <TextField label="Preferred Transport" value={preferredTransport} onChange={(e) => setPreferredTransport(e.target.value)} fullWidth />
          <TextField label="Protocol Version" value={protocolVersion} onChange={(e) => setProtocolVersion(e.target.value)} fullWidth />
          <TextField label="Homepage" value={homepage} onChange={(e) => setHomepage(e.target.value)} fullWidth />
          <TextField label="Trust Models (comma-separated)" value={trustModels} onChange={(e) => setTrustModels(e.target.value)} fullWidth />
          <TextField label="Default Input Modes (comma-separated)" value={defaultInputModes} onChange={(e) => setDefaultInputModes(e.target.value)} fullWidth />
          <TextField label="Default Output Modes (comma-separated)" value={defaultOutputModes} onChange={(e) => setDefaultOutputModes(e.target.value)} fullWidth />
          <TextField label="Skill Id" value={skillId} onChange={(e) => setSkillId(e.target.value)} fullWidth />
          <TextField label="Skill Name" value={skillName} onChange={(e) => setSkillName(e.target.value)} fullWidth />
          <TextField label="Skill Description" value={skillDesc} onChange={(e) => setSkillDesc(e.target.value)} fullWidth />
          <TextField label="Skill Tags (comma-separated)" value={skillTags} onChange={(e) => setSkillTags(e.target.value)} fullWidth />
          <TextField label="Skill Examples (comma or newline separated)" value={skillExamples} onChange={(e) => setSkillExamples(e.target.value)} fullWidth multiline minRows={2} />
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


