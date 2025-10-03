'use client';
import * as React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Stack, Typography } from '@mui/material';
import { useWeb3Auth } from './Web3AuthProvider';
import { createAgentAdapter, ensureIdentityWithAA } from '@/lib/agentAdapter';
import { createPublicClient, http, custom, encodeFunctionData, keccak256, stringToHex, zeroAddress, createWalletClient, namehash, type Address } from 'viem';
import PublicResolverABI from '../abis/PublicResolver.json';
import { sepolia } from 'viem/chains';
import { createBundlerClient } from 'viem/account-abstraction';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { toMetaMaskSmartAccount, Implementation } from '@metamask/delegation-toolkit';
import ensService from '@/service/ensService';
import IpfsService from '@/service/ipfsService';


import { privateKeyToAccount } from 'viem/accounts';


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
  const [ensPreview, setEnsPreview] = React.useState('');
  const [ensResolvedAddress, setEnsResolvedAddress] = React.useState<string | null>(null);
  const [ensResolving, setEnsResolving] = React.useState(false);
  const [ensExists, setEnsExists] = React.useState<boolean | null>(null);
  const [agentAAIsContract, setAgentAAIsContract] = React.useState<boolean | null>(null);
  const [agentAAOwnerEoa, setAgentAAOwnerEoa] = React.useState<string | null>(null);
  const [agentAAOwnerEns, setAgentAAOwnerEns] = React.useState<string | null>(null);
  const [agentResolver, setAgentResolver] = React.useState<`0x${string}` | null>(null);
  const [agentUrlText, setAgentUrlText] = React.useState<string | null>(null);
  const [agentUrlLoading, setAgentUrlLoading] = React.useState(false);
  const [agentUrlError, setAgentUrlError] = React.useState<string | null>(null);
  const [agentUrlEdit, setAgentUrlEdit] = React.useState('');
  const [agentUrlSaving, setAgentUrlSaving] = React.useState(false);
  const [agentIdentityExists, setAgentIdentityExists] = React.useState<boolean | null>(null);
  const [domainStatus, setDomainStatus] = React.useState<{
    exists: boolean;
    isWrapped: boolean;
    registrationMethod?: string;
    baseRegistrarOwner?: string;
    ensRegistryOwner?: string;
    nameWrapperOwner?: string;
  } | null>(null);
  const [domainStatusLoading, setDomainStatusLoading] = React.useState(false);
  const [domainStatusError, setDomainStatusError] = React.useState<string | null>(null);
  const [domainOwnerAddress, setDomainOwnerAddress] = React.useState<string | null>(null);
  const [domainOwnerIsContract, setDomainOwnerIsContract] = React.useState<boolean | null>(null);
  const [domainOwnerEns, setDomainOwnerEns] = React.useState<string | null>(null);
  const [domainOwnerEoa, setDomainOwnerEoa] = React.useState<string | null>(null);
  const [domainOwnerEoaEns, setDomainOwnerEoaEns] = React.useState<string | null>(null);
  const [domainResolver, setDomainResolver] = React.useState<`0x${string}` | null>(null);
  const [domainUrlText, setDomainUrlText] = React.useState<string | null>(null);
  const [domainUrlLoading, setDomainUrlLoading] = React.useState(false);
  const [domainUrlError, setDomainUrlError] = React.useState<string | null>(null);
  const [domainUrlEdit, setDomainUrlEdit] = React.useState('');
  const [domainUrlSaving, setDomainUrlSaving] = React.useState(false);


  const adapter = React.useMemo(() => createAgentAdapter({ registryAddress, rpcUrl }), [registryAddress, rpcUrl]);

  function cleanAgentLabel(label: string) {
    return label.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
  }

  function cleanBaseDomain(dom: string) {
    const base = dom.trim().toLowerCase().replace(/^ens:\s*/i, '').replace(/\.eth$/i, '');
    return base.replace(/[^a-z0-9-]/g, '');
  }

  React.useEffect(() => {
    const label = cleanAgentLabel(name);
    const base = cleanBaseDomain(domain);
    if (label && base) {
      const full = `${label}.${base}.eth`;
      setEnsPreview(full);
      let cancelled = false;
      (async () => {
        try {
          setEnsResolving(true);
          const addr = await ensService.getEnsAddress(full, sepolia);
          if (!cancelled) setEnsResolvedAddress(addr);
          // Also check Registry ownership to determine if the name exists even without an addr record
          const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
          const ENS_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_ENS_REGISTRY as `0x${string}`) || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
          try {
            const owner = await publicClient.readContract({
              address: ENS_REGISTRY_ADDRESS,
              abi: [{ name: 'owner', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }], outputs: [{ name: '', type: 'address' }] }],
              functionName: 'owner',
              args: [namehash(full)],
            });
            if (!cancelled) setEnsExists(!!owner && owner !== '0x0000000000000000000000000000000000000000');
          } catch {
            if (!cancelled) setEnsExists(null);
          }
        } catch {
          if (!cancelled) setEnsResolvedAddress(null);
          if (!cancelled) setEnsExists(null);
        } finally {
          if (!cancelled) setEnsResolving(false);
        }
      })();
      return () => { cancelled = true; };
    } else {
      setEnsPreview('');
      setEnsResolvedAddress(null);
      setEnsResolving(false);
      setEnsExists(null);
      setAgentAAIsContract(null);
      setAgentAAOwnerEoa(null);
      setAgentAAOwnerEns(null);
      setAgentResolver(null);
      setAgentUrlText(null);
      setAgentUrlLoading(false);
      setAgentUrlError(null);
      setAgentUrlEdit('');
    }
  }, [name, domain]);

  // Check if the derived Agent Identity already exists (disable Create if true)
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setAgentIdentityExists(null);
        if (!ensPreview || !provider || !address) return;
        const ensPreviewLower = ensPreview.trim().toLowerCase();
        const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
        const walletClient = createWalletClient({ chain: sepolia as any, transport: custom(provider as any), account: address as Address });
        try { (walletClient as any).account = address as Address; } catch {}
        const salt: `0x${string}` = keccak256(stringToHex(ensPreviewLower)) as `0x${string}`;
        const agentAccountClient = await toMetaMaskSmartAccount({
          client: publicClient,
          implementation: Implementation.Hybrid,
          deployParams: [address as `0x${string}`, [], [], []],
          signatory: { walletClient },
          deploySalt: salt,
        } as any);
        const agentAddress = await agentAccountClient.getAddress();
        const existing = await IpfsService.getAgentByAddress(agentAddress);
        if (!cancelled) setAgentIdentityExists(!!existing);
      } catch {
        if (!cancelled) setAgentIdentityExists(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ensPreview, provider, address, rpcUrl]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setAgentAAIsContract(null);
        setAgentAAOwnerEoa(null);
        setAgentAAOwnerEns(null);
        if (!ensResolvedAddress) return;
        const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
        const code = await publicClient.getBytecode({ address: ensResolvedAddress as `0x${string}` });
        if (!cancelled) setAgentAAIsContract(!!code);
        if (!code) return;
        let controller: string | null = null;
        // Try Ownable.owner()
        try {
          const eoa = await publicClient.readContract({
            address: ensResolvedAddress as `0x${string}`,
            abi: [{ name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }],
            functionName: 'owner',
          });
          controller = eoa as string;
        } catch {}
        // Try getOwner()
        if (!controller) {
          try {
            const eoa = await publicClient.readContract({
              address: ensResolvedAddress as `0x${string}`,
              abi: [{ name: 'getOwner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }],
              functionName: 'getOwner',
            });
            controller = eoa as string;
          } catch {}
        }
        // Try owners() -> address[] and take first
        if (!controller) {
          try {
            const eoas = await publicClient.readContract({
              address: ensResolvedAddress as `0x${string}`,
              abi: [{ name: 'owners', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address[]' }] }],
              functionName: 'owners',
            });
            if (Array.isArray(eoas) && eoas.length > 0) controller = eoas[0] as string;
          } catch {}
        }
        if (!cancelled) setAgentAAOwnerEoa(controller);
        if (controller) {
          try {
            const reverse = await ensService.getEnsName(controller, sepolia);
            if (!cancelled) setAgentAAOwnerEns(reverse);
          } catch {}
        }
      } catch {
        if (!cancelled) {
          setAgentAAIsContract(null);
          setAgentAAOwnerEoa(null);
          setAgentAAOwnerEns(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [ensResolvedAddress, rpcUrl]);

  // Load agent ENS URL text record if the preview exists
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setAgentUrlError(null);
        setAgentResolver(null);
        setAgentUrlText(null);
        setAgentUrlEdit('');
        if (!ensPreview) return;
        // Get resolver and url text for agent ENS
        setAgentUrlLoading(true);
        const normalized = await ensService.getTextRecord(ensPreview, 'url', sepolia, rpcUrl);
        if (!cancelled) {
          setAgentUrlText(normalized);
          setAgentUrlEdit(normalized ?? '');
        }
        // Also cache resolver for save path
        try {
          const node = namehash(ensPreview) as `0x${string}`;
          const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
          const ENS_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_ENS_REGISTRY as `0x${string}`) || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
          const resolverAddr = await publicClient.readContract({
            address: ENS_REGISTRY_ADDRESS,
            abi: [{ name: 'resolver', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }], outputs: [{ name: '', type: 'address' }] }],
            functionName: 'resolver',
            args: [node]
          }) as `0x${string}`;
          if (!cancelled) setAgentResolver(resolverAddr && resolverAddr !== '0x0000000000000000000000000000000000000000' ? resolverAddr : null);
        } catch (e: any) {
          if (!cancelled) setAgentResolver(null);
        }
      } catch (e: any) {
        if (!cancelled) setAgentUrlError(e?.message ?? 'Failed to read agent url');
      } finally {
        if (!cancelled) setAgentUrlLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ensPreview, rpcUrl]);

  // Prefill Agent URL when agent ENS doesn't exist, using domain URL text + agent name
  React.useEffect(() => {
    if (ensExists === false) {
      const label = cleanAgentLabel(name);
      const base = (domainUrlText ?? '').replace(/\/$/, '');
      const suggested = base && label ? `${base}/${label}` : '';
      if (!agentUrlEdit) {
        setAgentUrlEdit(suggested);
      }
    }
  }, [ensExists, domainUrlText, name]);

  // Also prefill when agent ENS exists but has no URL text record
  React.useEffect(() => {
    if (ensExists === true && !agentUrlText) {
      const label = cleanAgentLabel(name);
      const base = (domainUrlText ?? '').replace(/\/$/, '');
      const suggested = base && label ? `${base}/${label}` : '';
      if (!agentUrlEdit && suggested) {
        setAgentUrlEdit(suggested);
      }
    }
  }, [ensExists, agentUrlText, domainUrlText, name]);

  React.useEffect(() => {
    const base = cleanBaseDomain(domain);
    if (!base) {
      setDomainStatus(null);
      setDomainStatusLoading(false);
      setDomainStatusError(null);
      setDomainOwnerAddress(null);
      setDomainOwnerIsContract(null);
      setDomainOwnerEns(null);
      setDomainOwnerEoa(null);
      setDomainOwnerEoaEns(null);
      setDomainResolver(null);
      setDomainUrlText(null);
      setDomainUrlLoading(false);
      setDomainUrlError(null);
      setDomainUrlEdit('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setDomainStatusLoading(true);
        setDomainStatusError(null);
        const status = await ensService.checkEnsNameStatus(base, sepolia);
        if (!cancelled) setDomainStatus(status);

        // derive owner
        let owner: string | null = null;
        if (status) {
          owner = status.isWrapped
            ? (status.nameWrapperOwner || status.ensRegistryOwner || null)
            : (status.baseRegistrarOwner || status.ensRegistryOwner || null);
        }
        if (!cancelled) setDomainOwnerAddress(owner);

        if (owner) {
          try {
            const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
            const code = await publicClient.getBytecode({ address: owner as `0x${string}` });
            if (!cancelled) setDomainOwnerIsContract(!!code);
          } catch {
            if (!cancelled) setDomainOwnerIsContract(null);
          }
          try {
            const reverse = await ensService.getEnsName(owner, sepolia);
            if (!cancelled) setDomainOwnerEns(reverse);
          } catch {
            if (!cancelled) setDomainOwnerEns(null);
          }

          // Read resolver & URL text record (via service for normalization)
          try {
            const baseName = base + '.eth';
            const node = namehash(baseName);
            const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
            const ENS_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_ENS_REGISTRY as `0x${string}`) || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
            const resolverAddr = await publicClient.readContract({
              address: ENS_REGISTRY_ADDRESS,
              abi: [{ name: 'resolver', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }], outputs: [{ name: '', type: 'address' }] }],
              functionName: 'resolver',
              args: [node],
            }) as `0x${string}`;
            if (!cancelled) setDomainResolver(resolverAddr && resolverAddr !== '0x0000000000000000000000000000000000000000' ? resolverAddr : null);
            if (resolverAddr && resolverAddr !== '0x0000000000000000000000000000000000000000') {
              setDomainUrlLoading(true);
              setDomainUrlError(null);
              try {
                const normalized = await ensService.getTextRecord(base, 'url', sepolia, rpcUrl);
                if (!cancelled) {
                  setDomainUrlText(normalized);
                  setDomainUrlEdit(normalized ?? '');
                }
              } catch (e: any) {
                if (!cancelled) {
                  setDomainUrlText(null);
                  setDomainUrlEdit('');
                  setDomainUrlError(e?.message ?? 'Failed to read url');
                }
              } finally {
                if (!cancelled) setDomainUrlLoading(false);
              }
            } else {
              if (!cancelled) {
                setDomainUrlText(null);
                setDomainUrlEdit('');
              }
            }
          } catch (e: any) {
            if (!cancelled) {
              setDomainResolver(null);
              setDomainUrlText(null);
              setDomainUrlEdit('');
              setDomainUrlError(e?.message ?? 'Failed to read resolver');
            }
          }

          // If AA (contract), attempt to find controlling EOA via common owner functions
          try {
            const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
            let controller: string | null = null;
            const ownerCode = await publicClient.getBytecode({ address: owner as `0x${string}` });
            if (!!ownerCode) {
              // Try Ownable.owner()
              try {
                const eoa = await publicClient.readContract({
                  address: owner as `0x${string}`,
                  abi: [{ name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }],
                  functionName: 'owner',
                });
                controller = eoa as string;
              } catch {}
              // Try getOwner()
              if (!controller) {
                try {
                  const eoa = await publicClient.readContract({
                    address: owner as `0x${string}`,
                    abi: [{ name: 'getOwner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }],
                    functionName: 'getOwner',
                  });
                  controller = eoa as string;
                } catch {}
              }
              // Try owners() -> address[] and take first
              if (!controller) {
                try {
                  const eoas = await publicClient.readContract({
                    address: owner as `0x${string}`,
                    abi: [{ name: 'owners', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address[]' }] }],
                    functionName: 'owners',
                  });
                  if (Array.isArray(eoas) && eoas.length > 0) controller = eoas[0] as string;
                } catch {}
              }
            } else {
              // Owner is an EOA; treat it as controller
              controller = owner;
            }
            if (!cancelled) setDomainOwnerEoa(controller);
            if (controller) {
              try {
                const reverse = await ensService.getEnsName(controller, sepolia);
                if (!cancelled) setDomainOwnerEoaEns(reverse);
              } catch {
                if (!cancelled) setDomainOwnerEoaEns(null);
              }
            } else {
              if (!cancelled) setDomainOwnerEoaEns(null);
            }
          } catch {
            if (!cancelled) {
              setDomainOwnerEoa(null);
              setDomainOwnerEoaEns(null);
            }
          }
        } else {
          if (!cancelled) {
            setDomainOwnerIsContract(null);
            setDomainOwnerEns(null);
            setDomainOwnerEoa(null);
            setDomainOwnerEoaEns(null);
            setDomainResolver(null);
            setDomainUrlText(null);
            setDomainUrlEdit('');
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          setDomainStatus(null);
          setDomainStatusError(e?.message ?? 'Failed to check domain');
          setDomainOwnerAddress(null);
          setDomainOwnerIsContract(null);
          setDomainOwnerEns(null);
          setDomainOwnerEoa(null);
          setDomainOwnerEoaEns(null);
          setDomainResolver(null);
          setDomainUrlText(null);
          setDomainUrlEdit('');
        }
      } finally {
        if (!cancelled) setDomainStatusLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [domain]);

  async function handleSubmit(e: React.FormEvent) {

    console.log('********************* handleSubmit', e);
    e.preventDefault();
    if (!provider) { setError('Please login first'); return; }
    if (!ensPreview.trim()) { setError('agent name is required'); return; }
    setError(null);
    setIsSubmitting(true);
    try {
      const bundlerUrl = (process.env.NEXT_PUBLIC_BUNDLER_URL as string) || '';
      const ensPreviewLower = ensPreview.trim().toLowerCase();

      console.log('********************* ensPreviewLower', ensPreviewLower);

      // 0) Early exit if agent already exists for this ensPreviewLower
      try {
        const existing = await adapter.resolveByDomain(ensPreviewLower);
        if (existing && existing.agentAddress) {
          setIsSubmitting(false);
          setError('Agent already exists for this name ' + ensPreviewLower);
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
      const salt: `0x${string}` = keccak256(stringToHex(ensPreviewLower)) as `0x${string}`;

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

      // Check if an agent already exists for this AA address via backend DB
      try {
        const existingAgent = await IpfsService.getAgentByAddress(agentAddress);
        if (existingAgent) {
          setIsSubmitting(false);
          setError(`Agent already exists for address ${agentAddress} (id ${existingAgent.agentId})`);
          return;
        }
      } catch {}

      const BUNDLER_URL = (process.env.NEXT_PUBLIC_BUNDLER_URL as string) || '';

      // Build ERC-8004 registration metadata and upload to IPFS to get tokenUri
      let tokenUri = '';
      try {
        const baseDomainUrl = domainUrlText || '';
        const cleanBase = baseDomainUrl.replace(/\/$/, '');
        const label = cleanAgentLabel(name);
        const a2aEndpoint = cleanBase && label ? `${cleanBase}/${label}/.well-known/agent-card.json` : `${cleanBase}/.well-known/agent-card.json`;
        const endpoints: any[] = [];
        if (a2aEndpoint) endpoints.push({ name: 'A2A', endpoint: a2aEndpoint, version: '0.3.0' });
        if (ensPreviewLower) endpoints.push({ name: 'ENS', endpoint: ensPreviewLower, version: 'v1' });
        endpoints.push({ name: 'agentWallet', endpoint: `eip155:11155111:${agentAddress}`, version: 'v1' });

        const metadata = {
          type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
          name: name || ensPreviewLower,
          description: description || '',
          image: null,
          endpoints,
          registrations: [],
          supportedTrust: ['reputation', 'crypto-economic', 'tee-attestation']
        } as any;

        const upload = await IpfsService.uploadJson({ data: metadata, filename: `agent_${ensPreviewLower}.json` });
        tokenUri = upload.url;
      } catch (e) {
        console.warn('IPFS upload failed, proceeding without tokenUri', e);
      }

      console.log('********************* ensureIdentityWithAA: tokenUri: ', tokenUri);



      // wallet for Identity Registry Contract Owner
      //const { ethers } = await import('ethers');
      //const ethersProvider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL);
      //const identityRegistryOwnerWallet = new ethers.Wallet(process.env.NEXT_PUBLIC_IR_PRIVATE_KEY as string, ethersProvider);

      const ownerAccount = privateKeyToAccount(process.env.NEXT_PUBLIC_IR_PRIVATE_KEY as `0x${string}`);
      const identityRegistryOwnerWallet = createWalletClient({
        chain: sepolia,
        transport: http(process.env.NEXT_PUBLIC_RPC_URL),
        account: ownerAccount,
      });

      console.info('********************* identityRegistryOwnerWallet: ', identityRegistryOwnerWallet);
      await ensureIdentityWithAA({
        publicClient,
        bundlerUrl: BUNDLER_URL,
        chain: sepolia,
        identityRegistryOwnerWallet: identityRegistryOwnerWallet,
        registry: registryAddress,
        agentAccount: agentAccountClient,
        tokenUri: tokenUri,
      })


      setIsSubmitting(false);
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err?.message ?? 'Failed to submit');
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        Create new Agent
        <Typography variant="caption" color="text.secondary" display="block">
          Connected EOA: {address ?? 'Not connected'}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Domain" placeholder="airbnb.eth" value={domain} onChange={(e) => setDomain(e.target.value)} fullWidth autoFocus />
          <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 5 }}>
            {domain ? (
              domainStatusLoading ? 'Domain: checking…' : domainStatusError ? `Domain: error — ${domainStatusError}` : domainStatus?.exists ? (
                (() => {
                  const base = cleanBaseDomain(domain);
                  const wrappedText = domainStatus.isWrapped ? 'wrapped' : 'unwrapped';
                  const url = `https://sepolia.app.ens.domains/${base}.eth`;
                  return (
                    <>
                      Domain ENS: <a href={url} target="_blank" rel="noopener noreferrer">{base}.eth</a> — {wrappedText}
                    </>
                  );
                })()
              ) : (
                (() => {
                  const base = cleanBaseDomain(domain);
                  const url = `https://sepolia.app.ens.domains/${base}.eth`;
                  return (
                    <>
                      Domain not found — <a href={url} target="_blank" rel="noopener noreferrer">search {base}.eth</a>
                    </>
                  );
                })()
              )
            ) : 'Enter an ENS domain (e.g. airbnb.eth)'}
          </Typography>
          {domain && domainStatus && domainStatus.exists && (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 5 }}>
              Domain URL: {domainUrlLoading ? 'checking…' : domainUrlError ? `error — ${domainUrlError}` : domainUrlText ? (
                <a href={domainUrlText} target="_blank" rel="noopener noreferrer">{domainUrlText}</a>
              ) : 'not set'}
            </Typography>
          )}
          {domain && domainStatus && domainStatus.exists && !domainUrlText && !domainUrlLoading && (
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField label="Set URL text" placeholder="https://example.com" value={domainUrlEdit} onChange={(e) => setDomainUrlEdit(e.target.value)} fullWidth />
              <Button
                variant="outlined"
                disabled={Boolean(
                  domainUrlSaving ||
                  !provider ||
                  !/^https?:\/\//i.test(domainUrlEdit.trim())
                )}
                onClick={async () => {
                  try {
                    console.log('********************* setDomainUrlSaving: ', domainUrlEdit);
                    setDomainUrlSaving(true);
                    setDomainUrlError(null);

                    console.log('********************* cleanBaseDomain');
                    const baseName = cleanBaseDomain(domain) + '.eth';
                    const node = namehash(baseName) as `0x${string}`;
                    if (domainOwnerIsContract) {

                      console.log('********************* createPublicClient');

                      // Build AA client using connected EOA (controller) like other parts of the app
                      const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
                      const walletClient = createWalletClient({ chain: sepolia as any, transport: custom(provider as any), account: address as Address });
                      
                      console.log('********************* check address: ', address);
                      try { (walletClient as any).account = address as Address; } catch {}
                      console.info("to metamask smart account");
                      /*
                      const smartAccountClient = await toMetaMaskSmartAccount({
                        client: publicClient,
                        implementation: Implementation.Hybrid,
                        deployParams: [address as `0x${string}`, [], [], []],
                        signatory: { walletClient },
                      } as any);
                       */

                      const smartAccountClient = await toMetaMaskSmartAccount({
                        address: domainOwnerAddress as `0x${string}`,
                        client: publicClient,
                        implementation: Implementation.Hybrid,
                        signatory: { walletClient },
                      });

                      console.log('await ensService.setTextWithAA: ', smartAccountClient);
                      await ensService.setTextWithAA(smartAccountClient as any, domainResolver as `0x${string}`, node, 'url', domainUrlEdit.trim(), sepolia);
                    } else {
                      // EOA path
                      await ensService.setTextWithEOA(domainResolver as `0x${string}`, node, 'url', domainUrlEdit.trim(), sepolia);
                    }
                    setDomainUrlText(domainUrlEdit.trim());
                  } catch (e: any) {
                    setDomainUrlError(e?.message ?? 'Failed to set URL');
                  } finally {
                    setDomainUrlSaving(false);
                  }
                }}
              >Save URL</Button>
            </Stack>
          )}
          
          <br></br>
          <TextField label="Agent Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
          <Stack direction="row" alignItems="center" spacing={1} sx={{ ml: 5 }}>
            <Typography variant="caption" color="text.secondary">
              Agent ENS: {ensPreview ? (
                <a href={`https://sepolia.app.ens.domains/${ensPreview}`} target="_blank" rel="noopener noreferrer">{ensPreview}</a>
              ) : '—'} {ensPreview && (
                <>
                  {ensResolving
                    ? '(checking...)'
                      : ensExists === true
                        ? '(exists, no address record)'
                        : '(not found)'}
                </>
              )}
            </Typography>
            {ensPreview && ensExists === false && (
              <Button
                size="small"
                variant="outlined"
                disabled={!provider || !domainStatus?.exists || !domainOwnerAddress}
                onClick={async () => {
                  try {
                    setError(null);
                    const base = cleanBaseDomain(domain);
                    if (!base) throw new Error('Invalid parent domain');
                    const label = cleanAgentLabel(name);
                    if (!label) throw new Error('Agent name is required');

                    // Build clients for ENS owner AA and agent AA
                    const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
                    const walletClient = createWalletClient({ chain: sepolia as any, transport: custom(provider as any), account: address as Address });
                    try { (walletClient as any).account = address as Address; } catch {}

                    // ENS owner EOA from private key for AA signatory
                    const ensPrivateKey = process.env.NEXT_PUBLIC_ENS_PRIVATE_KEY as `0x${string}`;
                    const ensOwnerEOA = privateKeyToAccount(ensPrivateKey);

                    // ENS Owner AA: parent domain controller
                    const ensOwnerAA = await toMetaMaskSmartAccount({
                      address: domainOwnerAddress as `0x${string}`,
                      client: publicClient,
                      implementation: Implementation.Hybrid,
                      signatory: { account: ensOwnerEOA },
                    } as any);

                    // Agent AA for the agent name
                    const salt: `0x${string}` = keccak256(stringToHex(ensPreview.toLowerCase())) as `0x${string}`;
                    const agentAccountClient = await toMetaMaskSmartAccount({
                      client: publicClient,
                      implementation: Implementation.Hybrid,
                      deployParams: [address as `0x${string}`, [], [], []],
                      signatory: { walletClient },
                      deploySalt: salt,
                    } as any);
                    const agentAAAddress = await agentAccountClient.getAddress();

                    // Ethers signer for onchain write

                    const { ethers } = await import('ethers');
                    const ethersProvider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL);
                    const ensOwnerWallet = new ethers.Wallet(ensPrivateKey, ethersProvider);
                    const signer = ensOwnerWallet.connect(ethersProvider);


                    console.info("await ensService.createSubdomainForOrg ");
                    const result = await ensService.createSubdomainForOrg(
                      signer as any, // Cast to any to bypass type issues
                      ensOwnerAA,
                      agentAccountClient,
                      agentAAAddress,
                      base, 
                      label, 
                      sepolia
                    );

                    console.info("await ensService.forwardFromEnsName ");

                    await ensService.forwardFromEnsName(result, sepolia, ensOwnerAA, agentAccountClient, label);

                    console.info("await ensService.reverseFromEnsAddress ");
                    await ensService.reverseFromEnsAddress(result, sepolia, ensOwnerAA, agentAccountClient, label);

                    console.info("***********8 done creating subdomain ");

                  } catch (e: any) {
                    setError(e?.message ?? 'Failed to create ENS subdomain');
                  }
                }}
              >Create ENS</Button>
            )}
          </Stack>
          {ensPreview && (
            <>
              {ensExists === false ? (
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField label="Set Agent URL" placeholder="https://example.com/agent-name" value={agentUrlEdit} onChange={(e) => setAgentUrlEdit(e.target.value)} fullWidth />
                </Stack>
              ) : (
                <>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 5 }}>
                    Agent URL: {agentUrlLoading ? 'checking…' : agentUrlError ? `error — ${agentUrlError}` : agentUrlText ? (
                      <a href={agentUrlText} target="_blank" rel="noopener noreferrer">{agentUrlText}</a>
                    ) : 'not set'}
                  </Typography>
                  {!agentUrlText && !agentUrlLoading && (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <TextField label="Set Agent URL" placeholder="https://example.com" value={agentUrlEdit} onChange={(e) => setAgentUrlEdit(e.target.value)} fullWidth />
                      <Button
                        variant="outlined"
                        disabled={Boolean(
                          agentUrlSaving ||
                          !provider ||
                          !/^https?:\/\//i.test(agentUrlEdit.trim())
                        )}
                        onClick={async () => {
                          try {
                            setAgentUrlSaving(true);
                            setAgentUrlError(null);
                            const node = namehash(ensPreview) as `0x${string}`;
                            // Build AA client for the agent AA (ensResolvedAddress)
                            const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
                            const walletClient = createWalletClient({ chain: sepolia as any, transport: custom(provider as any), account: address as Address });
                            try { (walletClient as any).account = address as Address; } catch {}
                            const smartAccountClient = await toMetaMaskSmartAccount({
                              address: ensResolvedAddress as `0x${string}`,
                              client: publicClient,
                              implementation: Implementation.Hybrid,
                              signatory: { walletClient },
                            });

                            console.info("await ensService.setTextWithAA: ", smartAccountClient);
                            console.info("await agentResolver: ", agentResolver);
                            await ensService.setTextWithAA(smartAccountClient as any, agentResolver as `0x${string}`, node, 'url', agentUrlEdit.trim(), sepolia);
                            setAgentUrlText(agentUrlEdit.trim());
                          } catch (e: any) {
                            setAgentUrlError(e?.message ?? 'Failed to set agent url');
                          } finally {
                            setAgentUrlSaving(false);
                          }
                        }}
                      >Save URL</Button>
                    </Stack>
                  )}
                </>
              )}
            </>
          )}
          <TextField label="Agent Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth />
          {agentIdentityExists === true && (
            <Typography variant="body2" color="error">
              Create disabled: Agent Identity already exists for this agent.
            </Typography>
          )}
          {error && <Typography variant="body2" color="error">{error}</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" disableElevation disabled={
          isSubmitting ||
          !provider ||
          agentIdentityExists === true
        }>Create</Button>
      </DialogActions>
    </Dialog>
  );
}


