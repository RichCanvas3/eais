/**
 * Agentic Trust SDK - Identity Client
 * Extends the base ERC-8004 IdentityClient with AA-centric helpers.
 */

import { IdentityClient as BaseIdentityClient } from '../erc8004-src/IdentityClient';
import IdentityRegistryABI from '../erc8004-src/abis/IdentityRegistry.json';
import type { MetadataEntry } from '../erc8004-src/types';

export class AgentIdentityClient extends BaseIdentityClient {
  private ensRegistryAddress: `0x${string}`;

  constructor(
    adapter: any,
    contractAddress: string,
    options?: { ensRegistry?: `0x${string}` }
  ) {
    super(adapter, contractAddress);
    this.ensRegistryAddress = (options?.ensRegistry || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e') as `0x${string}`;
  }
  /**
   * Encode register calldata without sending (for bundler/AA - like EAS SDK pattern)
   * This override exists in the Agentic Trust SDK to keep AA helpers here.
   */
  encodeRegisterWithMetadata(
    tokenURI: string,
    metadata: MetadataEntry[] = []
  ): string {
    const metadataFormatted = metadata.map(m => ({
      key: m.key,
      value: (this as any).stringToBytes(m.value) as Uint8Array,
    }));
    return this.adapter.encodeCall(
      IdentityRegistryABI as any,
      'register(string,(string,bytes)[])',
      [tokenURI, metadataFormatted]
    );
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

  /**
   * Keep compatibility: delegate to receipt extractor.
   */
  override extractAgentIdFromLogs(receipt: any): bigint {
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

    // namehash implementation (keccak-based)
    const namehash = (name: string): `0x${string}` => {
      const { keccak256, toUtf8Bytes } = require('ethers') as typeof import('ethers');
      let node = '0x' + '00'.repeat(32);
      if (name) {
        const labels = name.split('.');
        for (let i = labels.length - 1; i >= 0; i--) {
          const labelSha = keccak256(toUtf8Bytes(labels[i]));
          node = keccak256(Buffer.concat([Buffer.from(node.slice(2), 'hex'), Buffer.from(labelSha.slice(2), 'hex')]));
        }
      }
      return node as `0x${string}`;
    };

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

    const namehash = (n: string): `0x${string}` => {
      const { keccak256, toUtf8Bytes } = require('ethers') as typeof import('ethers');
      let node = '0x' + '00'.repeat(32);
      if (n) {
        const labels = n.split('.');
        for (let i = labels.length - 1; i >= 0; i--) {
          const labelSha = keccak256(toUtf8Bytes(labels[i]));
          node = keccak256(Buffer.concat([Buffer.from(node.slice(2), 'hex'), Buffer.from(labelSha.slice(2), 'hex')]));
        }
      }
      return node as `0x${string}`;
    };

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

    const namehash = (n: string): `0x${string}` => {
      const { keccak256, toUtf8Bytes } = require('ethers') as typeof import('ethers');
      let node = '0x' + '00'.repeat(32);
      if (n) {
        const labels = n.split('.');
        for (let i = labels.length - 1; i >= 0; i--) {
          const labelSha = keccak256(toUtf8Bytes(labels[i]));
          node = keccak256(Buffer.concat([Buffer.from(node.slice(2), 'hex'), Buffer.from(labelSha.slice(2), 'hex')]));
        }
      }
      return node as `0x${string}`;
    };

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
   * Get an organization account address by ENS name.
   * Cleans common prefixes (e.g., "ens:") and resolves via resolver.addr(namehash(name)).
   */
  async getOrgAccount(orgName: string): Promise<`0x${string}` | null> {
    const cleaned = orgName.trim().toLowerCase().replace(/^ens:\s*/i, '');
    // Try as-is
    const direct = await this.getAgentAccountByName(cleaned);
    if (direct) return direct;
    // Fallback: append .eth if missing TLD
    if (!/\./.test(cleaned)) {
      return await this.getAgentAccountByName(`${cleaned}.eth`);
    }
    return null;
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

    const namehash = (n: string): `0x${string}` => {
      const { keccak256, toUtf8Bytes } = require('ethers') as typeof import('ethers');
      let node = '0x' + '00'.repeat(32);
      if (n) {
        const labels = n.split('.');
        for (let i = labels.length - 1; i >= 0; i--) {
          const labelSha = keccak256(toUtf8Bytes(labels[i]));
          node = keccak256(Buffer.concat([Buffer.from(node.slice(2), 'hex'), Buffer.from(labelSha.slice(2), 'hex')]));
        }
      }
      return node as `0x${string}`;
    };

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


