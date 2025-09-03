import { createPublicClient, createWalletClient, custom, http, defineChain, encodeFunctionData, zeroAddress, type Address, type Chain, type PublicClient } from "viem";
import { identityRegistryAbi } from "@/lib/abi/identityRegistry";
import { createBundlerClient, createPaymasterClient } from 'viem/account-abstraction';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { encodeNonce } from 'permissionless/utils';

export type AgentInfo = {
  agentId: bigint;
  agentDomain: string;
  agentAddress: Address;
};

export type AgentAdapterConfig = {
  registryAddress: Address;
  rpcUrl?: string;
};

export function createAgentAdapter(config: AgentAdapterConfig) {
  function getPublicClient() {
    if (config.rpcUrl) {
      return createPublicClient({ transport: http(config.rpcUrl) });
    }
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      return createPublicClient({ transport: custom((window as any).ethereum) });
    }
    throw new Error('Missing RPC URL. Provide config.rpcUrl or ensure window.ethereum is available.');
  }

  async function getAgentCount(): Promise<bigint> {
    const publicClient = getPublicClient();
    return await publicClient.readContract({
      address: config.registryAddress,
      abi: identityRegistryAbi,
      functionName: "getAgentCount",
      args: [],
    }) as bigint;
  }

  async function getAgent(agentId: bigint): Promise<AgentInfo> {
    const publicClient = getPublicClient();
    const res = await publicClient.readContract({
      address: config.registryAddress,
      abi: identityRegistryAbi,
      functionName: "getAgent",
      args: [agentId],
    }) as any;
    return {
      agentId: BigInt(res.agentId ?? agentId),
      agentDomain: res.agentDomain,
      agentAddress: res.agentAddress as Address,
    };
  }

  async function resolveByDomain(agentDomain: string): Promise<AgentInfo> {
    const publicClient = getPublicClient();
    const res = await publicClient.readContract({
      address: config.registryAddress,
      abi: identityRegistryAbi,
      functionName: "resolveByDomain",
      args: [agentDomain],
    }) as any;
    return {
      agentId: BigInt(res.agentId),
      agentDomain: res.agentDomain,
      agentAddress: res.agentAddress as Address,
    };
  }

  async function resolveByAddress(agentAddress: Address): Promise<AgentInfo> {
    const publicClient = getPublicClient();
    const res = await publicClient.readContract({
      address: config.registryAddress,
      abi: identityRegistryAbi,
      functionName: "resolveByAddress",
      args: [agentAddress],
    }) as any;
    return {
      agentId: BigInt(res.agentId),
      agentDomain: res.agentDomain,
      agentAddress: res.agentAddress as Address,
    };
  }

  function getWalletClient() {
    if (typeof window === "undefined") return null;
    const eth: any = (window as any).ethereum;
    if (!eth) return null;
    const chain = inferChainFromProvider(eth, config.rpcUrl);
    return createWalletClient({ chain, transport: custom(eth) });
  }

  function inferChainFromProvider(provider: any, fallbackRpcUrl?: string): Chain {
    // Best-effort sync read; if it fails, default to mainnet + provided rpc
    const rpcUrl = fallbackRpcUrl || 'https://rpc.ankr.com/eth';
    let chainIdHex: string | undefined;
    try { chainIdHex = provider?.chainId; } catch {}
    const readChainId = () => {
      if (chainIdHex && typeof chainIdHex === 'string') return chainIdHex;
      return undefined;
    };
    const hex = readChainId();
    const id = hex ? parseInt(hex, 16) : 1;
    return defineChain({
      id,
      name: `chain-${id}`,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] }, public: { http: [rpcUrl] } },
    });
  }

  async function registerByDomainWithProvider(agentDomain: string, eip1193Provider: any): Promise<`0x${string}`> {
    const accounts = await eip1193Provider.request({ method: 'eth_accounts' }).catch(() => []);
    const from: Address = (accounts && accounts[0]) as Address;
    if (!from) throw new Error('No account from provider');
    const chain = inferChainFromProvider(eip1193Provider, config.rpcUrl);
    const walletClient = createWalletClient({ chain, transport: custom(eip1193Provider as any) });
    const hash = await walletClient.writeContract({
      address: config.registryAddress,
      abi: identityRegistryAbi,
      functionName: 'registerByDomain',
      args: [agentDomain, from],
      account: from,
      chain,
    });
    return hash as `0x${string}`;
  }

  return {
    // getPublicClient intentionally not exported; consumers use helpers below
    getAgentCount,
    getAgent,
    resolveByDomain,
    resolveByAddress,
    getWalletClient,
    registerByDomainWithProvider,
  };
}

// -------------------- AA helpers for Identity Registration (per user spec) --------------------

export const identityRegistrationAbi = [
  {
    type: 'function',
    name: 'newAgent',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'domain', type: 'string' },
      { name: 'agentAccount', type: 'address' },
    ],
    outputs: [
      { name: 'agentId', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'resolveByDomain',
    stateMutability: 'view',
    inputs: [{ name: 'agentDomain', type: 'string' }],
    outputs: [
      {
        name: 'agentInfo',
        type: 'tuple',
        components: [
          { name: 'agentId', type: 'uint256' },
          { name: 'agentDomain', type: 'string' },
          { name: 'agentAddress', type: 'address' },
        ],
      },
    ],
  },
  { type: 'function', name: 'agentOfDomain', stateMutability: 'view', inputs: [{ name: 'domain', type: 'string' }], outputs: [{ name: 'agent', type: 'address' }] },
  { type: 'function', name: 'getAgent', stateMutability: 'view', inputs: [{ name: 'domain', type: 'string' }], outputs: [{ name: 'agent', type: 'address' }] },
  { type: 'function', name: 'agents', stateMutability: 'view', inputs: [{ name: 'domain', type: 'string' }], outputs: [{ name: 'agent', type: 'address' }] },
] as const;

export function encodeNewAgent(domain: string, agentAccount: `0x${string}`): `0x${string}` {
  return encodeFunctionData({
    abi: identityRegistrationAbi,
    functionName: 'newAgent',
    args: [domain, agentAccount],
  });
}

export async function getAgentByDomain(params: {
  publicClient: PublicClient,
  registry: `0x${string}`,
  domain: string,
}): Promise<`0x${string}` | null> {
  const { publicClient, registry } = params;
  const domain = params.domain.trim().toLowerCase();
  const zero = '0x0000000000000000000000000000000000000000';
  try {
    const info: any = await publicClient.readContract({ address: registry, abi: identityRegistrationAbi as any, functionName: 'resolveByDomain' as any, args: [domain] });
    const addr = (info?.agentAddress ?? info?.[2]) as `0x${string}` | undefined;
    if (addr && addr !== zero) return addr;
  } catch {}
  const fns: Array<'agentOfDomain' | 'getAgent' | 'agents'> = ['agentOfDomain', 'getAgent', 'agents'];
  for (const fn of fns) {
    try {
      const addr = await publicClient.readContract({ address: registry, abi: identityRegistrationAbi as any, functionName: fn as any, args: [domain] }) as `0x${string}`;
      if (addr && addr !== zero) return addr;
    } catch {}
  }
  return null;
}

export async function getAgentInfoByDomain(params: {
  publicClient: PublicClient,
  registry: `0x${string}`,
  domain: string,
}): Promise<{ agentId: bigint; agentAddress: `0x${string}` } | null> {
  const { publicClient, registry } = params;
  const domain = params.domain.trim().toLowerCase();
  try {
    const info: any = await publicClient.readContract({
      address: registry,
      abi: identityRegistrationAbi as any,
      functionName: 'resolveByDomain' as any,
      args: [domain],
    });
    const agentId = BigInt(info?.agentId ?? info?.[0] ?? 0);
    const agentAddress = (info?.agentAddress ?? info?.[2]) as `0x${string}` | undefined;
    if (agentId > 0n && agentAddress) return { agentId, agentAddress };
  } catch {}
  return null;
}

export async function deploySmartAccountIfNeeded(params: {
  bundlerUrl: string,
  chain: Chain,
  account: { isDeployed: () => Promise<boolean> }
}): Promise<boolean> {
  const { bundlerUrl, chain, account } = params;
  const isDeployed = await account.isDeployed();
  if (isDeployed) return false;
  const pimlico = createPimlicoClient({ transport: http(bundlerUrl) } as any);
  const bundlerClient = createBundlerClient({ transport: http(bundlerUrl), paymaster: true as any, chain: chain as any, paymasterContext: { mode: 'SPONSORED' } } as any);
  const { fast } = await (pimlico as any).getUserOperationGasPrice();
  const userOperationHash = await (bundlerClient as any).sendUserOperation({ account, calls: [{ to: zeroAddress }], ...fast });
  await (bundlerClient as any).waitForUserOperationReceipt({ hash: userOperationHash });
  return true;
}

export async function sendSponsoredUserOperation(params: {
  bundlerUrl: string,
  chain: Chain,
  account: any,
  calls: { to: `0x${string}`; data?: `0x${string}`; value?: bigint }[],
}): Promise<`0x${string}`> {
  const { bundlerUrl, chain, account, calls } = params;
  const key1 = BigInt(Date.now());
  const nonce1 = encodeNonce({ key: key1, sequence: 0n });
  const paymasterClient = createPaymasterClient({ transport: http(bundlerUrl) } as any);
  const pimlicoClient = createPimlicoClient({ transport: http(bundlerUrl) } as any);
  const bundlerClient = createBundlerClient({ transport: http(bundlerUrl), paymaster: paymasterClient as any, chain: chain as any, paymasterContext: { mode: 'SPONSORED' } } as any);
  const { fast: fee } = await (pimlicoClient as any).getUserOperationGasPrice();
  const userOpHash = await (bundlerClient as any).sendUserOperation({ account, calls, nonce: nonce1 as any, paymaster: paymasterClient as any, ...fee });
  return userOpHash as `0x${string}`;
}

export async function ensureIdentityWithAA(params: {
  publicClient: PublicClient,
  bundlerUrl: string,
  chain: Chain,
  registry: `0x${string}`,
  domain: string,
  agentAccount: any,
}): Promise<`0x${string}`> {
  const { publicClient, bundlerUrl, chain, registry, domain, agentAccount } = params;
  const existing = await getAgentByDomain({ publicClient, registry, domain });
  console.info('********************* ensureIdentityWithAA: existing', existing);
  if (existing) return existing;

  console.log('********************* deploySmartAccountIfNeeded');
  await deploySmartAccountIfNeeded({ bundlerUrl, chain, account: agentAccount });
  const agentAddress = await agentAccount.getAddress();
  const data = encodeNewAgent(domain.trim().toLowerCase(), agentAddress as `0x${string}`);
  await sendSponsoredUserOperation({ bundlerUrl, chain, account: agentAccount, calls: [{ to: registry, data, value: 0n }] });
  const updated = await getAgentByDomain({ publicClient, registry, domain });
  console.log('********************* ensureIdentityWithAA: updated', updated);
  return (updated ?? agentAddress) as `0x${string}`;
}


