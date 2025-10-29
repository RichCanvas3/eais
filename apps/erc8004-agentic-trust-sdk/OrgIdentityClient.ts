import { createPublicClient, http, type PublicClient } from 'viem';
import { sepolia } from 'viem/chains';
import type { BlockchainAdapter } from '@erc8004/sdk';

/**
 * Org Identity Client - ENS utilities for organizations
 * Provides helpers to resolve an org's ENS name to its account address and URL text record.
 */
export class OrgIdentityClient {
  private adapter: BlockchainAdapter;
  private ensRegistryAddress: `0x${string}`;
  private publicClient: PublicClient | null = null;

  constructor(
    adapter: BlockchainAdapter,
    options?: { ensRegistry?: `0x${string}`; rpcUrl?: string }
  ) {
    this.adapter = adapter;
    this.ensRegistryAddress = (options?.ensRegistry || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e') as `0x${string}`;
    if (options?.rpcUrl) {
      // @ts-ignore - viem version compatibility issue
      this.publicClient = createPublicClient({ chain: sepolia, transport: http(options.rpcUrl) });
    }
  }

  /** Resolve the account address for an org ENS name via resolver.addr(namehash(name)). */
  async getOrgAccountByName(orgName: string): Promise<`0x${string}` | null> {
    const ensName = this.normalizeEnsName(orgName);
    if (!ensName) return null;

    const node = this.namehash(ensName);
    const resolver = await this.getResolver(node);
    if (!resolver) return null;

    const RESOLVER_ABI = [
      { name: 'addr', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }], outputs: [{ name: '', type: 'address' }] },
    ] as any[];

    try {
      const addr: `0x${string}` = await (this.adapter as any).call(
        resolver,
        RESOLVER_ABI,
        'addr',
        [node]
      );
      if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr) && !this.isZeroAddress(addr)) {
        return addr;
      }
    } catch {}

    return null;
  }

  async getOrgEoaByAccount(orgAccount: `0x${string}`): Promise<string | null> {
    if (this.publicClient) {
        // @ts-ignore - viem version compatibility issue
      const eoa = await this.publicClient.readContract({
        address: orgAccount as `0x${string}`,
        abi: [{ name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }],
        functionName: 'owner',
      });
      return eoa as string;
    } 
    return null;
  }

  /** Resolve the URL text record for an org ENS name via resolver.text(namehash(name), 'url'). */
  async getOrgUrlByName(orgName: string): Promise<string | null> {
    const ensName = this.normalizeEnsName(orgName);
    if (!ensName) return null;

    const node = this.namehash(ensName);
    const resolver = await this.getResolver(node);
    if (!resolver) return null;

    const RESOLVER_ABI = [
      { name: 'text', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }, { name: 'key', type: 'string' }], outputs: [{ name: '', type: 'string' }] },
    ] as any[];

    try {
      const value: string = await (this.adapter as any).call(
        resolver,
        RESOLVER_ABI,
        'text',
        [node, 'url']
      );
      const trimmed = (value || '').trim();
      return trimmed.length > 0 ? trimmed : null;
    } catch {}

    return null;
  }

  /** Reverse lookup: account address -> ENS name via resolver.name(reverseNode) */
  async getOrgNameByAccount(account: `0x${string}`): Promise<string | null> {
    const ENS_REGISTRY_ABI = [
      { name: 'resolver', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }], outputs: [{ name: '', type: 'address' }] },
    ] as any[];
    const RESOLVER_ABI = [
      { name: 'name', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }], outputs: [{ name: '', type: 'string' }] },
    ] as any[];

    const lower = account.toLowerCase();
    const reverseNode = this.namehash(`${lower.slice(2)}.addr.reverse`);

    let resolver: `0x${string}` | null = null;
    try {
      resolver = await (this.adapter as any).call(
        this.ensRegistryAddress,
        ENS_REGISTRY_ABI,
        'resolver',
        [reverseNode]
      );
    } catch {}
    if (!resolver || this.isZeroAddress(resolver)) return null;

    try {
      const name: string = await (this.adapter as any).call(
        resolver,
        RESOLVER_ABI,
        'name',
        [reverseNode]
      );
      const normalized = (name || '').trim().toLowerCase();
      return normalized.length > 0 ? normalized : null;
    } catch {
      return null;
    }
  }

  // --- internals ---
  private async getResolver(node: `0x${string}`): Promise<`0x${string}` | null> {
    const ENS_REGISTRY_ABI = [
      { name: 'resolver', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }], outputs: [{ name: '', type: 'address' }] },
    ] as any[];
    try {
      const resolver: `0x${string}` = await (this.adapter as any).call(
        this.ensRegistryAddress,
        ENS_REGISTRY_ABI,
        'resolver',
        [node]
      );
      if (resolver && !this.isZeroAddress(resolver)) return resolver;
    } catch {}
    return null;
  }

  private normalizeEnsName(name: string): string {
    const cleaned = (name || '').trim().toLowerCase().replace(/^ens:\s*/i, '');
    if (!cleaned) return '';
    if (!/\./.test(cleaned)) return `${cleaned}.eth`;
    return cleaned;
  }

  private namehash(name: string): `0x${string}` {
    const { keccak256, toUtf8Bytes } = require('ethers') as typeof import('ethers');
    let node = '0x' + '00'.repeat(32);
    if (!name) return node as `0x${string}`;
    const labels = name.split('.');
    for (let i = labels.length - 1; i >= 0; i--) {
      const labelSha = keccak256(toUtf8Bytes(labels[i]));
      node = keccak256(Buffer.concat([Buffer.from(node.slice(2), 'hex'), Buffer.from(labelSha.slice(2), 'hex')]));
    }
    return node as `0x${string}`;
  }

  private isZeroAddress(addr: string): boolean {
    return /^0x0{40}$/i.test(addr);
  }
}


