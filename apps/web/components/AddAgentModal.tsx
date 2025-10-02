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
    }
  }, [name, domain]);

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
          <TextField label="Domain" placeholder="airbnb.eth" value={domain} onChange={(e) => setDomain(e.target.value)} fullWidth autoFocus />
          <Typography variant="body2" color="text.secondary">
            {domain ? (
              domainStatusLoading ? 'Domain: checking…' : domainStatusError ? `Domain: error — ${domainStatusError}` : domainStatus?.exists ? (
                (() => {
                  const base = cleanBaseDomain(domain);
                  const wrappedText = domainStatus.isWrapped ? 'wrapped' : 'unwrapped';
                  const url = `https://sepolia.app.ens.domains/${base}.eth`;
                  return (
                    <>
                      Domain found: <a href={url} target="_blank" rel="noopener noreferrer">{base}.eth</a> — {wrappedText}
                      {domainOwnerAddress && (
                        <>
                          {' '}— owner: <a href={`https://sepolia.etherscan.io/address/${domainOwnerAddress}`} target="_blank" rel="noopener noreferrer">{domainOwnerAddress}</a>
                          {domainOwnerIsContract === true ? ' [Contract]' : domainOwnerIsContract === false ? ' [EOA]' : ''}
                          {domainOwnerEns ? ` (${domainOwnerEns})` : ''}
                          {domainOwnerIsContract && domainOwnerEoa && (
                            <>
                              {' '}— controller EOA: <a href={`https://sepolia.etherscan.io/address/${domainOwnerEoa}`} target="_blank" rel="noopener noreferrer">{domainOwnerEoa}</a>
                              {domainOwnerEoaEns ? ` (${domainOwnerEoaEns})` : ''}
                            </>
                          )}
                        </>
                      )}
                    </>
                  );
                })()
              ) : (
                (() => {
                  const base = cleanBaseDomain(domain);
                  const url = `https://sepolia.app.ens.domains/${base}.eth`;
                  return (
                    <>
                      Domain: not found on Sepolia — <a href={url} target="_blank" rel="noopener noreferrer">search {base}.eth</a>
                    </>
                  );
                })()
              )
            ) : 'Enter an ENS domain (e.g. airbnb.eth)'}
          </Typography>
          {domain && domainStatus && domainStatus.exists && (
            <Typography variant="body2" color="text.secondary">
              URL text: {domainUrlLoading ? 'checking…' : domainUrlError ? `error — ${domainUrlError}` : domainUrlText ? (
                <a href={domainUrlText} target="_blank" rel="noopener noreferrer">{domainUrlText}</a>
              ) : 'not set'}
            </Typography>
          )}
          {domain && domainStatus && domainStatus.exists && !domainUrlText && !domainUrlLoading && (
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField label="Set URL text" placeholder="https://example.com" value={domainUrlEdit} onChange={(e) => setDomainUrlEdit(e.target.value)} fullWidth />
              <Button
                variant="outlined"
                disabled={
                  domainUrlSaving ||
                  !provider ||
                  !domainResolver ||
                  !domainOwnerEoa ||
                  !address ||
                  domainOwnerEoa.toLowerCase() !== address.toLowerCase() ||
                  !/^https?:\/\//i.test(domainUrlEdit.trim())
                }
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
                        address: address as `0x${string}`,
                        client: publicClient,
                        implementation: Implementation.Hybrid,
                        signatory: { walletClient },
                      });

                      console.log('********************* await ensService.setTextWithAA');
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
          {domain && domainStatus && domainStatus.exists && domainOwnerEoa && address && domainOwnerEoa.toLowerCase() !== address.toLowerCase() && (
            <Typography variant="body2" color="error">
              Create disabled: Connected EOA must match the domain controller EOA.
              {' '}Connected: <a href={`https://sepolia.etherscan.io/address/${address}`} target="_blank" rel="noopener noreferrer">{address}</a>
              {' '}Controller: <a href={`https://sepolia.etherscan.io/address/${domainOwnerEoa}`} target="_blank" rel="noopener noreferrer">{domainOwnerEoa}</a>
              {domainOwnerEoaEns ? ` (${domainOwnerEoaEns})` : ''}
            </Typography>
          )}
          {domain && domainStatus && domainStatus.exists && !domainStatusLoading && !domainOwnerEoa && (
            <Typography variant="body2" color="error">
              Create disabled: Unable to verify domain controller EOA. Ensure you own the domain or it is properly wrapped.
            </Typography>
          )}
          
          <TextField label="Agent Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
          <Typography variant="body2" color="text.secondary">
            ENS name: {ensPreview ? (
              <a href={`https://sepolia.app.ens.domains/${ensPreview}`} target="_blank" rel="noopener noreferrer">{ensPreview}</a>
            ) : '—'} {ensPreview && (
              <>
                {ensResolving
                  ? '(checking...)'
                  : ensResolvedAddress
                    ? `(resolves to ${ensResolvedAddress})`
                    : ensExists === true
                      ? '(exists, no address record)'
                      : '(not found)'}
                {ensResolvedAddress && agentAAIsContract && (
                  <>
                    {' '}— Agent AA owner EOA: {agentAAOwnerEoa ? (
                      <>
                        <a href={`https://sepolia.etherscan.io/address/${agentAAOwnerEoa}`} target="_blank" rel="noopener noreferrer">{agentAAOwnerEoa}</a>
                        {agentAAOwnerEns ? ` (${agentAAOwnerEns})` : ''}
                      </>
                    ) : 'unknown'}
                  </>
                )}
              </>
            )}
          </Typography><TextField label="Agent Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth />
          {ensExists === true && (
            <Typography variant="body2" color="error">
              Create disabled: Agent ENS already exists for this name.
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
          ensExists === true ||
          !domainOwnerEoa ||
          !address ||
          domainOwnerEoa.toLowerCase() !== address.toLowerCase()
        }>Create</Button>
      </DialogActions>
    </Dialog>
  );
}


