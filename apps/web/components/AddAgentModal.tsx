'use client';
import * as React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Stack, Typography, ClickAwayListener } from '@mui/material';
import { useWeb3Auth } from './Web3AuthProvider';
import { createAgentAdapter, 
  createAIAgentIdentity as adapterCreateAIAgentIdentity, 
  addAgentNameToOrg as adapterAddAgentNameToOrg, 
  setAgentNameUri as adapterSetAgentNameUri, 
  setAgentIdentityRegistrationUri as adapterSetAgentRegistrationUri, 
  setAgentIdentity as adapterSetAgentIdentity } 
  from '@/lib/agentAdapter';
import { createMintClient } from '@thenamespace/mint-manager';
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
  
  // Namespace.ninja state
  const [namespaceClient, setNamespaceClient] = React.useState<any>(null);
  const [subnameAvailable, setSubnameAvailable] = React.useState<boolean | null>(null);
  const [subnameChecking, setSubnameChecking] = React.useState(false);
  const [subnameCreating, setSubnameCreating] = React.useState(false);
  const [subnameError, setSubnameError] = React.useState<string | null>(null);

  // Conditional hook after all other hooks
  const agentIdentityClient = useAgentIdentityClientFor(selectedChainIdHex) || useAgentIdentityClient();
  
  // Helper function to get the appropriate ENS client for the selected chain
  const getENSClientForChain = () => {
    return agentENSClientForChain || agentENSClient;
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

  // Initialize namespace.ninja client
  React.useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_NAMESPACE_API_KEY;
    console.info('Namespace.ninja API key available:', !!apiKey);
    console.info('API key value:', apiKey ? `${apiKey.substring(0, 8)}...` : 'null');
    
    try {
      const client = createMintClient({
        isTestnet: true, // Use testnet (sepolia)
        cursomRpcUrls: {
          [sepolia.id]: process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/demo',
          [baseSepolia.id]: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://base-sepolia.g.alchemy.com/v2/demo',
        }
      });

      /*
      console.info('Client created successfully, checking for HTTP clients...');
      console.info('mintManagerHttp exists:', !!(client as any).mintManagerHttp);
      console.info('listManagerHttp exists:', !!(client as any).listManagerHttp);
      
      // Add API key authentication if available
      if (apiKey && (client as any).mintManagerHttp) {
        console.info('Adding API key authentication to namespace.ninja client');
        (client as any).mintManagerHttp.defaults.headers.common['x-auth-token'] = apiKey;
        (client as any).listManagerHttp.defaults.headers.common['x-auth-token'] = apiKey;
        console.info('API key headers set successfully');
      } else {
        console.warn('API key or HTTP clients not available:', { apiKey: !!apiKey, mintManagerHttp: !!(client as any).mintManagerHttp });
      }
      */
      
      setNamespaceClient(client);
      console.info('Namespace.ninja mint manager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize namespace.ninja client:', error);
    }
  }, []);

  // Check subname availability when agent name or domain changes
  React.useEffect(() => {
    if (namespaceClient && agentName && org && agentName.trim() !== '' && org.trim() !== '') {
      checkSubnameAvailability(agentName.trim(), org.trim());
    } else {
      console.info('Not calling checkSubnameAvailability - conditions not met');
    }
  }, [namespaceClient, agentName, org]);

  // Check subname availability
  async function checkSubnameAvailability(agentName: string, parentDomain: string) {
    if (!namespaceClient || !agentName || !parentDomain) return;

    console.info("set subname activity")
    
    setSubnameChecking(true);
    setSubnameError(null);
    
    try {
      // agentName is already the full subname (e.g., "atl-test-1.theorg.eth")
      // so we can use it directly
      const fullSubname = agentName;
      const chainId = resolvedChain.id;
      const isBaseSepolia = selectedChainIdHex === '0x14a34';
      
      console.info(`Checking availability for: ${fullSubname} (${isBaseSepolia ? 'L2' : 'L1'})`);
      console.info(`Selected chain: ${selectedChainIdHex}, resolvedChain.id: ${chainId}, isBaseSepolia: ${isBaseSepolia}`);
      
      let isAvailable = false;
      

      // Check if subname is available using namespace.ninja SDK
      console.info(`Attempting ${isBaseSepolia ? 'L2' : 'L1'} availability check for: ${fullSubname}`);
      console.info("chainId: ", chainId);

      const l2Available = await namespaceClient.isL2SubnameAvailable(fullSubname, chainId)
      
      console.info("l2Available: ", l2Available);

      isAvailable = isBaseSepolia 
        ? await namespaceClient.isL2SubnameAvailable(fullSubname, chainId)
        : await namespaceClient.isL1SubnameAvailable(fullSubname);
      console.info(`${isBaseSepolia ? 'L2' : 'L1'} availability result:`, isAvailable);

      setSubnameAvailable(isAvailable);
      console.info(`Subname ${fullSubname} availability:`, isAvailable);
      console.info('Setting subnameAvailable state to:', isAvailable);
    } catch (error) {
      console.error('Error checking subname availability:', error);
      setSubnameError(error instanceof Error ? error.message : 'Failed to check availability');
    } finally {
      setSubnameChecking(false);
    }
  }

  // Create subname using namespace.ninja for L1/L2 architecture
  async function createSubname(agentName: string, parentDomain: string, agentAddress: `0x${string}`) {
    if (!namespaceClient || !agentName || !parentDomain) return;
    
    // Use ensAgentAddress if available, otherwise fall back to agentAccount, or compute it
    let addressToUse = ensAgentAddress || agentAccount;

    let agentAccountClient: any = null;
    
    // If we don't have an address, compute it using getDefaultAgentAccountClient
    if (!addressToUse) {
      try {
        const publicClient = createPublicClient({ chain: resolvedChain, transport: http(effectiveRpcUrl) });
        
        console.info("@@@@@@@@@@@@@@@@@@@ agentIdentityClient: ", agentIdentityClient);
        
        // Use the selected chain's provider by converting ethers.js provider to viem-compatible format
        const agentAdapter = (agentIdentityClient as any).adapter;
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
        console.info('Computed agent address for subname creation:', addressToUse);
      } catch (error) {
        console.error('Failed to compute agent address:', error);
        setSubnameError('Failed to compute agent address for subname creation');
        return;
      }
    }
    
    if (!addressToUse) return;
    
    setSubnameCreating(true);
    setSubnameError(null);
    
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
          

  
          console.info("using hardcoded gas fees for deployment");
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
        
        const chainName = isBaseSepolia ? 'base-sepolia' : 'eth-sepolia';

      // Prepare mint transaction parameters using namespace.ninja SDK
      const mintRequest = {
        parentName: parentName, // e.g., "theorg.eth"
        label: label, // e.g., "atl-test-1"
        owner: addressToUse,
        minterAddress: addressToUse,
        records: {
          texts: [
            { key: 'name', value: label },
            { key: 'description', value: description || `Agent: ${label}` },
            { key: 'agent-identity', value: `eip155:${chainId}:${addressToUse}` },
            { key: 'chain', value: chainName },
            { key: 'agent-account', value: addressToUse },
          ],
          addresses: [
            { 
              chain: 60, // Ethereum coin type
              value: addressToUse 
            },
          ],
        }
      };

      const mintParams = await namespaceClient.getMintTransactionParameters(mintRequest);
      

      // Extract transaction parameters
      const { to, data, value } = {
        to: mintParams.contractAddress,
        data: encodeFunctionData({
          abi: mintParams.abi,
          functionName: mintParams.functionName,
          args: mintParams.args,
        }),
        value: mintParams.value || 0n
      };



        const { fast: fee } = await pimlicoClient.getUserOperationGasPrice();

        // Send user operation via bundler with estimated gas
        const userOperationHash = await bundlerClient.sendUserOperation({
          account: agentAccountClient,
          calls: [{
            to: to as `0x${string}`,
            data: data as `0x${string}`,
            value: value,
          }],
          ...fee,
        });
        
        console.log("UserOp submitted:", userOperationHash);

        
        // Wait for the transaction to be mined
        const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: userOperationHash });
        console.log("Subname minted successfully! Transaction hash:", receipt.receipt.transactionHash);
        




        
        // Now set up ENS records using the chain-specific ENS client
        const ensClient = getENSClientForChain();
        console.log("Setting up ENS records for subname:", fullSubname);
        
        /*
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
        
        setSubnameAvailable(false); // Mark as no longer available since we minted it
      
    } catch (error) {
      console.error('Error creating subname:', error);
      setSubnameError(error instanceof Error ? error.message : 'Failed to create subname');
    } finally {
      setSubnameCreating(false);
    }
  }

  async function getDefaultAgentAccountClient(agentName: string, publicClient: any, walletClient: any)  {
    try {
      if (agentName && agentName.trim() !== '') {
        // Resolve via SDK: ENS -> agent-identity -> agentId -> on-chain account
        const agentId = await getENSClientForChain().getAgentIdentityByName(agentName.trim());
        const foundAddr = agentAccount;
        if (foundAddr) {
          const agentAccountClient = await toMetaMaskSmartAccount({
            address: foundAddr as `0x${string}`,
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


          // Also check Registry ownership to determine if the name exists even without an addr record
          try {

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
        // Read and decode agent-identity per ENSIP (ERC-7930 address + agentId)
        try {
          const agentIdentity = await getENSClientForChain().getAgentIdentityByName(agentName);
          if (agentIdentity) {
            console.info('agent-identity exists:', agentIdentity);
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
          // Create subname using namespace.ninja if available
          if (namespaceClient && subnameAvailable && ensAgentAddress) {
            try {
              await createSubname(agentNameLower, org, ensAgentAddress as `0x${string}`);
              console.info('Subname created successfully via namespace.ninja');
            } catch (subnameError) {
              console.warn('Failed to create subname via namespace.ninja, continuing with standard ENS setup:', subnameError);
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
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        Create Agent Identity
        <Typography variant="caption" color="text.secondary" display="block">
          Connected EOA: {eoaAddress ?? 'Not connected'}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <TextField label="Org" placeholder="airbnb.eth" value={org} onChange={(e) => setOrg(e.target.value)} fullWidth autoFocus />
          <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 5 }}>
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
          
          {/* Agent Name Creation - L1 vs L2 */}
          {agentName && org && (
            <Stack spacing={1} sx={{ ml: 5, mt: 1 }}>
              <Typography variant="caption" color="info.main" fontWeight="bold">
                Agent Name Creation:
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {selectedChainIdHex === '0x14a34' 
                  ? 'Base Sepolia (L2) - Create subname via namespace.ninja'
                  : 'ETH Sepolia (L1) - Create ENS subdomain'
                }
              </Typography>
              
              {/* L2: namespace.ninja subname creation */}
              {selectedChainIdHex === '0x14a34' && namespaceClient && (
                <>
                  {subnameChecking ? (
                    <Typography variant="caption" color="text.secondary">
                      Checking availability...
                    </Typography>
                  ) : subnameAvailable === true ? (
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography variant="caption" color="success.main">
                        ✓ {agentName} is available
                      </Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => createSubname(agentName, org, (ensAgentAddress || agentAccount) as `0x${string}`)}
                        disabled={subnameCreating}
                        sx={{ width: 'fit-content' }}
                      >
                        {subnameCreating ? 'Creating...' : 'Create Agent Name'}
                      </Button>
                    </Stack>
                  ) : subnameAvailable === false ? (
                    <Typography variant="caption" color="warning.main">
                      ⚠ {agentName} is not available
                    </Typography>
                  ) : subnameError ? (
                    <Typography variant="caption" color="error">
                      Error: {subnameError}
                    </Typography>
                  ) : null}
                </>
              )}
              
              {/* L1: Traditional ENS creation */}
              {selectedChainIdHex !== '0x14a34' && agentExists === false && (
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="caption" color="info.main">
                    {agentName} - Create ENS subdomain
                  </Typography>
                </Stack>
              )}
            </Stack>
          )}
          
          {/* Debug info when namespace client is not available */}
          {!namespaceClient && agentName && (
            <Stack spacing={1} sx={{ ml: 5, mt: 1 }}>
              <Typography variant="caption" color="warning.main" fontWeight="bold">
                Namespace.ninja Status:
              </Typography>
              <Typography variant="caption" color="text.secondary">
                ⚠ Namespace.ninja client not initialized. Add NEXT_PUBLIC_NAMESPACE_API_KEY to enable subdomain creation.
              </Typography>
            </Stack>
          )}
          
          {/* Debug info when namespace client is available but domain is missing */}
          {namespaceClient && agentName && !org && (
            <Stack spacing={1} sx={{ ml: 5, mt: 1 }}>
              <Typography variant="caption" color="info.main" fontWeight="bold">
                Namespace.ninja Debug:
              </Typography>
              <Typography variant="caption" color="text.secondary">
                ✓ Client initialized, agentName: {agentName}, but org is missing: "{org}"
              </Typography>
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

            {agentName && agentExists === false && (
              <Button
                size="small"
                variant="outlined"
                disabled={!provider || !orgStatus?.exists || !orgOwnerAddress || creatingAgentName}
                onClick={async () => {
                  try {
                    setCreatingAgentName(true);
                    setError(null);
                    const orgName = cleanOrg(org);
                    if (!orgName) throw new Error('Invalid parent org');
                    const agentName = cleanAgentLabel(name);
                    if (!agentName) throw new Error('Agent name is required');
                    const agentUrl = agentUrlText ? agentUrlText.trim() : null;

                    // Build clients for ENS owner AA and agent AA
                    const ensPublicClient = createPublicClient({ chain: resolvedChain, transport: http(effectiveRpcUrl) });
                    
                    // Use the agentIdentityClient's adapter which has the correct provider for the selected chain
                    const agentAdapter = (agentIdentityClient as any).adapter;
                    const ethersProvider = agentAdapter.getProvider();
                    
                    // Convert ethers.js provider to viem-compatible provider
                    const viemCompatibleProvider = createViemCompatibleProvider(ethersProvider);
                    
                    const ensWalletClient = createWalletClient({ 
                      chain: resolvedChain as any, 
                      transport: custom(viemCompatibleProvider as any), 
                      account: eoaAddress as Address 
                    });
                    try { (ensWalletClient as any).account = eoaAddress as Address; } catch {}

                    // ENS owner EOA from private key for AA signatory
                    const ensPrivateKey = process.env.NEXT_PUBLIC_ETH_SEPOLIA_ENS_PRIVATE_KEY as `0x${string}`;
                    const ensOwnerEOA = privateKeyToAccount(ensPrivateKey);

                    // ENS Owner AA: parent org controller
                    const orgAccountClient = await toMetaMaskSmartAccount({
                      address: orgOwnerAddress as `0x${string}`,
                      client: ensPublicClient,
                      implementation: Implementation.Hybrid,
                      signatory: { account: ensOwnerEOA },
                    } as any);

                    // Agent AA for the agent name
                    
                    const agentAccountClient = await getDefaultAgentAccountClient(agentName.toLowerCase(), ensPublicClient, ensWalletClient);
                    const agentAccount = await agentAccountClient.getAddress();

                    const BUNDLER_URL = effectiveBundlerUrl;

                    await adapterAddAgentNameToOrg({
                      agentENSClient: getENSClientForChain(),
                      bundlerUrl: BUNDLER_URL,
                      chain: resolvedChain,
                      orgAccountClient,
                      orgName,
                      agentAccountClient,
                      agentName,
                      agentUrl: agentUrl ?? undefined,
                      agentAccount: agentAccount,
                    });


                    // Update Create new Agent state after ENS creation
                    try {
                      setAgentExists(true);
                      setAgentAccount(agentAccount);

                      try {
                        const normalized = await getENSClientForChain().getAgentUrlByName(agentName)
                        setAgentUrlText(normalized);
                        setAgentUrlEdit(normalized ?? '');
                      } catch {}
                    } catch {}

                  } catch (e: any) {
                    setError(e?.message ?? 'Failed to create ENS subdomain');
                  } finally {
                    setCreatingAgentName(false);
                  }
                }}
              >Create ENS</Button>
            )}
          </Stack>
          
          {/* Agent URL - Available when Agent Name is defined */}
          {agentName && (
            <Stack spacing={1} sx={{ ml: 5, mt: 1 }}>
              <Typography variant="caption" color="info.main" fontWeight="bold">
                Agent URL:
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {agentUrlLoading ? 'checking…' : agentUrlError ? `error — ${agentUrlError}` : agentUrlText ? (
                  <a href={agentUrlText} target="_blank" rel="noopener noreferrer">{agentUrlText}</a>
                ) : 'not set'}
              </Typography>
              
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
            </Stack>
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
          agentIdentityExists === true ||
          !agentName.trim() ||
          agentUrlLoading ||
          !agentUrlText ||
          !/^https?:\/\//i.test(agentUrlText)
        }>Create</Button>
      </DialogActions>
    </Dialog>
  );
}


