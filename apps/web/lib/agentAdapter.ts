import { createPublicClient, createWalletClient, custom, http, defineChain, encodeFunctionData, parseEventLogs, zeroAddress, type Address, type Chain, type PublicClient, parseCompactSignature } from "viem";
import { createBundlerClient, createPaymasterClient } from 'viem/account-abstraction';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { AIAgentENSClient, AIAgentIdentityClient } from '../../erc8004-agentic-trust-sdk';
import IdentityRegistryABI from '../../erc8004-src/abis/IdentityRegistry.json';

const registryAbi = IdentityRegistryABI as any;

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
  // Alias to a permissive type for legacy function names used by the web app
  const identityRegistryAbi = registryAbi as any;
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
      functionName: "getAgentCount" as any,
      args: [],
    }) as bigint;
  }

  async function getAgent(agentId: bigint): Promise<AgentInfo> {
    const publicClient = getPublicClient();
    const res = await publicClient.readContract({
      address: config.registryAddress,
      abi: identityRegistryAbi,
      functionName: "getAgent" as any,
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
      functionName: "resolveByDomain" as any,
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
      functionName: "resolveByAddress" as any,
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
      functionName: 'registerByDomain' as any,
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

export function encodeMintAgent(params: { to: `0x${string}`; uri?: string | null }): `0x${string}` {
  const { to, uri } = params;
  if (uri && uri.trim() !== '') {
    return encodeFunctionData({
      abi: registryAbi as any,
      functionName: 'mintWithURI' as any,
      args: [to, uri],
    });
  }
  return encodeFunctionData({
    abi: registryAbi as any,
    functionName: 'mint' as any,
    args: [to],
  });
}

export function encodeNewAgent(domain: string, agentAccount: `0x${string}`): `0x${string}` {
  return encodeFunctionData({
    abi: registryAbi as any,
    functionName: 'mintWithURI' as any,
    args: [agentAccount, domain],
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
    const info: any = await publicClient.readContract({ address: registry, abi: registryAbi as any, functionName: 'getMetadata' as any, args: [1n, '0x0000000000000000000000000000000000000000000000000000000000000000'] });
    const addr = (info?.agentAddress ?? info?.[2]) as `0x${string}` | undefined;
    if (addr && addr !== zero) return addr;
  } catch {}
  const fns: Array<'agentOfDomain' | 'getAgent' | 'agents'> = ['agentOfDomain', 'getAgent', 'agents'];
  for (const fn of fns) {
    try {
      const addr = await publicClient.readContract({ address: registry, abi: registryAbi as any, functionName: fn as any, args: [domain] }) as `0x${string}`;
      if (addr && addr !== zero) return addr;
    } catch {}
  }
  return null;
}

export async function getAgentInfoByName(params: {
  publicClient: PublicClient,
  registry: `0x${string}`,
  agentName: string,
}): Promise<{ agentId: bigint; agentAddress: `0x${string}` } | null> {
  const { publicClient, registry } = params;
  const agentName = params.agentName.trim().toLowerCase();
  try {
    const info: any = await publicClient.readContract({
      address: registry,
      abi: registryAbi as any,
      functionName: 'resolveByDomain' as any,
      args: [agentName],
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
  accountClient: any,
  calls: { to: `0x${string}`; data?: `0x${string}`; value?: bigint }[],
}): Promise<`0x${string}`> {
  const { bundlerUrl, chain, accountClient, calls } = params;
  const pimlicoClient = createPimlicoClient({ transport: http(bundlerUrl) } as any);
  const bundlerClient = createBundlerClient({ 
    transport: http(bundlerUrl), 
    paymaster: true as any,
    chain: chain as any, 
    paymasterContext: { mode: 'SPONSORED' } 
  } as any);
  const { fast: fee } = await (pimlicoClient as any).getUserOperationGasPrice();
  const userOpHash = await (bundlerClient as any).sendUserOperation({ 
    account: accountClient, 
    calls,
    ...fee 
  });
  return userOpHash as `0x${string}`;
}

export async function addAgentNameToOrg(params: {
  agentENSClient: AIAgentENSClient,
  bundlerUrl: string,
  chain: Chain,
  orgAccountClient: any,
  orgName: string,
  agentAccountClient: any,
  agentName: string,
  agentUrl?: string,
  agentAccount: `0x${string}`
}): Promise<`0x${string}`> {
  const { agentENSClient, bundlerUrl, chain, orgAccountClient, orgName, agentAccountClient, agentName, agentUrl, agentAccount } = params;

  // 1. Add agent name to org within ENS
  const { calls : orgCalls } = await agentENSClient.prepareAddAgentNameToOrgCalls({
    orgName,
    agentName,
    agentAddress: agentAccount
  });

  const bundlerClient = createBundlerClient({ transport: http(bundlerUrl), paymaster: true as any, chain: chain as any, paymasterContext: { mode: 'SPONSORED' } } as any);
  const userOpHash1 = await sendSponsoredUserOperation({
    bundlerUrl,
    chain,
    accountClient: orgAccountClient,
    calls: orgCalls
  });
  const { receipt: orgReceipt } = await (bundlerClient as any).waitForUserOperationReceipt({ hash: userOpHash1 });

  // 2. Set agent name info within ENS
  const { calls: agentCalls } = await agentENSClient.prepareSetAgentNameInfoCalls({
    orgName,
    agentName,
    agentAddress: agentAccount,
    agentUrl: agentUrl
  });

  const userOpHash2 = await sendSponsoredUserOperation({
    bundlerUrl,
    chain,
    accountClient: agentAccountClient,
    calls: agentCalls,
  });

  const { receipt: agentReceipt } = await (bundlerClient as any).waitForUserOperationReceipt({ hash: userOpHash2 });

  return userOpHash1 as `0x${string}`;
}

export async function createAIAgentIdentity(params: {
  agentIdentityClient: AIAgentIdentityClient,
  bundlerUrl: string,
  chain: Chain,
  agentAccount: any,
  name: string,
  tokenUri: string,
}): Promise<bigint> {
  const { bundlerUrl, chain, agentAccount, tokenUri } = params;

  await deploySmartAccountIfNeeded({ bundlerUrl, chain, account: agentAccount });

  const agentName = params.name
  const agentAddress = 'eip155:11155111:' + await agentAccount.getAddress()

  // Use AIAgentIdentityClient to encode calldata (like EAS SDK pattern), then send via bundler
  console.log('********************* createAIAgentIdentity: agentName', agentName);
  console.log('********************* createAIAgentIdentity: agentAddress', agentAddress);
  console.log('********************* createAIAgentIdentity: tokenUri', tokenUri);
  const { calls: registerCalls } = await params.agentIdentityClient.prepareRegisterCalls(agentName, agentAddress as `0x${string}`, tokenUri ?? '');

  console.log('********************* createAIAgentIdentity: registerCalls', registerCalls);
  const userOpHash = await sendSponsoredUserOperation({
    bundlerUrl,
    chain,
    accountClient: agentAccount,
    calls: registerCalls,
  });

  console.log('********************* createAIAgentIdentity: userOpHash', userOpHash);
  const bundlerClient = createBundlerClient({ transport: http(bundlerUrl), paymaster: true as any, chain: chain as any, paymasterContext: { mode: 'SPONSORED' } } as any);
  const { receipt: aaReceipt } = await (bundlerClient as any).waitForUserOperationReceipt({ hash: userOpHash });
 
  // Use AIAgentIdentityClient to extract agentId from receipt
  const tokenId = params.agentIdentityClient.extractAgentIdFromReceiptPublic(aaReceipt);

  return tokenId;
}



export async function setAgentIdentityRegistrationUri(params: {
  agentIdentityClient: AIAgentIdentityClient,
  bundlerUrl: string,
  chain: Chain,
  agentAccountClient: any,
  agentId: bigint,
  registrationUri: string,
}): Promise<string> {
  const { agentIdentityClient, bundlerUrl, chain, agentAccountClient, agentId, registrationUri } = params;

  const { calls: setUriCalls }  = await agentIdentityClient.prepareSetRegistrationUriCalls(agentId, registrationUri);

  const userOpHash = await sendSponsoredUserOperation({
    bundlerUrl,
    chain,
    accountClient: agentAccountClient,
    calls: setUriCalls,
  });
  const bundlerClient = createBundlerClient({ transport: http(bundlerUrl), paymaster: true as any, chain: chain as any, paymasterContext: { mode: 'SPONSORED' } } as any);
  const { receipt: aaReceipt } = await (bundlerClient as any).waitForUserOperationReceipt({ hash: userOpHash });
  console.log('********************* setAgentUri: aaReceipt', aaReceipt);

  return "success";
}

export async function setAgentNameUri(params: {
  agentENSClient: AIAgentENSClient,
  bundlerUrl: string,
  chain: Chain,
  agentAccountClient: any,
  agentName: string,
  agentUri: string,
}): Promise<string> {
  const { agentENSClient, bundlerUrl, chain, agentAccountClient, agentName, agentUri } = params;

  console.log('-------------------------> setAgentUri: agentName', agentName);
  console.log('-------------------------> setAgentUri: agentUri', agentUri);
  const { calls: setUriCalls }  = await agentENSClient.prepareSetNameUriCalls(agentName, agentUri);

  const userOpHash = await sendSponsoredUserOperation({
    bundlerUrl,
    chain,
    accountClient: agentAccountClient,
    calls: setUriCalls,
  });
  const bundlerClient = createBundlerClient({ transport: http(bundlerUrl), paymaster: true as any, chain: chain as any, paymasterContext: { mode: 'SPONSORED' } } as any);
  const { receipt: aaReceipt } = await (bundlerClient as any).waitForUserOperationReceipt({ hash: userOpHash });
  console.log('********************* setAgentUri: aaReceipt', aaReceipt);

  return "success";
}


export async function setAgentIdentity(params: {
  agentENSClient: AIAgentENSClient,
  bundlerUrl: string,
  chain: Chain,
  agentAccountClient: any,
  agentName: string,
  agentIdentity: BigInt,
}): Promise<string> {
  const { agentENSClient, bundlerUrl, chain, agentAccountClient, agentName, agentIdentity } = params;

  const { calls: setAgentIdentityCalls }  = await agentENSClient.prepareSetNameAgentIdentityCalls(agentName, agentIdentity);

  const userOpHash = await sendSponsoredUserOperation({
    bundlerUrl,
    chain,
    accountClient: agentAccountClient,
    calls: setAgentIdentityCalls,
  });
  const bundlerClient = createBundlerClient({ transport: http(bundlerUrl), paymaster: true as any, chain: chain as any, paymasterContext: { mode: 'SPONSORED' } } as any);
  const { receipt: aaReceipt } = await (bundlerClient as any).waitForUserOperationReceipt({ hash: userOpHash });

  return "success";
}


