/**
 * Agentic Trust SDK - Identity Client
 * Extends the base ERC-8004 IdentityClient with AA-centric helpers.
 */
import { createPublicClient, http, namehash, labelhash, encodeFunctionData, hexToString, type Chain, type PublicClient } from 'viem';
import { ethers } from 'ethers';
import { sepolia } from 'viem/chains';


import BaseRegistrarABI from  './abis/BaseRegistrarImplementation.json'
import ETHRegistrarControllerABI from './abis/ETHRegistrarController.json';
import NameWrapperABI from './abis/NameWrapper.json';
import PublicResolverABI from './abis/PublicResolver.json';


export class AIAgentENSClient {
  private chain: Chain;
  private adapter: any;
  private ensRegistryAddress: `0x${string}`;
  private ensResolverAddress: `0x${string}`;
  private identityRegistryAddress: `0x${string}`;
  private publicClient: PublicClient | null = null;

  constructor(
    chain: Chain,
    rpcUrl: string,
    adapter: any,
    ensRegistryAddress: `0x${string}`,
    ensResolverAddress: `0x${string}`,
    identityRegistryAddress: `0x${string}`,
  ) {


    this.chain = chain;
    this.adapter = adapter;
    // @ts-ignore - viem version compatibility issue
    this.publicClient = // @ts-ignore - viem version compatibility issue
    createPublicClient({ chain, transport: http(rpcUrl) } as any);
    this.ensRegistryAddress = ensRegistryAddress;
    this.ensResolverAddress = ensResolverAddress;
    this.identityRegistryAddress = identityRegistryAddress;

  }

  getEnsRegistryAddress(): `0x${string}` {
    return this.ensRegistryAddress;
  }
  
  getEnsResolverAddress(): `0x${string}` {
    return this.ensResolverAddress;
  }

  /**
   * Check if this client is for L1 (ETH Sepolia)
   * Base implementation - can be overridden by subclasses
   */
  isL1(): boolean {
    // Default implementation: assume L1 unless overridden
    // Subclasses like AIAgentL2ENSClient will override this
    return !this.isL2();
  }

  /**
   * Check if this client is for L2 (Base Sepolia, Optimism Sepolia, etc.)
   * Base implementation - can be overridden by subclasses
   */
  isL2(): boolean {
    // Default implementation: assume L1 unless overridden
    // Subclasses like AIAgentL2ENSClient will override this
    return false;
  }

  /**
   * Get the chain type as a string
   */
  getChainType(): 'L1' | 'L2' {
    return this.isL2() ? 'L2' : 'L1';
  }

  encodeCall(
    abi: any[],
    functionName: string,
    args: any[]
  ): string {
    const iface = new ethers.Interface(abi);
    return iface.encodeFunctionData(functionName, args);
  }


  async encodeSetNameUri(name: string, uri: string): Promise<`0x${string}`>  {
    const node = namehash(name) as `0x${string}`;
    const data = encodeFunctionData({
        abi: PublicResolverABI.abi,
        functionName: 'setText',
        args: [node, "url", uri]
    });
    return data as `0x${string}`;
  }
  async prepareSetNameUriCalls(
    name: string,
    uri: string
  ): Promise<{ calls: { to: `0x${string}`; data: `0x${string}` }[] }> {

    const calls: { to: `0x${string}`; data: `0x${string}` }[] = [];

    const data = await this.encodeSetNameUri(name, uri);
    

    if (this.publicClient) {
      const resolver = this.getEnsResolverAddress();
      /*
        const node = namehash(name) as `0x${string}`;
        const resolver = await this.// @ts-ignore - viem version compatibility issue
    publicClient.readContract({
            address: this.ensRegistryAddress,
            abi: [{ name: "resolver", stateMutability: "view", type: "function",
                    inputs: [{ name: "node", type: "bytes32"}], outputs: [{ type: "address"}]}],
            functionName: "resolver",
            args: [node],
        });
        */
        console.info("++++++++++++++++++++ prepareSetNameUriCalls: chain", this.publicClient?.chain?.id);
        console.info("++++++++++++++++++++ prepareSetNameUriCalls: resolver", resolver);

        calls.push({ to: resolver, data: data as `0x${string}`});
    }

    return { calls };

  } 

  async prepareAddAgentInfoCalls(params: {
    orgName: string;            // e.g., 'airbnb.eth'
    agentName: string;          // e.g., 'my-agent'
    agentAddress: `0x${string}`; // AA address for the agent name
    agentUrl: string    //  URL
    agentDescription?: string | null    // optional description
  }): Promise<{ calls: { to: `0x${string}`; data: `0x${string}`; value?: bigint }[] }> {
    return { calls: [] };
  }

  async prepareSetNameImageCalls(
    name: string,
    imageUrl: string
  ): Promise<{ calls: { to: `0x${string}`; data: `0x${string}` }[] }> {
    const calls: { to: `0x${string}`; data: `0x${string}` }[] = [];
    const node = namehash(name) as `0x${string}`;
    const data = encodeFunctionData({
      abi: PublicResolverABI.abi,
      functionName: 'setText',
      args: [node, "avatar", imageUrl]
    });

    if (this.publicClient) {
      const resolver = this.getEnsResolverAddress();
      console.info("++++++++++++++++++++ prepareSetNameImageCalls: chain", this.publicClient?.chain?.id);
      console.info("++++++++++++++++++++ prepareSetNameImageCalls: resolver", resolver);
      calls.push({ to: resolver, data: data as `0x${string}` });
    }

    return { calls };
  }

  async prepareSetNameDescriptionCalls(
    name: string,
    description: string
  ): Promise<{ calls: { to: `0x${string}`; data: `0x${string}` }[] }> {
    const calls: { to: `0x${string}`; data: `0x${string}` }[] = [];
    const node = namehash(name) as `0x${string}`;
    const data = encodeFunctionData({
      abi: PublicResolverABI.abi,
      functionName: 'setText',
      args: [node, "description", description]
    });

    if (this.publicClient) {
      const resolver = this.getEnsResolverAddress();
      console.info("++++++++++++++++++++ prepareSetNameDescriptionCalls: chain", this.publicClient?.chain?.id);
      console.info("++++++++++++++++++++ prepareSetNameDescriptionCalls: resolver", resolver);
      calls.push({ to: resolver, data: data as `0x${string}` });
    }

    return { calls };
  }

  async encodeSetNameAgentIdentity(name: string, agentIdentity: BigInt): Promise<`0x${string}`>  {

    // Build ERC-7930 (approx) binary: [v1=01][ns=eip155=01][chainId(4 bytes)][address(20 bytes)] + [len(1)][agentId bytes]
    const chainHex = (this.chain.id >>> 0).toString(16).padStart(8, '0');
    const addrHex = (this.identityRegistryAddress).slice(2).toLowerCase().padStart(40, '0');
    const idHex = agentIdentity.toString(16);
    const idLen = Math.ceil(idHex.length / 2);
    const idLenHex = idLen.toString(16).padStart(2, '0');
    const valueHex = `0x01` + `01` + chainHex + addrHex + idLenHex + idHex.padStart(idLen * 2, '0');

    const node = namehash(name) as `0x${string}`;
    const data = encodeFunctionData({
        abi: PublicResolverABI.abi,
        functionName: 'setText',
        args: [node, "agent-identity", valueHex]
    });
    return data as `0x${string}`;
  }
  async prepareSetNameAgentIdentityCalls(
    name: string,
    agentIdentity: BigInt
  ): Promise<{ calls: { to: `0x${string}`; data: `0x${string}` }[] }> {

    const data = await this.encodeSetNameAgentIdentity(name, agentIdentity);
    const calls: { to: `0x${string}`; data: `0x${string}` }[] = [];

    if (this.publicClient) {
        const node = namehash(name) as `0x${string}`;
        const resolver = await this.// @ts-ignore - viem version compatibility issue
    publicClient.readContract({
            address: this.ensRegistryAddress,
            abi: [{ name: "resolver", stateMutability: "view", type: "function",
                    inputs: [{ name: "node", type: "bytes32"}], outputs: [{ type: "address"}]}],
            functionName: "resolver",
            args: [node],
        });

        calls.push({ to: resolver, data: data as `0x${string}`});
    }

    return { calls };

  } 

  async isValidAgentAccount(agentAccount: `0x${string}`): Promise<boolean | null> {
    if (this.publicClient) {
    const code = await this.publicClient.getBytecode({ address: agentAccount as `0x${string}` });
      return code ? true : false;
    } 
    return false;
  }


  /**
   * Resolve an agent by account address via ENS reverse + text record.
   * 1) Reverse resolve address -> ENS name via ENS Registry + resolver.name(bytes32)
   * 2) Read resolver.text(node, 'agent-identity') and decode agentId
   */
  async getAgentIdentityByAccount(account: `0x${string}`): Promise<{ agentId: bigint | null; ensName: string | null }> {
    const ensRegistry = this.ensRegistryAddress;
    const accountLower = account.toLowerCase();

    // Minimal ABIs
    const ENS_REGISTRY_ABI = [
      { name: 'resolver', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }], outputs: [{ name: '', type: 'address' }] },
    ] as any[];
    const RESOLVER_ABI = [
      { name: 'name', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }], outputs: [{ name: '', type: 'string' }] },
      { name: 'text', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }, { name: 'key', type: 'string' }], outputs: [{ name: '', type: 'string' }] },
    ] as any[];


    const reverseNode = namehash(`${accountLower.slice(2)}.addr.reverse`);

    // 1) resolver for reverse node
    let resolverAddr: `0x${string}` | null = null;
    try {

      // @ts-ignore - viem version compatibility issue
      resolverAddr = await this.publicClient?.readContract({
        address: this.ensRegistryAddress as `0x${string}`,
        abi: [{
            name: 'resolver',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: 'node', type: 'bytes32' }],
            outputs: [{ name: '', type: 'address' }]
        }],
        functionName: 'resolver',
        args: [reverseNode]
      }) as `0x${string}` | null;


    } catch {}
    if (!resolverAddr || resolverAddr === '0x0000000000000000000000000000000000000000') {
      return { agentId: null, ensName: null };
    }

    // 2) resolver.name to get ENS name
    let ensName: string | null = null;
    try {

      // @ts-ignore - viem version compatibility issue
      ensName = await this.publicClient?.readContract({
        address: resolverAddr,
        abi: PublicResolverABI.abi,
        functionName: 'name',
        args: [reverseNode]
      }).catch(() => null) as string | null;


      if (typeof ensName !== 'string' || !ensName) ensName = null;
    } catch {}

    // 3) resolver.text(node, 'agent-identity') on forward node if we have a name
    let agentId: bigint | null = null;
    if (ensName) {
      const forwardNode = namehash(ensName);
      try {

        // @ts-ignore - viem version compatibility issue
        const value = await this.publicClient?.readContract({
          address: resolverAddr,
          abi: PublicResolverABI.abi,
          functionName: 'text',
          args: [forwardNode, 'agent-identity']
        }).catch(() => null) as string | null;

        const decoded = this.decodeAgentIdentity(value);
        agentId = decoded?.agentId ?? null;
      } catch {}
    }

    return { agentId, ensName };
  }

  /**
   * Resolve an agent by ENS name via resolver.text(namehash(name), 'agent-identity')
   */
  async getAgentIdentityByName(name: string): Promise<{ agentId: bigint | null; account: string | null }> {
    const ensName = name.trim().toLowerCase();
    if (!ensName) return  { agentId: null, account: null };

    const ENS_REGISTRY_ABI = [
      { name: 'resolver', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }], outputs: [{ name: '', type: 'address' }] },
    ] as any[];
    const RESOLVER_ABI = [
      { name: 'text', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }, { name: 'key', type: 'string' }], outputs: [{ name: '', type: 'string' }] },
    ] as any[];


    console.info("++++++++++++++++++++ getAgentIdentityByName: ensName", ensName);
    console.info("++++++++++++++++++++ getAgentIdentityByName: this.ensRegistryAddress", this.ensRegistryAddress);

    console.info("++++++++++++++++++++ getAgentIdentityByName: adapter", this.adapter);

    const node = namehash(ensName);

    // resolver
    let resolverAddr: `0x${string}` | null = null;
    try {

      // @ts-ignore - viem version compatibility issue
      resolverAddr = await this.publicClient?.readContract({
        address: this.ensRegistryAddress as `0x${string}`,
        abi: [{
            name: 'resolver',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: 'node', type: 'bytes32' }],
            outputs: [{ name: '', type: 'address' }]
        }],
        functionName: 'resolver',
        args: [node]
      }) as `0x${string}` | null;
      // returns 0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5
    } catch (error) {
      console.info("++++++++++++++++++++ getAgentIdentityByName 1: error", error);
      return { agentId: null, account: null }; // Return null if we can't get resolver
    }
    if (!resolverAddr || resolverAddr === '0x0000000000000000000000000000000000000000') {
      return { agentId: null, account: null };
    }

    // agent-identity text
    let agentId: bigint | null = null;
    try {

      // @ts-ignore - viem version compatibility issue
      const value = await this.publicClient?.readContract({
        address: resolverAddr,
        abi: PublicResolverABI.abi,
        functionName: 'text',
        args: [node, 'agent-identity']
      }).catch(() => null) as string | null;

      console.info("################ getAgentIdentityByName: value", value);
      
      // Handle empty response
      if (!value || value === '0x' || value === '') {
        console.info("++++++++++++++++++++ getAgentIdentityByName: empty agent-identity text record");
        return { agentId: null, account: null };
      }
      
      const decoded = this.decodeAgentIdentity(value as string);
      agentId = decoded?.agentId ?? null;
    } catch (error) {
      console.info("++++++++++++++++++++ getAgentIdentityByName 2: error", error);
      return { agentId: null, account: null }; // Return null if we can't get the text record
    }

    return { agentId, account: null };
  }


  /**
   * Check if an agent name record already has an owner in the ENS Registry.
   * This doesn't require an address to be set, just checks if the record exists.
   */
  async hasAgentNameOwner(orgName: string, agentName: string): Promise<boolean> {
    const clean = (s: string) => (s || '').trim().toLowerCase();
    const parent = clean(orgName);
    const label = clean(agentName).replace(/\s+/g, '-');
    const fullSubname = `${label}.${parent}.eth`;
    const subnameNode = namehash(fullSubname);

    try {
      // @ts-ignore - viem version compatibility issue
      const existingOwner = await this.publicClient?.readContract({
        address: this.ensRegistryAddress as `0x${string}`,
        abi: [{ name: 'owner', type: 'function', stateMutability: 'view', inputs: [{ type: 'bytes32' }], outputs: [{ type: 'address' }] }],
        functionName: 'owner',
        args: [subnameNode]
      });
      
      const hasOwner = Boolean(existingOwner && existingOwner !== '0x0000000000000000000000000000000000000000');
      console.info(`hasAgentNameOwner: "${fullSubname}" ${hasOwner ? 'HAS owner' : 'has NO owner'}${hasOwner ? `: ${existingOwner}` : ''}`);
      return hasOwner;
    } catch (error) {
      console.error('Error checking agent name owner:', error);
      return false;
    }
  }

  /**
   * Resolve account address for an ENS name via resolver.addr(namehash(name)).
   */
  async getAgentAccountByName(name: string): Promise<`0x${string}` | null> {
    const ensName = name.trim().toLowerCase();
    if (!ensName) return null;

    const ENS_REGISTRY_ABI = [
      { name: 'resolver', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }], outputs: [{ name: '', type: 'address' }] },
    ] as any[];
    const RESOLVER_ABI = [
      { name: 'addr', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }], outputs: [{ name: '', type: 'address' }] },
    ] as any[];

    const node = namehash(ensName);

    // resolver
    let resolverAddr: `0x${string}` | null = null;
    try {
      console.info("try and get resolver for node")
      console.info("ensName: ", ensName);
      console.info("this.ensRegistryAddress: ", this.ensRegistryAddress);

      // @ts-ignore - viem version compatibility issue
      resolverAddr = await this.publicClient?.readContract({
        address: this.ensRegistryAddress as `0x${string}`,
        abi: [{
            name: 'resolver',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: 'node', type: 'bytes32' }],
            outputs: [{ name: '', type: 'address' }]
        }],
        functionName: 'resolver',
        args: [node]
      }) as `0x${string}` | null;


      console.info("resolverAddr: ", resolverAddr);
      // returns 0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5

    } catch {}
    if (!resolverAddr || resolverAddr === '0x0000000000000000000000000000000000000000') {
      return null;
    }

    try {

      console.info("try and get addr for node using resolver")
      // @ts-ignore - viem version compatibility issue
      const addr  = await this.publicClient?.readContract({
        address: resolverAddr,
        abi: PublicResolverABI.abi,
        functionName: 'addr',
        args: [node]
      }).catch(() => null) as string | null;

      console.info("addr: ", addr);
      if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr) && addr !== '0x0000000000000000000000000000000000000000') {
        return addr as `0x${string}`;
      }
    } catch {}

    return null;
  }

  /**
   * Get the Agent URL via ENS text record for a given ENS name.
   */
  async getAgentUrlByName(name: string): Promise<string | null> {
    const ensName = name.trim().toLowerCase();
    if (!ensName) return null;

    const ENS_REGISTRY_ABI = [
      { name: 'resolver', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }], outputs: [{ name: '', type: 'address' }] },
    ] as any[];
    const RESOLVER_ABI = [
      { name: 'text', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }, { name: 'key', type: 'string' }], outputs: [{ name: '', type: 'string' }] },
    ] as any[];

    const node = namehash(ensName);

    // resolver
    let resolverAddr: `0x${string}` | null = null;
    try {
      // @ts-ignore - viem version compatibility issue
      resolverAddr = await this.publicClient?.readContract({
        address: this.ensRegistryAddress as `0x${string}`,
        abi: [{
            name: 'resolver',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: 'node', type: 'bytes32' }],
            outputs: [{ name: '', type: 'address' }]
        }],
        functionName: 'resolver',
        args: [node]
      }) as `0x${string}` | null;
      // returns 0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5
    } catch {}
    if (!resolverAddr || resolverAddr === '0x0000000000000000000000000000000000000000') {
      return null;
    }

    try {
      // @ts-ignore - viem version compatibility issue
      const url = await this.publicClient?.readContract({
        address: resolverAddr,
        abi: PublicResolverABI.abi,
        functionName: 'text',
        args: [node, 'url']
      }).catch(() => null) as string | null;

      const trimmed = (url || '').trim();
      return trimmed.length > 0 ? trimmed : null;
    } catch {
      return null;
    }
  }

  /**
   * Get the Agent Avatar/Image via ENS text record for a given ENS name.
   */
  async getAgentImageByName(name: string): Promise<string | null> {
    const ensName = name.trim().toLowerCase();
    if (!ensName) return null;

    const node = namehash(ensName);

    // resolver
    let resolverAddr: `0x${string}` | null = null;
    try {
      // @ts-ignore - viem version compatibility issue
      resolverAddr = await this.publicClient?.readContract({
        address: this.ensRegistryAddress as `0x${string}`,
        abi: [{
            name: 'resolver',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: 'node', type: 'bytes32' }],
            outputs: [{ name: '', type: 'address' }]
        }],
        functionName: 'resolver',
        args: [node]
      }) as `0x${string}` | null;
    } catch {}
    if (!resolverAddr || resolverAddr === '0x0000000000000000000000000000000000000000') {
      return null;
    }

    try {
      // @ts-ignore - viem version compatibility issue
      const image = await this.publicClient?.readContract({
        address: resolverAddr,
        abi: PublicResolverABI.abi,
        functionName: 'text',
        args: [node, 'avatar']
      }).catch(() => null) as string | null;

      const trimmed = (image || '').trim();
      return trimmed.length > 0 ? trimmed : null;
    } catch {
      return null;
    }
  }

  /**
   * Get the Agent Description via ENS text record for a given ENS name.
   */
  async getAgentDescriptionByName(name: string): Promise<string | null> {
    const ensName = name.trim().toLowerCase();
    if (!ensName) return null;

    const node = namehash(ensName);

    // resolver
    let resolverAddr: `0x${string}` | null = null;
    try {
      // @ts-ignore - viem version compatibility issue
      resolverAddr = await this.publicClient?.readContract({
        address: this.ensRegistryAddress as `0x${string}`,
        abi: [{
            name: 'resolver',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: 'node', type: 'bytes32' }],
            outputs: [{ name: '', type: 'address' }]
        }],
        functionName: 'resolver',
        args: [node]
      }) as `0x${string}` | null;
    } catch {}
    if (!resolverAddr || resolverAddr === '0x0000000000000000000000000000000000000000') {
      return null;
    }

    try {
      // @ts-ignore - viem version compatibility issue
      const description = await this.publicClient?.readContract({
        address: resolverAddr,
        abi: PublicResolverABI.abi,
        functionName: 'text',
        args: [node, 'description']
      }).catch(() => null) as string | null;

      const trimmed = (description || '').trim();
      return trimmed.length > 0 ? trimmed : null;
    } catch {
      return null;
    }
  }

  /**
   * Reverse lookup: account address -> ENS name via resolver.name(reverseNode)
   */
  async getAgentNameByAccount(account: `0x${string}`): Promise<string | null> {
    const ensRegistry = this.ensRegistryAddress;
    const accountLower = account.toLowerCase();

    const ENS_REGISTRY_ABI = [
      { name: 'resolver', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }], outputs: [{ name: '', type: 'address' }] },
    ] as any[];
    const RESOLVER_ABI = [
      { name: 'name', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }], outputs: [{ name: '', type: 'string' }] },
    ] as any[];



    const reverseNode = namehash(`${accountLower.slice(2)}.addr.reverse`);

    // resolver for reverse node
    let resolverAddr: `0x${string}` | null = null;
    try {
      // @ts-ignore - viem version compatibility issue
      resolverAddr = await this.publicClient?.readContract({
        address: this.ensRegistryAddress as `0x${string}`,
        abi: [{
            name: 'resolver',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: 'node', type: 'bytes32' }],
            outputs: [{ name: '', type: 'address' }]
        }],
        functionName: 'resolver',
        args: [reverseNode]
      }) as `0x${string}` | null;

    } catch {}
    if (!resolverAddr || resolverAddr === '0x0000000000000000000000000000000000000000') {
      return null;
    }

    try {
      // @ts-ignore - viem version compatibility issue
      const ensName = await this.publicClient?.readContract({
        address: resolverAddr,
        abi: PublicResolverABI.abi,
        functionName: 'name',
        args: [reverseNode]
      }).catch(() => null) as string | null;

      const normalized = (ensName || '').trim().toLowerCase();
      return normalized.length > 0 ? normalized : null;
    } catch {
      return null;
    }
  }


  
  async prepareSetAgentNameInfoCalls(params: {
    orgName: string;            // e.g., 'airbnb.eth'
    agentName: string;                   // e.g., 'my-agent'
    agentAddress: `0x${string}`;     // AA address for the agent name
    agentUrl?: string | null                   // optional TTL (defaults to 0)
    agentDescription?: string | null                   // optional description
  }): Promise<{ calls: { to: `0x${string}`; data: `0x${string}` }[]   }> {

    const RESOLVER_ABI = [
      { name: 'setAddr', type: 'function', stateMutability: 'nonpayable', inputs: [
        { name: 'node', type: 'bytes32' },
        { name: 'addr', type: 'address' }
      ], outputs: [] },
      { name: 'setText', type: 'function', stateMutability: 'nonpayable', inputs: [
        { name: 'node', type: 'bytes32' },
        { name: 'key', type: 'string' },
        { name: 'value', type: 'string' }
      ], outputs: [] },
    ] as any[];

    const clean = (s: string) => (s || '').trim().toLowerCase();
    const parent = clean(params.orgName);
    const label = clean(params.agentName).replace(/\s+/g, '-');
    const childDomain = `${label}.${parent}`;
    
    const ensFullName = childDomain + ".eth";
    const childNode = namehash(ensFullName);


    const calls: { to: `0x${string}`; data: `0x${string}` }[] = [];
    if (this.publicClient) {

      const resolver = await this.// @ts-ignore - viem version compatibility issue
    publicClient.readContract({
        address: this.ensRegistryAddress,
        abi: [{ name: "resolver", stateMutability: "view", type: "function",
                inputs: [{ name: "node", type: "bytes32"}], outputs: [{ type: "address"}]}],
        functionName: "resolver",
        args: [childNode],
      });

      // 1) Set addr record
      const setAddrData = encodeFunctionData({
        abi: [{ name: "setAddr", type: "function", stateMutability: "nonpayable",
                inputs: [{ name: "node", type: "bytes32" }, { name: "a", type: "address" }]}],
        functionName: "setAddr",
        args: [childNode, params.agentAddress],
      });
        

      calls.push({ to: resolver as `0x${string}`, data: setAddrData });
    
      // 2) Optionally set URL text
      if (params.agentUrl && params.agentUrl.trim() !== '') {
        const dataSetUrl = this.encodeCall(
          RESOLVER_ABI,
          'setText(bytes32,string,string)',
          [childNode, 'url', params.agentUrl.trim()]
        ) as `0x${string}`;
        calls.push({ to: resolver as `0x${string}`, data: dataSetUrl });
      }

      // 2b) Optionally set description text
      if (params.agentDescription && params.agentDescription.trim() !== '') {
        const dataSetDescription = this.encodeCall(
          RESOLVER_ABI,
          'setText(bytes32,string,string)',
          [childNode, 'description', params.agentDescription.trim()]
        ) as `0x${string}`;
        calls.push({ to: resolver as `0x${string}`, data: dataSetDescription });
      }

      // 3) Set reverse record
      const reverseNode = namehash(params.agentAddress.slice(2).toLowerCase() + '.addr.reverse');

      const BASE_REVERSE_NODE = namehash("addr.reverse");
      const ENS_REGISTRY_ADDRESS = this.ensRegistryAddress
      const reverseRegistrar = await this.// @ts-ignore - viem version compatibility issue
    publicClient.readContract({
          address: ENS_REGISTRY_ADDRESS as `0x${string}`,
          abi: [{
            name: "owner",
            type: "function",
            stateMutability: "view",
            inputs: [{ name: "node", type: "bytes32" }],
            outputs: [{ name: "", type: "address" }],
          }],
          functionName: "owner",
          args: [BASE_REVERSE_NODE],
        });

      const ourReverseRegistrar = await this.// @ts-ignore - viem version compatibility issue
    publicClient.readContract({
        address: ENS_REGISTRY_ADDRESS as `0x${string}`,
        abi: [{
          name: "owner",
          type: "function",
          stateMutability: "view",  
          inputs: [{ name: "node", type: "bytes32" }],
          outputs: [{ name: "", type: "address" }],
        }],
        functionName: "owner",
        args: [reverseNode],
      });


      const setNameData = encodeFunctionData({
        abi: [{
          name: "setName",
          type: "function",
          stateMutability: "nonpayable",
          inputs: [{ name: "name", type: "string" }],
          outputs: [{ name: "node", type: "bytes32" }],
        }],
        functionName: "setName",
        args: [ensFullName], // e.g. "finder-airbnb-com.orgtrust.eth"
      });

      const call = {
        to: reverseRegistrar as `0x${string}`,
        data: setNameData,
        value: 0n
      }
      calls.push(call);


    }

 

    return { calls };
  }



  // ENS wrapper
  async prepareAddAgentNameToOrgCalls(params: {
    orgName: string;            // e.g., 'airbnb.eth'
    agentName: string;                   // e.g., 'my-agent'
    agentAddress: `0x${string}`;     // AA address for the agent name
    agentUrl: string                   // optional TTL (defaults to 0)
  }): Promise<{ calls: { to: `0x${string}`; data: `0x${string}` }[] }> {


    const clean = (s: string) => (s || '').trim().toLowerCase();
    const parent = clean(params.orgName);
    const label = clean(params.agentName).replace(/\s+/g, '-');

    console.info("@@@@@@@@@@@@@@@@@@@ parent: ", parent);
    console.info("@@@@@@@@@@@@@@@@@@@ label: ", label);
    console.info("@@@@@@@@@@@@@@@@@@@ agentAddress: ", params.agentAddress);
    console.info("@@@@@@@@@@@@@@@@@@@ NEXT_PUBLIC_ETH_SEPOLIA_ENS_PUBLIC_RESOLVER: ", process.env.NEXT_PUBLIC_ETH_SEPOLIA_ENS_PUBLIC_RESOLVER);


    const parentNode = namehash(parent + ".eth");

    const calls: { to: `0x${string}`; data: `0x${string}` }[] = [];


    const subdomainData = encodeFunctionData({
      abi: NameWrapperABI.abi,
      functionName: 'setSubnodeRecord',
      args: [
        parentNode,
        label,
        params.agentAddress,
        process.env.NEXT_PUBLIC_ETH_SEPOLIA_ENS_PUBLIC_RESOLVER as `0x${string}`,
        0,
        0,
        0
      ]
    });
    const call = {
      to: process.env.NEXT_PUBLIC_ETH_SEPOLIA_ENS_IDENTITY_WRAPPER as `0x${string}`,
      data: subdomainData,
      value: 0n
    }
    calls.push(call);

    return { calls };
  }




  /** Decode ERC-7930-like agent identity hex string */
  private decodeAgentIdentity(value?: string | null): { chainId: number; registry: `0x${string}`; agentId: bigint } | null {
    try {
      if (!value || !/^0x[0-9a-fA-F]+$/.test(value)) return null;
      const hex = value.slice(2);
      // [v1=01][ns=eip155=01][chainId(4)][address(20)][len(1)][id(var)]
      if (hex.length < 2 + 2 + 8 + 40 + 2) return null;
      const chainIdHex = hex.slice(4, 12);
      const chainId = parseInt(chainIdHex, 16);
      const addrHex = hex.slice(12, 52);
      const idLen = parseInt(hex.slice(52, 54), 16);
      const idHex = hex.slice(54, 54 + idLen * 2);
      const registry = (`0x${addrHex}`) as `0x${string}`;
      const agentId = BigInt(`0x${idHex || '0'}`);
      return { chainId, registry, agentId };
    } catch {
      return null;
    }
  }
}

