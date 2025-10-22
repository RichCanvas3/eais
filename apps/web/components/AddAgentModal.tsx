'use client';
import * as React from 'react';
import { ethers } from 'ethers';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Stack, Typography, ClickAwayListener } from '@mui/material';
import { useWeb3Auth } from './Web3AuthProvider';
import { createAgentAdapter, 
  createAIAgentIdentity as adapterCreateAIAgentIdentity, 
  addAgentNameToOrg as adapterAddAgentNameToOrg, 
  setAgentNameUri as adapterSetAgentNameUri, 
  setAgentIdentityRegistrationUri as adapterSetAgentRegistrationUri, 
  setAgentIdentity as adapterSetAgentIdentity } 
  from '@/lib/agentAdapter';
import { createPublicClient, http, custom, encodeFunctionData, keccak256, stringToHex, zeroAddress, createWalletClient, namehash, hexToString, type Address } from 'viem';

import { sepolia, baseSepolia } from 'viem/chains';
import { createBundlerClient } from 'viem/account-abstraction';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { toMetaMaskSmartAccount, Implementation } from '@metamask/delegation-toolkit';
import ensService from '@/service/ensService';
import IpfsService from '@/service/ipfsService';

import { useAgentENSClient } from './AIAgentENSClientProvider';
import { useAgentENSClientFor } from './AIAgentENSClientsProvider';
import { useAgentIdentityClient } from './AIAgentIdentityClientProvider';
import { useAgentIdentityClientFor, useAgentIdentityClients } from './AIAgentIdentityClientsProvider';
import { useOrgIdentityClient } from './OrgIdentityClientProvider';




import { privateKeyToAccount } from 'viem/accounts';  


type Props = {
  open: boolean;
  onClose: () => void;
  registryAddress: `0x${string}`;
  rpcUrl: string;
  chainIdHex?: string;
};

export function AddAgentModal({ open, onClose, registryAddress, rpcUrl, chainIdHex }: Props) {
  // All useState hooks first
  const [selectedChainIdHex, setSelectedChainIdHex] = React.useState<string | undefined>(chainIdHex);
  
  // All useContext hooks second
  const { provider, address: eoaAddress } = useWeb3Auth();
  const clients = useAgentIdentityClients();
  const agentENSClient = useAgentENSClient();
  const agentENSClientForChain = useAgentENSClientFor(selectedChainIdHex);
  const orgIdentityClient = useOrgIdentityClient();
  const [org, setOrg] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [agentName, setAgentName] = React.useState('');
  const [agentAccount, setAgentAccount] = React.useState<string | null>(null);
  const [agentResolving, setAgentResolving] = React.useState(false);
  const [agentExists, setAgentExists] = React.useState<boolean | null>(null);
  const [agentAADefaultAddress, setAgentAADefaultAddress] = React.useState<string | null>(null);
  const [agentUrlText, setAgentUrlText] = React.useState<string | null>(null);
  const [agentUrlLoading, setAgentUrlLoading] = React.useState(false);
  const [agentUrlError, setAgentUrlError] = React.useState<string | null>(null);
  const [agentUrlEdit, setAgentUrlEdit] = React.useState('');
  const [agentUrlIsAuto, setAgentUrlIsAuto] = React.useState(true);
  const [agentUrlSaving, setAgentUrlSaving] = React.useState(false);

  // ENS agent name ownership check
  const [ensAgentAddress, setEnsAgentAddress] = React.useState<string | null>(null);
  const [ensAgentOwnerEoa, setEnsAgentOwnerEoa] = React.useState<string | null>(null);
  const [creatingAgentName, setCreatingAgentName] = React.useState(false);
  const [agentIdentityExists, setAgentIdentityExists] = React.useState<boolean | null>(null);
  const [orgStatus, setOrgStatus] = React.useState<{
    exists: boolean;
    isWrapped: boolean;
    registrationMethod?: string;
    baseRegistrarOwner?: string;
    ensRegistryOwner?: string;
    nameWrapperOwner?: string;
  } | null>(null);
  const [orgStatusLoading, setOrgStatusLoading] = React.useState(false);
  const [orgStatusError, setOrgStatusError] = React.useState<string | null>(null);
  const [orgOwnerAddress, setOrgOwnerAddress] = React.useState<string | null>(null);
  const [orgOwnerIsContract, setOrgOwnerIsContract] = React.useState<boolean | null>(null);
  const [orgOwnerEns, setOrgOwnerEns] = React.useState<string | null>(null);
  const [orgOwnerEoa, setOrgOwnerEoa] = React.useState<string | null>(null);
  const [orgOwnerEoaEns, setOrgOwnerEoaEns] = React.useState<string | null>(null);
  const [domainResolver, setOrgResolver] = React.useState<`0x${string}` | null>(null);
  const [orgUrlText, setOrgUrlText] = React.useState<string | null>(null);
  const [orgUrlLoading, setOrgUrlLoading] = React.useState(false);
  const [orgUrlError, setOrgUrlError] = React.useState<string | null>(null);
  const [orgUrlEdit, setOrgUrlEdit] = React.useState('');
  const [orgUrlSaving, setOrgUrlSaving] = React.useState(false);
  
  // Agent availability state
  const [agentAvailable, setAgentAvailable] = React.useState<boolean | null>(null);
  const [agentChecking, setAgentChecking] = React.useState(false);
  const [agentCreating, setAgentCreating] = React.useState(false);
  const [agentError, setAgentError] = React.useState<string | null>(null);

  // Conditional hook after all other hooks
  const agentIdentityClient = useAgentIdentityClientFor(selectedChainIdHex) || useAgentIdentityClient();
  
  // Get all ENS clients at component level
  const { useAgentENSClients } = require('./AIAgentENSClientsProvider');
  const allENSClients = useAgentENSClients();

  // Helper function to get the appropriate ENS client for the selected chain
  const getENSClientForChain = () => {
    const client = agentENSClientForChain || agentENSClient;
    return client;
  };

  // Helper function to convert ethers.js provider to viem-compatible provider
  const createViemCompatibleProvider = (ethersProvider: any) => {
    return {
      request: async ({ method, params }: { method: string; params?: any[] }) => {
        console.log(`🔍 Provider request: ${method}`, params);
        try {
          // Handle different ethers.js provider interfaces
          let result;
          
          if (ethersProvider.request) {
            // Direct request method (some providers have this)
            result = await ethersProvider.request({ method, params });
          } else if (ethersProvider.send) {
            // Use send method (common in ethers.js providers)
            result = await ethersProvider.send(method, params || []);
          } else if (ethersProvider._send) {
            // Use private _send method (fallback)
            result = await ethersProvider._send(method, params || []);
          } else {
            // Try to access the underlying provider
            const underlyingProvider = ethersProvider.provider || ethersProvider._provider;
            if (underlyingProvider && underlyingProvider.request) {
              result = await underlyingProvider.request({ method, params });
            } else {
              throw new Error(`No compatible request method found on provider: ${Object.keys(ethersProvider)}`);
            }
          }
          
          console.log(`🔍 Provider response:`, result);
          return result;
        } catch (error) {
          console.error(`❌ Provider request failed:`, error);
          throw error;
        }
      }
    };
  };

  React.useEffect(() => {
    if (!selectedChainIdHex) {
      const first = Object.keys(clients)[0];
      if (first) setSelectedChainIdHex(first);
    }
  }, [clients, selectedChainIdHex]);


  const adapter = React.useMemo(() => createAgentAdapter({ registryAddress, rpcUrl }), [registryAddress, rpcUrl]);

  const effectiveRpcUrl = React.useMemo(() => {
    if (selectedChainIdHex === '0xaa36a7') return process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL as string;
    if (selectedChainIdHex === '0x14a34') return process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL as string;
    return rpcUrl;
  }, [selectedChainIdHex, rpcUrl]);

  const effectiveBundlerUrl = React.useMemo(() => {
    if (selectedChainIdHex === '0xaa36a7') return process.env.NEXT_PUBLIC_ETH_SEPOLIA_BUNDLER_URL as string;
    if (selectedChainIdHex === '0x14a34') return process.env.NEXT_PUBLIC_BASE_SEPOLIA_BUNDLER_URL as string;
    return process.env.NEXT_PUBLIC_ETH_SEPOLIA_BUNDLER_URL as string;
  }, [selectedChainIdHex]);

  const resolvedChain = React.useMemo(() => {
    if (selectedChainIdHex === '0xaa36a7') return sepolia;
    if (selectedChainIdHex === '0x14a34') return baseSepolia;
    return sepolia;
  }, [selectedChainIdHex]);

  function cleanAgentLabel(label: string) {
    return label.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
  }

  function cleanOrg(dom: string) {
    const base = dom.trim().toLowerCase().replace(/^ens:\s*/i, '').replace(/\.eth$/i, '');
    return base.replace(/[^a-z0-9-]/g, '');
  }


  // Check agent availability when agent name or domain changes
  React.useEffect(() => {
    if (agentName && org && agentName.trim() !== '' && org.trim() !== '') {
      checkAgentAvailability(agentName.trim(), org.trim());
    } else {
      console.info('Not calling checkAgentAvailability - conditions not met');
    }
  }, [agentName, org]);

  // Check agent availability
  async function checkAgentAvailability(agentName: string, parentDomain: string) {
    if (!agentName || !parentDomain) return;

    console.info("checking agent availability")
    
    setAgentChecking(true);
    setAgentError(null);
    
    try {
      const fullAgentName = agentName;
      const chainId = resolvedChain.id;
      const isBaseSepolia = selectedChainIdHex === '0x14a34';
      const ensClient = getENSClientForChain();
      
      console.info(`Checking availability for: ${fullAgentName} (${isBaseSepolia ? 'L2' : 'L1'})`);
      console.info(`Selected chain: ${selectedChainIdHex}, resolvedChain.id: ${chainId}, isBaseSepolia: ${isBaseSepolia}`);
      
      let isAvailable = false;

      // Check if agent is available using ENS client
      try {
        // Check if agent account exists (this is what matters for availability)
        const existingAgentAccount = await ensClient.getAgentAccountByName(fullAgentName);
        isAvailable = !existingAgentAccount || existingAgentAccount === '0x0000000000000000000000000000000000000000';
      } catch {
        isAvailable = true; // Assume available if check fails
      }
      
      console.info(`${isBaseSepolia ? 'L2' : 'L1'} availability result:`, isAvailable);
      setAgentAvailable(isAvailable);
      console.info(`Agent ${fullAgentName} availability:`, isAvailable);
    } catch (error) {
      console.error('Error checking agent availability:', error);
      setAgentError(error instanceof Error ? error.message : 'Failed to check availability');
    } finally {
      setAgentChecking(false);
    }
  }

  // Create agent name using ENS client for L1/L2 architecture
  async function createAgentName(agentName: string, parentDomain: string, agentAddress: `0x${string}`) {
    if (!agentName || !parentDomain) return;
    
    // Use ensAgentAddress if available, otherwise fall back to agentAccount, or compute it
    let addressToUse = ensAgentAddress || agentAccount;

    let agentAccountClient: any = null;
    
    // If we don't have an address, compute it using getDefaultAgentAccountClient
    if (!addressToUse) {
      try {
        const publicClient = createPublicClient({ chain: resolvedChain, transport: http(effectiveRpcUrl) });
        
        console.info("@@@@@@@@@@@@@@@@@@@ selectedChainIdHex: ", selectedChainIdHex);
        console.info("@@@@@@@@@@@@@@@@@@@ resolvedChain: ", resolvedChain);
        console.info("@@@@@@@@@@@@@@@@@@@ resolvedChain.id: ", resolvedChain.id);
        
        // Get the correct agentIdentityClient for the selected chain from the clients object
        const correctAgentIdentityClient = clients[selectedChainIdHex || ''] || agentIdentityClient;
        console.info("@@@@@@@@@@@@@@@@@@@ correctAgentIdentityClient: ", correctAgentIdentityClient);
        console.info("@@@@@@@@@@@@@@@@@@@ correctAgentIdentityClient chain: ", (correctAgentIdentityClient as any)?.chain);
        
        // Use the selected chain's provider by converting ethers.js provider to viem-compatible format
        const agentAdapter = (correctAgentIdentityClient as any).adapter;
        const ethersProvider = agentAdapter.getProvider();
        console.info("@@@@@@@@@@@@@@@@@@@ ethersProvider: ", ethersProvider);
        
        // Debug the ethers provider to see what methods are available
        console.info("@@@@@@@@@@@@@@@@@@@ ethersProvider methods:", Object.getOwnPropertyNames(ethersProvider));
        console.info("@@@@@@@@@@@@@@@@@@@ ethersProvider prototype methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(ethersProvider)));
        
        // Convert ethers.js provider to viem-compatible provider
        const viemCompatibleProvider = createViemCompatibleProvider(ethersProvider);
        
        console.info("@@@@@@@@@@@@@@@@@@@ eoaAddress: ", eoaAddress);
        const walletClient = createWalletClient({ 
          chain: resolvedChain as any, 
          transport: custom(viemCompatibleProvider as any), 
          account: eoaAddress as Address 
        });
        console.info("@@@@@@@@@@@@@@@@@@@ walletClient: ", walletClient);
        try { (walletClient as any).account = eoaAddress as Address; } catch {}
        
        agentAccountClient = await getDefaultAgentAccountClient(agentName.toLowerCase(), publicClient, walletClient);
        addressToUse = await agentAccountClient.getAddress();
        console.info('Computed agent address for agent name creation:', addressToUse);
      } catch (error) {
        console.error('Failed to compute agent address:', error);
        setAgentError('Failed to compute agent address for agent name creation');
        return;
      }
    }
    
    if (!addressToUse) return;
    
    setAgentCreating(true);
    setAgentError(null);
    
    try {
      // agentName is already the full subname (e.g., "atl-test-1.theorg.eth")
      // We need to extract the label and parent name from it
      const fullSubname = agentName;
      const parts = fullSubname.split('.');
      if (parts.length < 2) {
        throw new Error('Invalid subname format');
      }
      
      const label = parts[0]; // e.g., "atl-test-1"
      const parentName = parts.slice(1).join('.'); // e.g., "theorg.eth"
      
      const chainId = resolvedChain.id;
      const isBaseSepolia = selectedChainIdHex === '0x14a34';
      
      console.info(`Creating subname - Selected chain: ${selectedChainIdHex}, resolvedChain.id: ${chainId}, isBaseSepolia: ${isBaseSepolia}`);
      



        
        // Use the agentIdentityClient's adapter which has the correct provider for the selected chain
        const agentAdapter = (agentIdentityClient as any).adapter;
        const ethersProvider = agentAdapter.getProvider();
        const adapterSigner = agentAdapter.getSigner();
        
        // Convert ethers.js provider to viem-compatible provider
        const viemCompatibleProvider = createViemCompatibleProvider(ethersProvider);
        
        // Create wallet client using the selected chain's provider
        const walletClient = createWalletClient({ 
          chain: resolvedChain as any, 
          transport: custom(viemCompatibleProvider as any), 
          account: eoaAddress as Address 
        });
        try { (walletClient as any).account = eoaAddress as Address; } catch {}

        const bundlerUrl = effectiveBundlerUrl;
          if (!bundlerUrl) throw new Error('Missing BUNDLER_URL for deployment');
        console.info("Deployment - bundlerUrl:", bundlerUrl, "chain:", resolvedChain.name, "chainId:", resolvedChain.id);
        const pimlicoClient = createPimlicoClient({ transport: http(bundlerUrl) });
        const bundlerClient = createBundlerClient({
          transport: http(bundlerUrl),
          paymaster: true as any,
          chain: resolvedChain as any,
          paymasterContext: { mode: 'SPONSORED' },
        } as any);
        
        
        // Ensure Agent AA is deployed (sponsored via Pimlico)
        const deployed = await agentAccountClient.isDeployed();
        if (!deployed) {
          
          const { fast: fee } = await pimlicoClient.getUserOperationGasPrice();
          console.info("fee: ", fee);

          try {
            console.info("send user operation with bundlerClient 2: ", bundlerClient);

            console.info("send user operation with bundlerClient 2: ", bundlerClient);
            const userOperationHash = await bundlerClient!.sendUserOperation({
              account: agentAccountClient as any,
              calls: [
                {
                  to: zeroAddress,
                },
              ],
              ...fee,
            });

            console.info("individual account is deployed - done");
            const { receipt } = await bundlerClient!.waitForUserOperationReceipt({
              hash: userOperationHash,
            });



          } catch (error) {
            console.info("error deploying indivAccountClient: ", error);
          }
        }
        console.log('deployment done ======> prepareAddAgentNameToOrgCalls');

        // ENS Owner AA: parent domain controller
        const l1RpcUrl = process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL as string;
        const l1PublicClient = createPublicClient({ chain: sepolia, transport: http(l1RpcUrl) });
        const ensPrivateKey = process.env.NEXT_PUBLIC_ETH_SEPOLIA_ENS_PRIVATE_KEY as `0x${string}`;
        const orgOwnerEOA = privateKeyToAccount(ensPrivateKey);

        console.info("@@@@@@@@@@@@@@@@@@@ orgOwnerAddress: ", orgOwnerAddress);
        console.info("@@@@@@@@@@@@@@@@@@@ l1RpcUrl: ", l1RpcUrl);
        console.info("@@@@@@@@@@@@@@@@@@@ orgOwnerEOA: ", orgOwnerEOA);
        console.info("@@@@@@@@@@@@@@@@@@@ resolvedChain: ", resolvedChain.id);
        console.info("@@@@@@@@@@@@@@@@@@@ parentName: ", parentName);
        console.info("@@@@@@@@@@@@@@@@@@@ orgStatus: ", orgStatus);
        console.info("@@@@@@@@@@@@@@@@@@@ agentAccountClient address: ", await agentAccountClient.getAddress());
        const agentAccountAddress = await agentAccountClient.getAddress();
        
                    
        const orgAccountClient = await toMetaMaskSmartAccount({
          address: orgOwnerAddress as `0x${string}`,
          client: l1PublicClient,
          implementation: Implementation.Hybrid,
          signatory: { account: orgOwnerEOA },
        } as any);

        const agentNameLabel = agentName.trim().split('.')[0];
        console.info("@@@@@@@@@@@@@@@@@@@ agentNameLabel: ", agentNameLabel);


        // Use the adapter to add agent name to org
        await adapterAddAgentNameToOrg({
          agentENSClient: getENSClientForChain(),
          bundlerUrl: effectiveBundlerUrl,
          chain: resolvedChain,
          orgAccountClient: orgAccountClient, 
          orgName: parentName,
          agentAccountClient,
          agentName: agentNameLabel,
          agentUrl: description ?? undefined,
          agentAccount: addressToUse as `0x${string}`,
        });

        console.log("Agent name added to org successfully!");
        
        // Update state to reflect that the agent name now exists
        console.log("Setting agentExists to true and agentAvailable to false");
        setAgentExists(true);
        setAgentAvailable(false);
        
        // Update ownership state to reflect that the current user now owns the agent name
        if (eoaAddress) {
          setEnsAgentOwnerEoa(eoaAddress);
          console.log("Setting ensAgentOwnerEoa to:", eoaAddress);
        }
        
        // Refresh the agent URL and other related data
        try {
          console.log("Refreshing agent URL for:", agentName);
          const normalized = await getENSClientForChain().getAgentUrlByName(agentName);
          console.log("Retrieved agent URL:", normalized);
          setAgentUrlText(normalized);
          setAgentUrlEdit(normalized ?? '');
          setAgentUrlIsAuto(false);
        } catch (e) {
          console.warn('Failed to refresh agent URL after creation:', e);
        }

        /*
        console.log("Agent name added to org successfully!");
        
        
        // Prepare and execute ENS record calls
        try {
          // Set the agent-identity record
          const agentIdentityCalls = await ensClient.prepareSetNameAgentIdentityCalls(
            fullSubname,
            0n // We'll need to get the actual agentId from the identity registry
          );
          
          // Set the URL record if we have one
          if (agentUrlEdit && agentUrlEdit.trim()) {
            const uriCalls = await ensClient.prepareSetNameUriCalls({
              name: fullSubname,
              uri: agentUrlEdit.trim(),
            });
            
            // Execute URI calls
            for (const call of uriCalls) {
              const userOpHash = await bundlerClient.sendUserOperation({
                account: agentAccountClient,
                calls: [{
                  to: call.to as `0x${string}`,
                  data: call.data as `0x${string}`,
                  value: call.value || 0n,
                }],
                ...fee,
              });
              await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash });
            }
          }
          
          // Execute agent-identity calls
          for (const call of agentIdentityCalls) {
            const userOpHash = await bundlerClient.sendUserOperation({
              account: agentAccountClient,
              calls: [{
                to: call.to as `0x${string}`,
                data: call.data as `0x${string}`,
                value: call.value || 0n,
              }],
              ...fee,
            });
            await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash });
          }
          
          // For L1 chains, also add the agent name to the org
          if (!isBaseSepolia) {
            console.log("Adding agent name to org (L1 only)");
            const orgCalls = await ensClient.prepareAddAgentNameToOrgCalls({
              orgName: parentName,
              agentName: fullSubname,
              agentAccount: addressToUse,
            });
            
            for (const call of orgCalls) {
              const userOpHash = await bundlerClient.sendUserOperation({
                account: agentAccountClient,
                calls: [{
                  to: call.to as `0x${string}`,
                  data: call.data as `0x${string}`,
                  value: call.value || 0n,
                }],
                ...fee,
              });
              await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash });
            }
          }
          
          console.log("ENS records set up successfully!");
        } catch (ensError) {
          console.error("Error setting up ENS records:", ensError);
          // Don't fail the entire operation if ENS setup fails
        }
        */
      
    } catch (error) {
      console.error('Error creating agent name:', error);
      setAgentError(error instanceof Error ? error.message : 'Failed to create agent name');
    } finally {
      setAgentCreating(false);
    }
  }

  async function getDefaultAgentAccountClient(agentName: string, publicClient: any, walletClient: any)  {
    try {
      // Ensure wallet is connected to the correct chain
      const currentChainId = await walletClient.getChainId();
      console.info("@@@@@@@@@@@@@@@@@@@ getDefaultAgentAccountClient - currentChainId: ", currentChainId);
      console.info("@@@@@@@@@@@@@@@@@@@ getDefaultAgentAccountClient - resolvedChain.id: ", resolvedChain.id);
      console.info("@@@@@@@@@@@@@@@@@@@ getDefaultAgentAccountClient - resolvedChain.name: ", resolvedChain.name);
      
      if (currentChainId !== resolvedChain.id) {
        console.info(`🔄 Wallet is on chain ${currentChainId}, switching to ${resolvedChain.id} (${resolvedChain.name})`);
        
        // Try to switch the wallet to the correct chain
        try {
          await walletClient.switchChain({ id: resolvedChain.id });
          console.info(`✅ Successfully switched to chain ${resolvedChain.id}`);
        } catch (switchError) {
          console.error(`❌ Failed to switch chain:`, switchError);
          throw new Error(`Wallet is connected to chain ${currentChainId} but expected chain ${resolvedChain.id}. Please switch to ${resolvedChain.name} manually.`);
        }
      }

      if (agentName && agentName.trim() !== '') {
        // Resolve via SDK: ENS -> agent-identity -> agentId -> on-chain account
        const { agentId, account } = await getENSClientForChain().getAgentIdentityByName(agentName.trim());
        if (account) {
          const agentAccountClient = await toMetaMaskSmartAccount({
            address: account as `0x${string}`,
            client: publicClient,
            implementation: Implementation.Hybrid,
            signatory: { walletClient },
          });
          
          return agentAccountClient;
        }
      }
    } catch (error: any) {
      console.error("error getting agent by name", agentName, error);
    }

    // first look for ENS match to get address
    // had an ownership issue.  someone else owns the ENS name
    const ensAgentAddress = await getENSClientForChain().getAgentAccountByName(agentName);
    if (ensAgentAddress) {
      const agentAccountClient = await toMetaMaskSmartAccount({
        address: ensAgentAddress as `0x${string}`,
        client: publicClient,
        implementation: Implementation.Hybrid,
        signatory: { walletClient },
      });

      console.info("++++++++++++++ ens found with name", agentName, agentAccountClient.address);
      return agentAccountClient
    }


    // use agentName to get salt
    const salt: `0x${string}` = keccak256(stringToHex(agentName)) as `0x${string}`;
    const agentAccountClient = await toMetaMaskSmartAccount({
      client: publicClient,
      implementation: Implementation.Hybrid,
      deployParams: [eoaAddress as `0x${string}`, [], [], []],
      signatory: { walletClient },
      deploySalt: salt,
    } as any);
    //try { await logAgent(await agentAccountClient.getAddress()); } catch {}
    
    return agentAccountClient


    
  }

  React.useEffect(() => {

    const label = cleanAgentLabel(name);
    const base = cleanOrg(org);


    if (label && base) {
      const full = `${label}.${base}.eth`;
      setAgentName(full);
      let cancelled = false;
      (async () => {

        try {

          setAgentResolving(true);

          const orgAccount = await orgIdentityClient.getOrgAccountByName(full);

          if (!cancelled) setAgentAccount(orgAccount);

          const agentAccount = await getENSClientForChain().getAgentAccountByName(full);
          // Track ENS agent addr and its owner EOA (if any)
          try {
            setEnsAgentAddress(agentAccount ?? null);
            if (agentAccount) {
              const ownerEoa = await agentIdentityClient.getAgentEoaByAgentAccount(agentAccount as `0x${string}`);
              setEnsAgentOwnerEoa(ownerEoa);
            } else {
              setEnsAgentOwnerEoa(null);
            }
          } catch {
            setEnsAgentOwnerEoa(null);
          }

          // Check if agent account exists (this determines if the agent name is taken)
          try {
            const agentAccount = await getENSClientForChain().getAgentAccountByName(full);
            if (!cancelled) setAgentExists(!!agentAccount && agentAccount !== '0x0000000000000000000000000000000000000000');
          } catch {
            if (!cancelled) setAgentExists(null);
          }
        } catch {
          if (!cancelled) setAgentAccount(null);
          if (!cancelled) setAgentExists(null);
        } finally {
          if (!cancelled) setAgentResolving(false);
        }
      })();
      return () => { cancelled = true; };
    } else {
      setAgentName('');
      setAgentAccount(null);
      setAgentResolving(false);
      setAgentExists(null);
      setAgentUrlText(null);
      setAgentUrlLoading(false);
      setAgentUrlError(null);
      setAgentUrlEdit('');
      setAgentUrlIsAuto(true);
      setEnsAgentAddress(null);
      setEnsAgentOwnerEoa(null);
    }
  }, [name, org]);

	// Default Agent URL to org URL + agent name when available and not yet set
	React.useEffect(() => {
		try {
			if (!orgUrlText) return;
			if (!agentName || !agentName.trim()) return;
			if (agentUrlEdit && agentUrlEdit.trim() !== '') return; // don't override user input
			const orgPath = (orgUrlText || '').replace(/\/$/, '');
			const agentLabel = cleanAgentLabel(agentName.split('.')[0]); // Extract label from full agent name
			if (!agentLabel) return;
			setAgentUrlEdit(`${orgPath}/${agentLabel}`);
		} catch {}
	}, [orgUrlText, agentName]);

  // Check if the derived Agent Identity already exists (disable Create if true)
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setAgentIdentityExists(null);
        if (!agentName || !provider || !eoaAddress) return;
        
        const agentNameLower = agentName.trim().toLowerCase();
        const publicClient = createPublicClient({ chain: resolvedChain, transport: http(effectiveRpcUrl) });
        
        // Use the agentIdentityClient's adapter which has the correct provider for the selected chain
        const agentAdapter = (agentIdentityClient as any).adapter;
        const ethersProvider = agentAdapter.getProvider();
        
        // Convert ethers.js provider to viem-compatible provider
        const viemCompatibleProvider = createViemCompatibleProvider(ethersProvider);
        
        const walletClient = createWalletClient({ 
          chain: resolvedChain as any, 
          transport: custom(viemCompatibleProvider as any), 
          account: eoaAddress as Address 
        });
        try { (walletClient as any).account = eoaAddress as Address; } catch {}

        const agentAccountClient = await getDefaultAgentAccountClient(agentNameLower, publicClient, walletClient);
        const agentAddress = await agentAccountClient.getAddress();
        if (!cancelled) setAgentAADefaultAddress(agentAddress);
        try {
          const { agentId } = await getENSClientForChain().getAgentIdentityByAccount(agentAddress as `0x${string}`);
          if (!cancelled) setAgentIdentityExists(!!agentId && agentId > 0n);
        } catch {
          if (!cancelled) setAgentIdentityExists(false);
        }
      } catch {
        if (!cancelled) setAgentIdentityExists(false);
      }
    })();
    return () => { cancelled = true; };
  }, [agentName, provider, eoaAddress, effectiveRpcUrl]);


  // Load agent ENS URL text record if the preview exists
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setAgentUrlError(null);
        setAgentUrlText(null);
        setAgentUrlEdit('');
        if (!agentName) return;
        // Get resolver and url text for agent ENS
        setAgentUrlLoading(true);
        const normalized = await getENSClientForChain().getAgentUrlByName(agentName);
        if (!cancelled) {
        setAgentUrlText(normalized);
        setAgentUrlEdit(normalized ?? '');
        setAgentUrlIsAuto(false);
        }
        
          try {
            const agentId = await getENSClientForChain().getAgentIdentityByName(agentName);
            if (agentId) {
              console.info('agent-identity exists:', agentId);
          } else {
            console.info('agent-identity text not set');
          }
        } catch (e) {
          console.info('failed to read/parse agent-identity text', e);
        }
        
      } catch (e: any) {
        if (!cancelled) setAgentUrlError(e?.message ?? 'Failed to read agent url');
      } finally {
        if (!cancelled) setAgentUrlLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [agentName, effectiveRpcUrl]);

  // Prefill Agent URL when agent ENS doesn't exist, using org URL text + agent name
  React.useEffect(() => {
    if (agentExists === false) {
      const agentLabel = cleanAgentLabel(agentName ? agentName.split('.')[0] : '');
      const base = (orgUrlText ?? '').replace(/\/$/, '');
      const suggested = base && agentLabel ? `${base}/${agentLabel}` : '';
      if (agentUrlIsAuto || !agentUrlEdit) setAgentUrlEdit(suggested);
    }
  }, [agentExists, orgUrlText, agentName]);

  // Also prefill when agent ENS exists but has no URL text record
  React.useEffect(() => {
    if (agentExists === true && !agentUrlText) {
      const agentLabel = cleanAgentLabel(agentName ? agentName.split('.')[0] : '');
      const base = (orgUrlText ?? '').replace(/\/$/, '');
      const suggested = base && agentLabel ? `${base}/${agentLabel}` : '';
      if ((agentUrlIsAuto || !agentUrlEdit) && suggested) setAgentUrlEdit(suggested);
    }
  }, [agentExists, agentUrlText, orgUrlText, agentName, agentUrlIsAuto, agentUrlEdit]);

  React.useEffect(() => {
    const base = cleanOrg(org);
    if (!base) {
      setOrgStatus(null);
      setOrgStatusLoading(false);
      setOrgStatusError(null);
      
      setOrgOwnerIsContract(null);
      setOrgOwnerEns(null);
      setOrgOwnerEoa(null);
      setOrgOwnerEoaEns(null);
      setOrgResolver(null);
      setOrgUrlText(null);
      setOrgUrlLoading(false);
      
      setOrgUrlEdit('');

      setOrgOwnerAddress(null);
      setOrgUrlError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setOrgStatusLoading(true);
        setOrgStatusError(null);
        const status = await ensService.checkEnsNameStatus(base, resolvedChain);
        if (!cancelled) setOrgStatus(status);

        // derive owner
        let owner: string | null = null;
        if (status) {
          owner = status.isWrapped
            ? (status.nameWrapperOwner || status.ensRegistryOwner || null)
            : (status.baseRegistrarOwner || status.ensRegistryOwner || null);
        }
        if (!cancelled) setOrgOwnerAddress(owner);

        if (owner) {
          try {
            const publicClient = createPublicClient({ chain: resolvedChain, transport: http(effectiveRpcUrl) });
            const code = await publicClient.getBytecode({ address: owner as `0x${string}` });
            if (!cancelled) setOrgOwnerIsContract(!!code);
          } catch {
            if (!cancelled) setOrgOwnerIsContract(null);
          }
          try {
            const reverse = await orgIdentityClient.getOrgNameByAccount(owner as `0x${string}`);
            if (!cancelled) setOrgOwnerEns(reverse);
          } catch {
            if (!cancelled) setOrgOwnerEns(null);
          }

          // Read resolver & URL text record (via service for normalization)
          try {
            setOrgUrlLoading(true);
            setOrgUrlError(null);
            try {
              const normalized = await orgIdentityClient.getOrgUrlByName(base);
              if (!cancelled) {
                setOrgUrlText(normalized);
                setOrgUrlEdit(normalized ?? '');
              }
            } catch (e: any) {
              if (!cancelled) {
                setOrgUrlText(null);
                setOrgUrlEdit('');
                setOrgUrlError(e?.message ?? 'Failed to read url');
              }
            } finally {
              if (!cancelled) setOrgUrlLoading(false);
            }
            
          } catch (e: any) {
            if (!cancelled) {
              setOrgResolver(null);
              setOrgUrlText(null);
              setOrgUrlEdit('');
              setOrgUrlError(e?.message ?? 'Failed to read resolver');
            }
          }

          // If AA (contract), attempt to find controlling EOA via common owner functions
          try {
            const publicClient = createPublicClient({ chain: resolvedChain, transport: http(effectiveRpcUrl) });
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
            if (!cancelled) setOrgOwnerEoa(controller);
            if (controller) {
              try {
                const reverse = await orgIdentityClient.getOrgNameByAccount(controller as `0x${string}`);
                if (!cancelled) setOrgOwnerEoaEns(reverse);
              } catch {
                if (!cancelled) setOrgOwnerEoaEns(null);
              }
            } else {
              if (!cancelled) setOrgOwnerEoaEns(null);
            }
          } catch {
            if (!cancelled) {
              setOrgOwnerEoa(null);
              setOrgOwnerEoaEns(null);
            }
          }
        } else {
          if (!cancelled) {
            setOrgOwnerIsContract(null);
            setOrgOwnerEns(null);
            setOrgOwnerEoa(null);
            setOrgOwnerEoaEns(null);
            setOrgResolver(null);
            setOrgUrlText(null);
            setOrgUrlEdit('');
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          setOrgStatus(null);
          setOrgStatusError(e?.message ?? 'Failed to check org');
          
          setOrgOwnerIsContract(null);
          setOrgOwnerEns(null);
          setOrgOwnerEoa(null);
          setOrgOwnerEoaEns(null);
          setOrgResolver(null);
          setOrgUrlText(null);
          setOrgUrlEdit('');

          setOrgOwnerAddress(null);
        }
      } finally {
        if (!cancelled) setOrgStatusLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [org]);

  async function handleSubmit(e: React.FormEvent) {

    console.log('********************* handleSubmit', e);
    e.preventDefault();
    if (!provider) { setError('Please login first'); return; }
    if (!agentName.trim()) { setError('agent name is required'); return; }
    setError(null);
    setIsSubmitting(true);
    try {
      const agentNameLower = agentName.trim().toLowerCase();

      console.log('********************* agentNameLower', agentNameLower);

      // 0) Early exit if agent already exists for this agentNameLower
      try {
        const existing = await adapter.resolveByDomain(agentNameLower);
        if (existing && existing.agentAddress) {
          setIsSubmitting(false);
          setError('Agent already exists for this name ' + agentNameLower);
          return;
        }
      } catch {}

      // 1) Create Agent AA (Hybrid) similar to indiv account abstraction
      const publicClient = createPublicClient({ chain: resolvedChain, transport: http(effectiveRpcUrl) });

      // Owner/signatory based on current EOA from Web3Auth
      if (!eoaAddress) { throw new Error('No EOA address from Web3Auth'); }
      const owner = eoaAddress as Address;
      
      // Use the agentIdentityClient's adapter which has the correct provider for the selected chain
      const agentAdapter = (agentIdentityClient as any).adapter;
      const ethersProvider = agentAdapter.getProvider();
      const adapterSigner = agentAdapter.getSigner();
      
      // Convert ethers.js provider to viem-compatible provider
      const viemCompatibleProvider = createViemCompatibleProvider(ethersProvider);
      
      // Create wallet client using the selected chain's provider
      const walletClient = createWalletClient({ 
        chain: resolvedChain as any, 
        transport: custom(viemCompatibleProvider as any), 
        account: eoaAddress as Address 
      });
      try { (walletClient as any).account = eoaAddress as Address; } catch {}
      
      const signatory = { walletClient } as any;
      const agentAccountClient = await getDefaultAgentAccountClient(agentNameLower, publicClient, walletClient);
        
      const agentAddress = await agentAccountClient.getAddress();

      // Ensure Agent AA is deployed (sponsored via Pimlico)
      const deployed = await agentAccountClient.isDeployed();
      if (!deployed) {
        /*
        const BUNDLER_URL = effectiveBundlerUrl;
        if (!BUNDLER_URL) throw new Error('Missing BUNDLER_URL for deployment');
        const pimlicoClient = createPimlicoClient({ transport: http(BUNDLER_URL) } as any);
        const bundlerClient = createBundlerClient({
          transport: http(BUNDLER_URL),
          paymaster: true,
          chain: resolvedChain,
          paymasterContext: { mode: 'SPONSORED' },
        } as any);
        const { fast: fee } = await (pimlicoClient as any).getUserOperationGasPrice();
        const userOperationHash = await (bundlerClient as any).sendUserOperation({
          account: agentAccountClient,
          calls: [{ to: zeroAddress }],
          ...fee,
        });
        await (bundlerClient as any).waitForUserOperationReceipt({ hash: userOperationHash });
        */

        const pimlico = createPimlicoClient({ transport: http(effectiveBundlerUrl) });
				const bundlerClient = createBundlerClient({
					transport: http(effectiveBundlerUrl),
					paymaster: true as any,
					chain: resolvedChain as any,
					paymasterContext: { mode: 'SPONSORED' },
				} as any);
				const { fast: fee } = await pimlico.getUserOperationGasPrice();
				const userOperationHash = await bundlerClient.sendUserOperation({
					account: agentAccountClient as any,
					calls: [ { to: zeroAddress } ],
					...fee,
				});
				await bundlerClient.waitForUserOperationReceipt({ hash: userOperationHash });
      }

      // Check if an agent already exists for this AA address via backend DB
      try {
        const { agentId } = await getENSClientForChain().getAgentIdentityByAccount(agentAddress as `0x${string}`);
        if (agentId && agentId > 0n) {
          setIsSubmitting(false);
          setError(`Agent already exists for address ${agentAddress} (id ${agentId.toString()})`);
          return;
        }
      } catch {}

      const BUNDLER_URL = effectiveBundlerUrl;

      // Build ERC-8004 registration metadata and upload to IPFS to get tokenUri
      let tokenUri = '';
      try {
        const baseDomainUrl = agentUrlText || '';
        const cleanBase = baseDomainUrl.replace(/\/$/, '');
        
        const label = cleanAgentLabel(name);

        const agentDomainUrl = `${label}.${cleanBase}`

        const a2aEndpoint = cleanBase && label ? `${cleanBase}/.well-known/agent-card.json` : `${cleanBase}/.well-known/agent-card.json`;
        const endpoints: any[] = [];
        if (a2aEndpoint) endpoints.push({ name: 'A2A', endpoint: a2aEndpoint, version: '0.3.0' });
        if (agentNameLower) endpoints.push({ name: 'ENS', endpoint: agentNameLower, version: 'v1' });
        endpoints.push({ name: 'agentAccount', endpoint: `eip155:11155111:${agentAddress}`, version: 'v1' });

        const metadata = {
          type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
          name: agentNameLower,
          description: description || '',
          image: null,
          endpoints,
          registrations: (async () => {
            try {
              const count = await adapter.getAgentCount();
              const nextId = Number((count ?? 0n) + 1n);
              if (nextId > 0 && registryAddress) {
                return [{ agentId: nextId, agentRegistry: `eip155:${resolvedChain.id}:${registryAddress}` }];
              }
            } catch {}
            return [];
          })(),
          supportedTrust: ['reputation', 'crypto-economic', 'tee-attestation']
        } as any;

        // Resolve async registrations if function above returned a Promise
        const resolvedMeta = { ...metadata } as any;
        if (typeof (resolvedMeta.registrations as any)?.then === 'function') {
          resolvedMeta.registrations = await (resolvedMeta.registrations as Promise<any[]>);
        }
        const upload = await IpfsService.uploadJson({ data: resolvedMeta, filename: `agent_${agentNameLower}.json` });
        tokenUri = upload.url;
      } catch (e) {
        console.warn('IPFS upload failed, proceeding without tokenUri', e);
      }


      //const ownerAccount = privateKeyToAccount(process.env.NEXT_PUBLIC_IR_PRIVATE_KEY as `0x${string}`);
      //const identityRegistryOwnerWallet = createWalletClient({
      //  chain: sepolia,
      //  transport: http(process.env.NEXT_PUBLIC_RPC_URL),
      //  account: ownerAccount,
      //});

      //const { ethers } = await import('ethers');
      //const ethersProvider = new ethers.JsonRpcProvider(rpcUrl);
      //const agentOwner = new ethers.Wallet(process.env.NEXT_PUBLIC_IR_PRIVATE_KEY as string, ethersProvider);


      console.log('********************* adapterCreateAIAgentIdentity: tokenUri', tokenUri);
      const agentIdNum = await adapterCreateAIAgentIdentity({
        agentIdentityClient: agentIdentityClient,
        bundlerUrl: BUNDLER_URL,
        chain: resolvedChain,
        agentAccount: agentAccountClient,
        name: agentNameLower,
        tokenUri: tokenUri,
      })


      setIsSubmitting(false);
      onClose();
      
      try {
        // After on-chain metadata is set, also set ENS text: agent-identity per ENSIP
        console.info("set ensip agent registry")
        if (agentIdNum > 0n) {
          
          // Build agent metamask AA client
          const publicClient = createPublicClient({ chain: resolvedChain, transport: http(effectiveRpcUrl) });
          
          // Use the agentIdentityClient's adapter which has the correct provider for the selected chain
          const agentAdapter = (agentIdentityClient as any).adapter;
          const ethersProvider = agentAdapter.getProvider();
          
          // Convert ethers.js provider to viem-compatible provider
          const viemCompatibleProvider = createViemCompatibleProvider(ethersProvider);
          
          const walletClient = createWalletClient({ 
            chain: resolvedChain as any, 
            transport: custom(viemCompatibleProvider as any), 
            account: eoaAddress as Address 
          });
          try { (walletClient as any).account = eoaAddress as Address; } catch {}

          // Use the agent AA derived from the name to authorize setText via AA
          const agentAccountClient = await getDefaultAgentAccountClient(agentName.toLowerCase(), publicClient, walletClient);

          const BUNDLER_URL = effectiveBundlerUrl;
          // Create agent name if available
          if (agentAvailable && ensAgentAddress) {
            try {
              await createAgentName(agentNameLower, org, ensAgentAddress as `0x${string}`);
              console.info('Agent name created successfully');
            } catch (agentError) {
              console.warn('Failed to create agent name, continuing with standard ENS setup:', agentError);
            }
          }

          await adapterSetAgentIdentity({
            agentENSClient: getENSClientForChain(),
            bundlerUrl: BUNDLER_URL,
            chain: resolvedChain,
            agentAccountClient,
            agentName,
            agentIdentity: agentIdNum,
          });

        }
      } catch (e) {
        console.info('failed to set agent-identity text', e);
      }
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err?.message ?? 'Failed to submit');
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" sx={{ '& .MuiDialog-paper': { minHeight: '600px' } }}>
      <DialogTitle>
        Create Agent Identity
        <Typography variant="caption" color="text.secondary" display="block">
          Connected EOA: {eoaAddress ?? 'Not connected'}
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ overflow: 'visible' }}>
        <Stack spacing={2}>
          <TextField label="Org" placeholder="airbnb.eth" value={org} onChange={(e) => setOrg(e.target.value)} fullWidth autoFocus />
          <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 5, wordBreak: 'break-all', minHeight: '20px' }}>
            {org ? (
              orgStatusLoading ? 'Org: checking…' : orgStatusError ? `Org: error — ${orgStatusError}` : orgStatus?.exists ? (
                (() => {
                  const base = cleanOrg(org);
                  const wrappedText = orgStatus.isWrapped ? 'wrapped' : 'unwrapped';
                  const url = `https://sepolia.app.ens.domains/${base}.eth`;
                  return (
                    <>
                      Org ENS: <a href={url} target="_blank" rel="noopener noreferrer">{base}.eth</a> — {wrappedText}
                    </>
                  );
                })()
              ) : (
                (() => {
                  const base = cleanOrg(org);
                  const url = `https://sepolia.app.ens.domains/${base}.eth`;
                  return (
                    <>
                      Org not found — <a href={url} target="_blank" rel="noopener noreferrer">search {base}.eth</a>
                    </>
                  );
                })()
              )
            ) : 'Enter an ENS Org (e.g. airbnb.eth)'}
          </Typography>
          {org && orgStatus && orgStatus.exists && (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 5 }}>
              Org URL: {orgUrlLoading ? 'checking…' : orgUrlError ? `error — ${orgUrlError}` : orgUrlText ? (
                <a href={orgUrlText} target="_blank" rel="noopener noreferrer">{orgUrlText}</a>
              ) : 'not set'}
            </Typography>
          )}
          {org && orgStatus && orgStatus.exists && !orgUrlText && !orgUrlLoading && (
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField label="Set URL text" placeholder="https://example.com" value={orgUrlEdit} onChange={(e) => setOrgUrlEdit(e.target.value)} fullWidth />
              <Button
                variant="outlined"
                disabled={Boolean(
                  orgUrlSaving ||
                  !provider ||
                  !/^https?:\/\//i.test(orgUrlEdit.trim())
                )}
                onClick={async () => {
                  try {

                    setOrgUrlSaving(true);
                    setOrgUrlError(null);

                    if (orgOwnerIsContract) {
                      // Use private key from environment for org operations
                      const orgPrivateKey = process.env.NEXT_PUBLIC_ETH_SEPOLIA_ENS_PRIVATE_KEY as `0x${string}`;
                      if (!orgPrivateKey) {
                        throw new Error('NEXT_PUBLIC_ETH_SEPOLIA_ENS_PRIVATE_KEY not found');
                      }
                      const orgAccount = privateKeyToAccount(orgPrivateKey);
                      
                      const walletClient = createWalletClient({ 
                        chain: sepolia, // Always use L1 for org operations
                        transport: http(process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL as string), 
                        account: orgAccount 
                      });

                      console.info("++++++++++++++ orgOwnerAddress", orgOwnerAddress);
                      const publicClient = createPublicClient({ chain: sepolia, transport: http(process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL as string) });

                      const smartAccountClient = await toMetaMaskSmartAccount({
                        address: orgOwnerAddress as `0x${string}`,
                        client: publicClient,
                        implementation: Implementation.Hybrid,
                        signatory: { walletClient },
                      });

                      // Use ensService to set org URL
                      const orgName = cleanOrg(org);
                      const orgFullName = `${orgName}.eth`;
                      const node = namehash(orgFullName);
                      
                      // Get resolver address for the org
                      const resolverAddress = await publicClient.readContract({
                        address: process.env.NEXT_PUBLIC_ETH_SEPOLIA_ENS_REGISTRY as `0x${string}`,
                        abi: [{ name: 'resolver', type: 'function', stateMutability: 'view', inputs: [{ type: 'bytes32' }], outputs: [{ type: 'address' }] }],
                        functionName: 'resolver',
                        args: [node]
                      }) as `0x${string}`;
                      
                      if (!resolverAddress || resolverAddress === '0x0000000000000000000000000000000000000000') {
                        throw new Error('No resolver set for org domain');
                      }
                      
                      await ensService.setTextWithAA(
                        smartAccountClient,
                        resolverAddress,
                        node,
                        'url',
                        orgUrlEdit.trim(),
                        sepolia
                      );

                     } 
                    setOrgUrlText(orgUrlEdit.trim());
                  } catch (e: any) {
                    setOrgUrlError(e?.message ?? 'Failed to set URL');
                  } finally {
                    setOrgUrlSaving(false);
                  }
                }}
              >Save Org URL</Button>
            </Stack>
          )}
          
          <br></br>
          
          {/* Agent Chain Selection */}
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="body2">Agent Chain</Typography>
            <select value={selectedChainIdHex || ''} onChange={(e) => setSelectedChainIdHex(e.target.value || undefined)}>
              {Object.keys(clients).map((cid) => {
                const label = cid === '0xaa36a7' ? 'ETH Sepolia' : cid === '0x14a34' ? 'Base Sepolia' : cid;
                return (
                  <option key={cid} value={cid}>{label}</option>
                );
              })}
            </select>
          </Stack>
          
          <TextField label="Agent Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
          <Typography variant="caption" color="text.secondary" sx={{ ml: 5 }}>
            Agent AA: {(() => {
              const addr = agentAADefaultAddress || agentAccount;
              if (!addr) return '—';
              const chainIdHex = selectedChainIdHex || '0xaa36a7';
              const chainId = chainIdHex === '0x14a34' ? 84532 : 11155111;
              const caip10 = `eip155:${chainId}:${addr}`;
              const explorerBase = chainId === 84532 ? 'https://sepolia.basescan.org' : 'https://sepolia.etherscan.io';
              return (
                <a href={`${explorerBase}/address/${addr}`} target="_blank" rel="noopener noreferrer">{caip10}</a>
              );
            })()}
          </Typography>
          
          {/* Agent Name Creation */}
          {agentName && org && (
            <Stack spacing={1} sx={{ ml: 5, mt: 1 }}>
              <Typography variant="caption" color="info.main" fontWeight="bold">
                Agent Name:
              </Typography>
              
              
              {/* Agent name creation */}
              {agentChecking ? (
                <Typography variant="caption" color="text.secondary">
                  Checking availability...
                </Typography>
              ) : agentAvailable === true ? (
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="caption" color="success.main">
                    ✓ {agentName} is available
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => createAgentName(agentName, org, (ensAgentAddress || agentAccount) as `0x${string}`)}
                    disabled={agentCreating}
                    sx={{ width: 'fit-content' }}
                  >
                    {agentCreating ? 'Creating...' : 'Create Agent Name'}
                  </Button>
                </Stack>
              ) : agentAvailable === false ? (
                <Typography variant="caption" color="warning.main">
                  ⚠ {agentName} is not available
                </Typography>
              ) : agentError ? (
                <Typography variant="caption" color="error">
                  Error: {agentError}
                </Typography>
              ) : null}
            </Stack>
          )}
          
          
          <Stack direction="row" alignItems="center" spacing={1} sx={{ ml: 5 }}>
            <Typography variant="caption" color="text.secondary">
              Agent Name: {agentName ? (
                <a href={`https://sepolia.app.ens.domains/${agentName}`} target="_blank" rel="noopener noreferrer">{agentName}</a>
              ) : '—'} {agentName && (
                <>
                  {agentResolving
                    ? '(checking...)'
                      : agentExists === true
                        ? '(exists, no address record)'
                        : '(not found)'}
                </>
              )}
            </Typography>

            {agentName && ensAgentAddress && ensAgentOwnerEoa && eoaAddress && (
              ensAgentOwnerEoa.toLowerCase() !== eoaAddress.toLowerCase() ? (
                <Typography variant="caption" color="error" sx={{ ml: 2 }}>
                  ENS name is owned by a different account ({ensAgentOwnerEoa}). Connect that wallet or use a name you control.
                </Typography>
              ) : null
            )}

                </Stack>
          
          {/* Agent URL - Available when Agent Name is created (exists) and owned by current user */}
          {console.log("Agent URL section check - agentName:", agentName, "agentExists:", agentExists, "condition:", agentName && agentExists === true)}
          {agentName && agentExists === true && (
            <Stack spacing={1} sx={{ ml: 5, mt: 1 }}>
              <Typography variant="caption" color="info.main" fontWeight="bold">
                Agent URL:
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {agentUrlLoading ? 'checking…' : agentUrlError ? `error — ${agentUrlError}` : agentUrlText ? (
                      <a href={agentUrlText} target="_blank" rel="noopener noreferrer">{agentUrlText}</a>
                    ) : 'not set'}
                  </Typography>
                  
              {/* Only show URL editing if the agent name is owned by the current user */}
              {console.log("URL editing check - ensAgentOwnerEoa:", ensAgentOwnerEoa, "eoaAddress:", eoaAddress, "match:", ensAgentOwnerEoa && eoaAddress && ensAgentOwnerEoa.toLowerCase() === eoaAddress.toLowerCase())}
              {ensAgentOwnerEoa && eoaAddress && ensAgentOwnerEoa.toLowerCase() === eoaAddress.toLowerCase() ? (
                  <Stack direction="row" spacing={1} alignItems="center">
                  <TextField 
                    label="Set Agent URL" 
                    placeholder="https://example.com/agent-name" 
                    value={agentUrlEdit} 
                    onChange={(e) => { setAgentUrlEdit(e.target.value); setAgentUrlIsAuto(false); }} 
                    fullWidth 
                  />
                    <Button
                      variant="outlined"
                      disabled={Boolean(
                        agentUrlSaving ||
                        !provider ||
                      !agentName ||
                        !/^https?:\/\//i.test(agentUrlEdit.trim())
                      )}
                      onClick={async () => {
                        try {
                          setAgentUrlSaving(true);
                          setAgentUrlError(null);

                          // Build agent metamask AA client
                        const publicClient = createPublicClient({ chain: resolvedChain, transport: http(effectiveRpcUrl) });
                        
                        // Use the agentIdentityClient's adapter which has the correct provider for the selected chain
                        const agentAdapter = (agentIdentityClient as any).adapter;
                        const ethersProvider = agentAdapter.getProvider();
                        
                        // Convert ethers.js provider to viem-compatible provider
                        const viemCompatibleProvider = createViemCompatibleProvider(ethersProvider);
                        
                        const walletClient = createWalletClient({ 
                          chain: resolvedChain as any, 
                          transport: custom(viemCompatibleProvider as any), 
                          account: eoaAddress as Address 
                        });
                        try { (walletClient as any).account = eoaAddress as Address; } catch {}

                          // Use the agent AA derived from the name to authorize setText via AA
                          const agentAccountClient = await getDefaultAgentAccountClient(agentName.toLowerCase(), publicClient, walletClient);

                        const BUNDLER_URL = effectiveBundlerUrl;
                          await adapterSetAgentNameUri({
                          agentENSClient: getENSClientForChain(),
                            bundlerUrl: BUNDLER_URL,
                          chain: resolvedChain,
                            agentAccountClient,
                            agentName,
                            agentUri: agentUrlEdit.trim(),
                          });

                          setAgentUrlText(agentUrlEdit.trim());
                        } catch (e: any) {
                          setAgentUrlError(e?.message ?? 'Failed to set agent url');
                        } finally {
                          setAgentUrlSaving(false);
                        }
                      }}
                    >Save URL</Button>
                  </Stack>
              ) : ensAgentOwnerEoa && eoaAddress && ensAgentOwnerEoa.toLowerCase() !== eoaAddress.toLowerCase() ? (
                <Typography variant="caption" color="warning.main">
                  ⚠ Agent name is owned by a different account. You cannot modify the URL.
                </Typography>
              ) : null}
            </Stack>
          )}
          
          {/* Agent Description - Only show when ready to create agent identity */}
          {agentName.trim() && 
           agentUrlText && 
           /^https?:\/\//i.test(agentUrlText) && 
           !agentUrlLoading && 
           agentIdentityExists !== true && 
           (!ensAgentOwnerEoa || !eoaAddress || ensAgentOwnerEoa.toLowerCase() === eoaAddress.toLowerCase()) && (
          <TextField label="Agent Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth />
          )}
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
        <Button onClick={handleSubmit} variant="contained" disableElevation disabled={Boolean(
          isSubmitting ||
          !provider ||
          agentIdentityExists === true ||
          !agentName.trim() ||
          agentUrlLoading ||
          !agentUrlText ||
          !/^https?:\/\//i.test(agentUrlText) ||
          (ensAgentOwnerEoa && eoaAddress && ensAgentOwnerEoa.toLowerCase() !== eoaAddress.toLowerCase())
        )}>Create</Button>
      </DialogActions>
    </Dialog>
  );
}


