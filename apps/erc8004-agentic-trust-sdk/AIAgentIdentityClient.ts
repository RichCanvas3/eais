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

import { IdentityClient as BaseIdentityClient } from '../erc8004-src/IdentityClient';
import IdentityRegistryABI from '../erc8004-src/abis/IdentityRegistry.json';
import type { MetadataEntry } from '../erc8004-src/types';

export class AIAgentIdentityClient extends BaseIdentityClient {
  private chain: Chain;
  private agentAdapter: any;
  private orgAdapter: any;
  private ensRegistryAddress: `0x${string}`;
  private identityRegistryAddress: `0x${string}`;
  private publicClient: PublicClient | null = null;

  constructor(
    agentAdapter: any,
    orgAdapter: any, 
    identityRegistryAddress: `0x${string}`,
    ensRegistryAddress: `0x${string}`
  ) {
    super(agentAdapter, identityRegistryAddress);

    this.chain = sepolia;
    this.publicClient = agentAdapter.publicClient;

    this.orgAdapter = orgAdapter;
    this.agentAdapter = agentAdapter;
    this.ensRegistryAddress = ensRegistryAddress;
    this.identityRegistryAddress = identityRegistryAddress;

  }

  encodeCall(
    abi: any[],
    functionName: string,
    args: any[]
  ): string {
    const iface = new ethers.Interface(abi);
    return iface.encodeFunctionData(functionName, args);
  }


  /**
   * Encode register calldata without sending (for bundler/AA - like EAS SDK pattern)
   * This override exists in the Agentic Trust SDK to keep AA helpers here.
   */
  async encodeRegisterWithMetadata(
    tokenURI: string,
    metadata: MetadataEntry[] = []
  ): Promise<string> {
    const metadataFormatted = metadata.map(m => ({
      key: m.key,
      value: (this as any).stringToBytes(m.value) as Uint8Array,
    }));
    return this.encodeCall(
      IdentityRegistryABI as any,
      'register(string,(string,bytes)[])',
      [tokenURI, metadataFormatted]
    );
  }

  async encodeRegister(name: string, agentAccount: `0x${string}`, tokenURI: string): Promise<string> {

    // check that ENS name is associated with this agent account
    const foundAccount = await this.getAgentAccountByName(name);
    console.info("name: ", name);
    console.info("foundAccount: ", foundAccount);
    console.info("agentAccount: ", agentAccount);
    if (foundAccount && agentAccount.endsWith(foundAccount) && foundAccount !== '0x0000000000000000000000000000000000000000') {
      console.info("Agent name exists for this account and it matches the agent account");

      // check that Agent Identity does not already exist for this ENS name
      const foundAgentIdentity = await this.getAgentIdentityByName(name);
      console.info("foundAgentIdentity: ", foundAgentIdentity);
      if (foundAgentIdentity.agentId && foundAgentIdentity.agentId > 0n) {
        throw new Error('Agent identity already exists for this ENS name');
      }

      return await this.encodeRegisterWithMetadata(tokenURI, [{ key: 'agentName', value: name }, { key: 'agentAccount', value: agentAccount }]);
    }
    throw new Error('Agent name does not match that of agent account.  You must register an ENS name for this agent account first.');
  }

  async prepareRegisterCalls(name: string, agentAccount: `0x${string}`, tokenURI: string): Promise<{ calls: { to: `0x${string}`; data: `0x${string}` }[] }> {
    const data = await this.encodeRegisterWithMetadata(tokenURI, [{ key: 'agentName', value: name }, { key: 'agentAccount', value: agentAccount }]);
    const calls: { to: `0x${string}`; data: `0x${string}` }[] = [];
    calls.push({ 
        to: this.identityRegistryAddress, 
        data: data as `0x${string}`
    });
    return { calls };
  }


  async encodeSetUri(name: string, uri: string): Promise<`0x${string}`>  {
    const node = namehash(name) as `0x${string}`;
    const data = encodeFunctionData({
        abi: PublicResolverABI.abi,
        functionName: 'setText',
        args: [node, "url", uri]
    });
    return data as `0x${string}`;
  }

  async prepareSetUriCalls(
    name: string,
    uri: string
  ): Promise<{ calls: { to: `0x${string}`; data: `0x${string}` }[] }> {

    const data = await this.encodeSetUri(name, uri);
    const calls: { to: `0x${string}`; data: `0x${string}` }[] = [];

    if (this.publicClient) {
        const node = namehash(name) as `0x${string}`;
        const resolver = await this.publicClient.readContract({
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

  async encodeSetAgentIdentity(name: string, agentIdentity: BigInt): Promise<`0x${string}`>  {

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
  async prepareSetAgentIdentityCalls(
    name: string,
    agentIdentity: BigInt
  ): Promise<{ calls: { to: `0x${string}`; data: `0x${string}` }[] }> {

    const data = await this.encodeSetAgentIdentity(name, agentIdentity);
    const calls: { to: `0x${string}`; data: `0x${string}` }[] = [];

    if (this.publicClient) {
        const node = namehash(name) as `0x${string}`;
        const resolver = await this.publicClient.readContract({
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
   * Extract agentId from a user operation/transaction receipt
   * Public in this SDK to support AA flows explicitly.
   */
   extractAgentIdFromReceiptPublic(receipt: any): bigint {
    // Look for parsed events first
    if (receipt?.events) {
        const registeredEvent = receipt.events.find((e: any) => e.name === 'Registered');
        if (registeredEvent?.args) {
        const val = registeredEvent.args.agentId ?? registeredEvent.args[0];
        if (val !== undefined) return BigInt(val);
        }

        const transferEvent = receipt.events.find(
        (e: any) => e.name === 'Transfer' && (e.args.from === '0x0000000000000000000000000000000000000000' || e.args.from === 0 || e.args.from === 0n)
        );
        if (transferEvent?.args) {
        const val = transferEvent.args.tokenId ?? transferEvent.args[2];
        if (val !== undefined) return BigInt(val);
        }
    }

    // Fallback: raw logs array
    if (receipt?.logs && Array.isArray(receipt.logs)) {
        for (const log of receipt.logs) {
        // Transfer(address,address,uint256)
        if (log.topics && log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
            const from = log.topics[1];
            if (from === '0x0000000000000000000000000000000000000000000000000000000000000000') {
            const tokenId = BigInt(log.topics[3] || log.data);
            return tokenId;
            }
        }
        }
    }

    throw new Error('Could not extract agentId from transaction receipt - Registered or Transfer event not found');
    }

  async getAgentEoaByAgentAccount(agentAccount: `0x${string}`): Promise<string | null> {
    if (this.publicClient) {
        const eoa = await this.publicClient.readContract({
        address: agentAccount as `0x${string}`,
        abi: [{ name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }],
        functionName: 'owner',
      });
      return eoa as string;
    } 
    return null;
  }

  /**
   * Get agentName from on-chain metadata (string value)
   */
  async getAgentName(agentId: bigint): Promise<string | null> {
    try {
      const name = await (this as any).getMetadata(agentId, 'agentName');
      if (typeof name === 'string') {
        const trimmed = name.trim();
        return trimmed.length > 0 ? trimmed : null;
      }
      return name ? String(name) : null;
    } catch {
      return null;
    }
  }



  /**
   * Get agentAccount address from on-chain metadata.
   * Supports CAIP-10 format like "eip155:11155111:0x..." or raw 0x address.
   */
  async getAgentAccount(agentId: bigint): Promise<`0x${string}` | null> {
    try {
      const value = await (this as any).getMetadata(agentId, 'agentAccount');
      if (!value) return null;
      if (typeof value === 'string') {
        const v = value.trim();
        if (v.startsWith('eip155:')) {
          const parts = v.split(':');
          const addr = parts[2];
          if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr)) return addr as `0x${string}`;
        }
        if (/^0x[a-fA-F0-9]{40}$/.test(v)) return v as `0x${string}`;
      }
      return null;
    } catch {
      return null;
    }
  }


  /**
   * Keep compatibility: delegate to receipt extractor.
   */
  extractAgentIdFromLogs(receipt: any): bigint {
    return this.extractAgentIdFromReceiptPublic(receipt);
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
      resolverAddr = await (this as any).adapter.call(
        ensRegistry,
        ENS_REGISTRY_ABI,
        'resolver',
        [reverseNode]
      );
    } catch {}
    if (!resolverAddr || resolverAddr === '0x0000000000000000000000000000000000000000') {
      return { agentId: null, ensName: null };
    }

    // 2) resolver.name to get ENS name
    let ensName: string | null = null;
    try {
      ensName = await (this as any).adapter.call(
        resolverAddr,
        RESOLVER_ABI,
        'name',
        [reverseNode]
      );
      if (typeof ensName !== 'string' || !ensName) ensName = null;
    } catch {}

    // 3) resolver.text(node, 'agent-identity') on forward node if we have a name
    let agentId: bigint | null = null;
    if (ensName) {
      const forwardNode = namehash(ensName);
      try {
        const value: string = await (this as any).adapter.call(
          resolverAddr,
          RESOLVER_ABI,
          'text',
          [forwardNode, 'agent-identity']
        );
        const decoded = this.decodeAgentIdentity(value);
        agentId = decoded?.agentId ?? null;
      } catch {}
    }

    return { agentId, ensName };
  }

  /**
   * Resolve an agent by ENS name via resolver.text(namehash(name), 'agent-identity')
   */
  async getAgentIdentityByName(name: string): Promise<{ agentId: bigint | null; ensName: string; agentAccount: `0x${string}` | null }> {
    const ensName = name.trim().toLowerCase();
    if (!ensName) return { agentId: null, ensName: '', agentAccount: null };

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
      resolverAddr = await (this as any).adapter.call(
        this.ensRegistryAddress,
        ENS_REGISTRY_ABI,
        'resolver',
        [node]
      );
    } catch {}
    if (!resolverAddr || resolverAddr === '0x0000000000000000000000000000000000000000') {
      return { agentId: null, ensName, agentAccount: null };
    }

    // agent-identity text
    let agentId: bigint | null = null;
    try {
      const value: string = await (this as any).adapter.call(
        resolverAddr,
        RESOLVER_ABI,
        'text',
        [node, 'agent-identity']
      );
      const decoded = this.decodeAgentIdentity(value);
      agentId = decoded?.agentId ?? null;
    } catch {}

    // optional: get agentAccount from on-chain metadata
    let agentAccount: `0x${string}` | null = null;
    if (agentId && agentId > 0n) {
      agentAccount = await this.getAgentAccount(agentId);
    }

    return { agentId, ensName, agentAccount };
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
      resolverAddr = await (this as any).adapter.call(
        this.ensRegistryAddress,
        ENS_REGISTRY_ABI,
        'resolver',
        [node]
      );
    } catch {}
    if (!resolverAddr || resolverAddr === '0x0000000000000000000000000000000000000000') {
      return null;
    }

    try {
      const addr: `0x${string}` = await (this as any).adapter.call(
        resolverAddr,
        RESOLVER_ABI,
        'addr',
        [node]
      );
      if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr) && addr !== '0x0000000000000000000000000000000000000000') {
        return addr;
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
      resolverAddr = await (this as any).adapter.call(
        this.ensRegistryAddress,
        ENS_REGISTRY_ABI,
        'resolver',
        [node]
      );
    } catch {}
    if (!resolverAddr || resolverAddr === '0x0000000000000000000000000000000000000000') {
      return null;
    }

    try {
      const url: string = await (this as any).adapter.call(
        resolverAddr,
        RESOLVER_ABI,
        'text',
        [node, 'url']
      );
      const trimmed = (url || '').trim();
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
      resolverAddr = await (this as any).adapter.call(
        ensRegistry,
        ENS_REGISTRY_ABI,
        'resolver',
        [reverseNode]
      );
    } catch {}
    if (!resolverAddr || resolverAddr === '0x0000000000000000000000000000000000000000') {
      return null;
    }

    try {
      const ensName: string = await (this as any).adapter.call(
        resolverAddr,
        RESOLVER_ABI,
        'name',
        [reverseNode]
      );
      const normalized = (ensName || '').trim().toLowerCase();
      return normalized.length > 0 ? normalized : null;
    } catch {
      return null;
    }
  }


  // ENS wrapper
  async prepareAddAgentNameToOrgCalls(params: {
    orgName: string;            // e.g., 'airbnb.eth'
    agentName: string;                   // e.g., 'my-agent'
    agentAddress: `0x${string}`;     // AA address for the agent name
    agentUrl?: string | null                   // optional TTL (defaults to 0)
  }): Promise<{ calls: { to: `0x${string}`; data: `0x${string}` }[] }> {


    const clean = (s: string) => (s || '').trim().toLowerCase();
    const parent = clean(params.orgName);
    const label = clean(params.agentName).replace(/\s+/g, '-');


    const parentNode = namehash(parent + ".eth");



    const calls: { to: `0x${string}`; data: `0x${string}` }[] = [];


    const publicResolver = new ethers.Contract(
      (process.env.NEXT_PUBLIC_ENS_PUBLIC_RESOLVER as `0x${string}`) || '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5',
      PublicResolverABI.abi,
      this.agentAdapter.signer
    );

    const nameWrapper = new ethers.Contract(
      (process.env.NEXT_PUBLIC_ENS_IDENTITY_WRAPPER as `0x${string}`) || '0x0635513f179D50A207757E05759CbD106d7dFcE8',
      NameWrapperABI.abi,
      this.agentAdapter.signer
    );
    

    const subdomainData = encodeFunctionData({
      abi: NameWrapperABI.abi,
      functionName: 'setSubnodeRecord',
      args: [
        parentNode,
        label,
        params.agentAddress,
        publicResolver.target as `0x${string}`,
        0,
        0,
        0
      ]
    });
    const call = {
      to: nameWrapper.target as `0x${string}`,
      data: subdomainData,
      value: 0n
    }
    calls.push(call);

    return { calls };
  }

  
  async prepareSetAgentNameInfoCalls(params: {
    orgName: string;            // e.g., 'airbnb.eth'
    agentName: string;                   // e.g., 'my-agent'
    agentAddress: `0x${string}`;     // AA address for the agent name
    agentUrl?: string | null                   // optional TTL (defaults to 0)
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

      const resolver = await this.publicClient.readContract({
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


      // 3) Set reverse record
      const reverseNode = namehash(params.agentAddress.slice(2).toLowerCase() + '.addr.reverse');

      const BASE_REVERSE_NODE = namehash("addr.reverse");
      const ENS_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_ENS_REGISTRY as `0x${string}`) || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
      const reverseRegistrar = await this.publicClient.readContract({
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

      const ourReverseRegistrar = await this.publicClient.readContract({
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





  /**
   * Get the public URL for an agent from ENS text record 'url'.
   * Flow: agentId -> agentName (on-chain metadata) -> resolver.text(namehash(name), 'url')
   */
  async getAgentUrl(agentId: bigint): Promise<string | null> {
    const ensName = await this.getAgentName(agentId);
    if (!ensName) return null;

    const ENS_REGISTRY_ABI = [
      { name: 'resolver', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }], outputs: [{ name: '', type: 'address' }] },
    ] as any[];
    const RESOLVER_ABI = [
      { name: 'text', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }, { name: 'key', type: 'string' }], outputs: [{ name: '', type: 'string' }] },
    ] as any[];


    const node = namehash(ensName.trim().toLowerCase());

    // resolver
    let resolverAddr: `0x${string}` | null = null;
    try {
      resolverAddr = await (this as any).adapter.call(
        this.ensRegistryAddress,
        ENS_REGISTRY_ABI,
        'resolver',
        [node]
      );
    } catch {}
    if (!resolverAddr || resolverAddr === '0x0000000000000000000000000000000000000000') {
      return null;
    }

    try {
      const url: string = await (this as any).adapter.call(
        resolverAddr,
        RESOLVER_ABI,
        'text',
        [node, 'url']
      );
      const trimmed = (url || '').trim();
      return trimmed.length > 0 ? trimmed : null;
    } catch {
      return null;
    }
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


