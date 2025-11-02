'use client';
import * as React from 'react';
import { getAddress } from 'viem';
import { Box, Paper, TextField, Button, Grid, Chip, Checkbox, Dialog, DialogTitle, DialogContent, DialogActions, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, Stack, FormControlLabel, IconButton, Divider, Tooltip, Card, CardContent, CardHeader, Link, useTheme, useMediaQuery, FormLabel } from '@mui/material';
import { useWeb3Auth } from '@/components/Web3AuthProvider';
import { createPublicClient, createWalletClient, http, custom, keccak256, stringToHex, toHex, zeroAddress, encodeAbiParameters, namehash, encodeFunctionData, hexToString } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { sepolia, baseSepolia } from 'viem/chains';
import { toMetaMaskSmartAccount, Implementation, createDelegation, createCaveatBuilder } from '@metamask/delegation-toolkit';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { createBundlerClient } from 'viem/account-abstraction';
import { AddAgentModal } from './AddAgentModal';
import { DidWebModal } from './DidWebModal';
import { DidAgentModal } from './DidAgentModal';
import { TrustGraphModal } from './TrustGraphModal';
import { buildAgentCard } from '@/lib/agentCard';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import RefreshIcon from '@mui/icons-material/Refresh';
import EditIcon from '@mui/icons-material/Edit';
import ensService from '@/service/ensService';
import IpfsService from '@/service/ipfsService';
import IdentityRegistryABI from '@erc8004/sdk/abis/IdentityRegistry.json';
import { AIAgentENSClient, AIAgentIdentityClient, OrgIdentityClient } from '@erc8004/agentic-trust-sdk';
import { EthersAdapter } from '@erc8004/sdk';
import { 
	setAgentNameUri as adapterSetAgentNameUri, 
	setAgentIdentityRegistrationUri as adapterSetAgentIdentityRegistrationUri 
} from '@/lib/agentAdapter';
import ReputationRegistryABI from '@erc8004/sdk/abis/ReputationRegistry.json';


import { useAgentIdentityClient } from './AIAgentIdentityClientProvider';
import { useAgentIdentityClientFor, useAgentIdentityClients } from './AIAgentIdentityClientsProvider';
import { useAgentENSClient } from './AIAgentENSClientProvider';
import { useAgentENSClientFor } from './AIAgentENSClientsProvider';
import { useOrgIdentityClient } from './OrgIdentityClientProvider';
import { getExplorerUrl, getExplorerName, getIdentityRegistry, getBundlerUrl, getRpcUrl, getChainConfig, getChainIdHex, getViemChain, getNetworkType, CHAIN_CONFIGS } from '../config/chains';

const registryAbi = IdentityRegistryABI as any;
const reputationRegistryAbi = ReputationRegistryABI as any;

export type Agent = {
	chainId: number;
	agentId: string;
	agentAddress: string;
	agentName: string;
	owner?: string;
	metadataURI?: string | null;
	createdAtBlock: number;
	createdAtTime: number;
  description?: string | null;
  a2aEndpoint?: string | null;
  ensEndpoint?: string | null;
};

type AgentTableProps = { chainIdHex?: string; addAgentOpen?: boolean; onAddAgentClose?: () => void; onAgentIndexed?: (agentName?: string) => void; refreshKey?: number };

export function AgentTable({ chainIdHex, addAgentOpen: externalAddAgentOpen, onAddAgentClose, onAgentIndexed: externalOnAgentIndexed, refreshKey }: AgentTableProps) {
	const theme = useTheme();
	const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
	const [domain, setDomain] = React.useState("");
	const [address, setAddress] = React.useState("");
	const [agentId, setAgentId] = React.useState("");
	const [isLoading, setIsLoading] = React.useState(false);
	const [data, setData] = React.useState<{ rows: Agent[]; total: number; page: number; pageSize: number }>({ rows: [], total: 0, page: 1, pageSize: 50 });
	const [mineOnly, setMineOnly] = React.useState(false);
	const [selectedChainIdFilter, setSelectedChainIdFilter] = React.useState<number | null>(null);
	const [owned, setOwned] = React.useState<Record<string, boolean>>({});
	const [refreshing, setRefreshing] = React.useState(false);
    const { provider, address: eoa } = useWeb3Auth();

	// Discover state
	const [discoverQuery, setDiscoverQuery] = React.useState("");
	const [discoverLoading, setDiscoverLoading] = React.useState(false);
	const [discoverError, setDiscoverError] = React.useState<string | null>(null);
	const [discoverMatches, setDiscoverMatches] = React.useState<Set<string> | null>(null);
	const [discoverTrustScores, setDiscoverTrustScores] = React.useState<Record<string, { score: number; reasoning?: string }>>({});

	// Identity JSON modal state
	const [identityJsonOpen, setIdentityJsonOpen] = React.useState(false);
	const [identityJsonLoading, setIdentityJsonLoading] = React.useState(false);
	const [identityJsonError, setIdentityJsonError] = React.useState<string | null>(null);
	const [identityJsonData, setIdentityJsonData] = React.useState<any | null>(null);
	const [identityJsonText, setIdentityJsonText] = React.useState<string>("");
	const [identityJsonParseError, setIdentityJsonParseError] = React.useState<string | null>(null);
	const [identityEndpoints, setIdentityEndpoints] = React.useState<Array<{ name: string; endpoint: string; version?: string }>>([]);
	const [identityCurrentAgent, setIdentityCurrentAgent] = React.useState<Agent | null>(null);
	const [identityUpdateLoading, setIdentityUpdateLoading] = React.useState(false);
	const [identityUpdateError, setIdentityUpdateError] = React.useState<string | null>(null);
	const [identityTokenUri, setIdentityTokenUri] = React.useState<string | null>(null);

	// Cache: tokenURI validity by agentId (true=json/valid, false=invalid like HTML), null=unknown
	const [tokenUriValidById, setTokenUriValidById] = React.useState<Record<string, boolean | null>>({});

	// Cache of A2A endpoint JSON previews by agentId
	const [a2aJsonById, setA2aJsonById] = React.useState<Record<string, string | null>>({});

	// ENS details modal state
	const [ensDetailsOpen, setEnsDetailsOpen] = React.useState(false);
	const [ensDetailsLoading, setEnsDetailsLoading] = React.useState(false);
	const [ensDetailsError, setEnsDetailsError] = React.useState<string | null>(null);
	const [ensDetails, setEnsDetails] = React.useState<{ name: string; tokenId: string; urlText?: string | null; agentIdentity?: string | null; decodedIdentity?: { chainId: number; address: `0x${string}`; agentId: string } | null } | null>(null);

	// Agent INFO modal
	const [infoOpen, setInfoOpen] = React.useState(false);
	const [infoLoading, setInfoLoading] = React.useState(false);
	const [infoError, setInfoError] = React.useState<string | null>(null);
	const [infoData, setInfoData] = React.useState<{ agentId?: string | null; agentName?: string | null; agentAccount?: string | null; tokenUri?: string | null; chainId?: number; a2aEndpoint?: string | null } | null>(null);

	// Agent Card modal state
	const [cardOpen, setCardOpen] = React.useState(false);
	const [currentAgentForCard, setCurrentAgentForCard] = React.useState<Agent | null>(null);
	const [cardJson, setCardJson] = React.useState<string | null>(null);
	const [cardDomain, setCardDomain] = React.useState<string | null>(null);
	const [cardError, setCardError] = React.useState<string | null>(null);
	const [cardLoading, setCardLoading] = React.useState(false);
	const [cardFields, setCardFields] = React.useState<Record<string, any>>({});

	// Session modal state
	const [sessionOpen, setSessionOpen] = React.useState(false);
	const [sessionJson, setSessionJson] = React.useState<string | null>(null);
	const [sessionLoading, setSessionLoading] = React.useState(false);

	// Feedback modal state
	const [feedbackOpen, setFeedbackOpen] = React.useState(false);
	const [feedbackData, setFeedbackData] = React.useState<any[]>([]);
	const [feedbackLoading, setFeedbackLoading] = React.useState(false);
	const [feedbackError, setFeedbackError] = React.useState<string | null>(null);
	const [allFeedbackOpen, setAllFeedbackOpen] = React.useState(false);
	const [allFeedbackData, setAllFeedbackData] = React.useState<any[]>([]);
	const [allFeedbackLoading, setAllFeedbackLoading] = React.useState(false);
	const [allFeedbackError, setAllFeedbackError] = React.useState<string | null>(null);
	const [currentAgent, setCurrentAgent] = React.useState<Agent | null>(null);

	// Agent ENS names and metadata
	const [agentEnsNames, setAgentEnsNames] = React.useState<Record<string, string | null>>({});
	const [agentUrls, setAgentUrls] = React.useState<Record<string, string | null>>({});
	const [metadataAccounts, setMetadataAccounts] = React.useState<Record<string, `0x${string}` | null>>({});
	const [metadataNames, setMetadataNames] = React.useState<Record<string, string | null>>({});
	const [metadataNamesIsENS, setMetadataNamesIsENS] = React.useState<Record<string, boolean>>({});

	// ENS modal state
	const [ensOpen, setEnsOpen] = React.useState(false);
	const [ensData, setEnsData] = React.useState<{
		name: string | null;
		avatar: string | null;
		website: string | null;
		email: string | null;
		twitter: string | null;
		github: string | null;
		discord: string | null;
	} | null>(null);
	const [ensLoading, setEnsLoading] = React.useState(false);
	const [ensError, setEnsError] = React.useState<string | null>(null);
	const [ensCurrentAgent, setEnsCurrentAgent] = React.useState<Agent | null>(null);
	const [ensSubdomainName, setEnsSubdomainName] = React.useState('');
	const [ensParentName, setEnsParentName] = React.useState('');
	const [isCheckingWrapStatus, setIsCheckingWrapStatus] = React.useState(false);
	const [orgOwner, setOrgOwner] = React.useState<string | null>(null);

	// Modal states - use external if provided, otherwise use internal state
	const [internalAddAgentOpen, setInternalAddAgentOpen] = React.useState(false);
	const addAgentOpen = externalAddAgentOpen !== undefined ? externalAddAgentOpen : internalAddAgentOpen;
	const setAddAgentOpen = externalAddAgentOpen !== undefined ? (onAddAgentClose || (() => {})) : setInternalAddAgentOpen;
	const [didWebOpen, setDidWebOpen] = React.useState(false);
	const [didAgentOpen, setDidAgentOpen] = React.useState(false);
	const [currentAgentForDid, setCurrentAgentForDid] = React.useState<Agent | null>(null);
	const [currentAgentEnsName, setCurrentAgentEnsName] = React.useState<string | null>(null);

	// Trust graph modal state
	const [trustGraphOpen, setTrustGraphOpen] = React.useState(false);
	const [currentAgentForGraph, setCurrentAgentForGraph] = React.useState<Agent | null>(null);

	// Refs
	const saveTimeoutRef = React.useRef<number | undefined>(undefined);
	const agentIdentityClientRef = React.useRef<AIAgentIdentityClient | null>(null);
	const agentENSClientRef = React.useRef<AIAgentENSClient | null>(null);
	const orgIdentityClientRef = React.useRef<OrgIdentityClient | null>(null);

	// Client hooks
	const agentENSClient = useAgentENSClient();
	const agentIdentityClient = useAgentIdentityClient();
	const agentIdentityClients = useAgentIdentityClients();
	const orgIdentityClient = useOrgIdentityClient();

	function isValidRegistrationUri(uri?: string | null): boolean {
		if (!uri) return false;
		const u = String(uri).trim().replace(/^@+/, '');
		// Check if it starts with valid URI schemes
		if (/^data:application\/json/i.test(u) || /^https?:\/\//i.test(u) || /^ipfs:\/\//i.test(u)) {
			return true;
		}
		// Check if it's a valid JSON string
		if (u.startsWith('{') && u.endsWith('}')) {
			try {
				JSON.parse(u);
				return true;
			} catch {
				return false;
			}
		}
		return false;
	}


	async function openIdentityJson(row: Agent) {
		try {
			setIdentityCurrentAgent(row);
			setIdentityJsonOpen(true);
			setIdentityJsonLoading(true);
			setIdentityJsonError(null);
			setIdentityJsonData(null);
			setIdentityTokenUri(null);
			
			let fetched: any | null = null;
			
			// Check if metadataURI is an inline data URI (contains the JSON data directly)
			if (row.metadataURI && row.metadataURI.startsWith('data:application/json')) {
				try {
					console.info("............openIdentityJson: metadataURI is inline data:", row.metadataURI);
					const commaIndex = row.metadataURI.indexOf(',');
					if (commaIndex !== -1) {
						const jsonData = row.metadataURI.substring(commaIndex + 1);
						let parsed;
						
						// Check if it's base64 encoded or plain JSON
						if (row.metadataURI.startsWith('data:application/json;base64,')) {
							try {
								// Try base64 decode first
								const jsonString = Buffer.from(jsonData, 'base64').toString('utf-8');
								parsed = JSON.parse(jsonString);
							} catch (e) {
								// If base64 fails, try parsing as plain JSON
								console.info("............openIdentityJson: base64 decode failed, trying plain JSON");
								try {
									parsed = JSON.parse(jsonData);
								} catch (e2) {
									const decodedJson = decodeURIComponent(jsonData);
									parsed = JSON.parse(decodedJson);
								}
							}
						} else {
							// Plain JSON - try parsing directly first, then URL decode if needed
							try {
								parsed = JSON.parse(jsonData);
							} catch (e) {
								const decodedJson = decodeURIComponent(jsonData);
								parsed = JSON.parse(decodedJson);
							}
						}
						
						fetched = parsed;
						setIdentityTokenUri(row.metadataURI);
						console.info("............openIdentityJson: parsed inline data:", fetched);
					}
				} catch (e) {
					console.warn("............openIdentityJson: Failed to parse inline data URI:", e);
				}
			}
			// Check if metadataURI is a plain JSON string
			else if (row.metadataURI && row.metadataURI.trim().startsWith('{') && row.metadataURI.trim().endsWith('}')) {
				try {
					console.info("............openIdentityJson: metadataURI is plain JSON:", row.metadataURI);
					fetched = JSON.parse(row.metadataURI);
					setIdentityTokenUri(row.metadataURI);
					console.info("............openIdentityJson: parsed plain JSON:", fetched);
				} catch (e) {
					console.warn("............openIdentityJson: Failed to parse plain JSON:", e);
				}
			}
			
			// If we didn't get data from inline URI, fetch from storage
			if (!fetched) {
				// Get chain-specific configuration based on the agent's chainId
				const agentChainId = row.chainId;
				const rpcUrl = getRpcUrl(agentChainId);
				const identityRegistry = getIdentityRegistry(agentChainId);
				
				if (!rpcUrl || !identityRegistry) {
					console.warn(`Missing configuration for chain ${agentChainId}`);
					return;
				}
				
				const { ethers } = await import('ethers');
				const ethersProvider = new ethers.JsonRpcProvider(rpcUrl);
				const { EthersAdapter } = await import('@erc8004/sdk');
				const { ERC8004Client } = await import('@erc8004/sdk');
				const adapter = new EthersAdapter(ethersProvider);
				const erc8004Client = new ERC8004Client({
					adapter,
					addresses: {
						identityRegistry,
						reputationRegistry: '0x0000000000000000000000000000000000000000',
						validationRegistry: '0x0000000000000000000000000000000000000000',
						chainId: agentChainId,
					}
				});
				try {
					const uri = await erc8004Client.identity.getTokenURI(BigInt(row.agentId));
					setIdentityTokenUri(uri ?? null);
					if (uri) {
						const u = String(uri).trim();
						if (/^ipfs:\/\//i.test(u)) {
							// Resolve via local Next.js API download endpoint
							try {
								const cid = u.slice('ipfs://'.length).split('/')[0]?.trim();
								if (cid) {
									const res = await fetch(`/api/ipfs/download/${cid}`);
									fetched = await res.json().catch(() => null);
								}
							} catch {}
						} else if (/^https?:\/\//i.test(u)) {
							// Proxy through Next API to avoid mixed-content
							try {
								const res = await fetch(`/api/proxy?url=${encodeURIComponent(u)}`);
								fetched = await res.json().catch(() => null);
							} catch {}
						}
					}
				} catch {}
				// Fallback to SDK helper if direct fetch failed
				if (!fetched) {
					try { fetched = await erc8004Client.identity.getRegistrationFile(BigInt(row.agentId)); } catch {}
				}
			}
			
			if (fetched) setIdentityJsonData(fetched);
			try {
				setIdentityJsonText(JSON.stringify(fetched, null, 2));
				setIdentityJsonParseError(null);
			} catch {
				setIdentityJsonText("");
			}
			try {
				const eps = Array.isArray((fetched as any)?.endpoints) ? (fetched as any).endpoints : [];
				setIdentityEndpoints(
					eps.map((e: any) => ({
						name: String(e?.name ?? ''),
						endpoint: String(e?.endpoint ?? ''),
						version: e?.version ? String(e.version) : ''
					}))
				);
			} catch {
				setIdentityEndpoints([]);
			}
		} catch (e: any) {
			setIdentityJsonError(e?.message || 'Failed to load Identity JSON');
		} finally {
			setIdentityJsonLoading(false);
		}
	}

	async function updateIdentityRegistration() {
		try {
			if (!identityJsonData || !identityCurrentAgent) return;
			// Allow updates only for owned agents to avoid signature/authorization errors
			if (!owned[identityCurrentAgent.agentId]) {
				throw new Error('You can only update identities for agents you own');
			}
			setIdentityUpdateLoading(true);
			setIdentityUpdateError(null);
			// Merge endpoints into JSON
			const merged: any = { ...(identityJsonData || {}) , endpoints: identityEndpoints };
			// Upload to IPFS
			console.log('********************* updateIdentityRegistration: merged', merged);
			const { url } = await IpfsService.uploadJson({ data: merged, filename: `agent-${identityCurrentAgent.agentId}-registration.json` });
			console.log('********************* updateIdentityRegistration: url', url);
			
			// Resolve agent ENS name - get the correct client for this agent's chain
			const chainIdHex = getChainIdHex(identityCurrentAgent.chainId) || '0xaa36a7';
			const agentIdentityClient = agentIdentityClients[chainIdHex] || null;
			if (!agentIdentityClient) throw new Error(`Identity client unavailable for chain ${identityCurrentAgent.chainId}`);

			console.log('********************* updateIdentityRegistration: agentId', identityCurrentAgent.agentId);
			const agentName = await agentIdentityClient.getAgentName(BigInt(identityCurrentAgent.agentId));
			console.log('********************* updateIdentityRegistration: agentName', agentName);
			if (!agentName) throw new Error('Agent ENS name not found');
			// Validate current EOA is the owner/signatory of the agent account
			console.log('********************* updateIdentityRegistration: identityCurrentAgent.agentAddress', identityCurrentAgent.agentAddress);
			const accountOwner = await agentIdentityClient.getAgentEoaByAgentAccount(identityCurrentAgent.agentAddress as `0x${string}`);
			if (!eoa || !accountOwner || accountOwner.toLowerCase() !== eoa.toLowerCase()) {
				console.log('********************* updateIdentityRegistration: accountOwner', accountOwner, eoa);
				throw new Error('Connected wallet is not the owner of this agent account');
			}
			// Build agent account client for AA
			if (!provider || !eoa) throw new Error('Not connected');
			
		// Get chain-specific configuration based on the agent's chainId
		const agentChainId = identityCurrentAgent.chainId;
		const rpcUrl = getRpcUrl(agentChainId);
		const chain = getViemChain(agentChainId);
		const bundlerUrl = getBundlerUrl(agentChainId);
		
		if (!rpcUrl || !chain || !bundlerUrl) {
			throw new Error(`Missing configuration for chain ${agentChainId}`);
		}
			
			const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
			const walletClient = createWalletClient({ chain: chain as any, transport: custom(provider as any), account: eoa as `0x${string}` });
			const agentAccountClient = await toMetaMaskSmartAccount({
				address: identityCurrentAgent.agentAddress as `0x${string}`,
				client: publicClient,
				implementation: Implementation.Hybrid,
				signatory: { walletClient },
			} as any);

			await adapterSetAgentIdentityRegistrationUri({
				agentIdentityClient: agentIdentityClient as any,
				bundlerUrl,
				chain: chain as any,
				agentAccountClient,
				agentId: BigInt(identityCurrentAgent.agentId),
				registrationUri: url,
			});
		} catch (e: any) {
			setIdentityUpdateError(e?.message || 'Failed to update');
		} finally {
			setIdentityUpdateLoading(false);
		}
	}

	function handleEndpointFieldChange(index: number, field: 'name' | 'endpoint' | 'version', value: string) {
		setIdentityEndpoints((prev) => {
			const next = [...prev];
			next[index] = { ...next[index], [field]: value };
			return next;
		});
	}

	function addEndpointRow() {
		setIdentityEndpoints((prev) => [...prev, { name: '', endpoint: '', version: '' }]);
	}

	function removeEndpointRow(index: number) {
		setIdentityEndpoints((prev) => {
			const next = [...prev];
			next.splice(index, 1);
			return next;
		});
	}

	async function openAgentInfo(row: Agent) {
		try {
			setInfoOpen(true);
			setInfoLoading(true);
			setInfoError(null);
			setInfoData(null);
			const agentId = row.agentId;
			const chainId = row.chainId;
			console.info("+++++++++++++++++++ openAgentInfo: row", row);
			console.info("+++++++++++++++++++ openAgentInfo: agentId", agentId, "chainId", chainId, "type:", typeof chainId);
			const agentIdNum = BigInt(agentId);
			
			// Get the correct agent identity client for this chain
			const chainIdHex = getChainIdHex(chainId);
			if (!chainIdHex) {
				throw new Error(`No chain configuration found for chainId ${chainId}. Cannot fetch agent account.`);
			}
			console.info("+++++++++++++++++++ openAgentInfo: chainIdHex", chainIdHex, "for chainId", chainId);
			console.info("+++++++++++++++++++ openAgentInfo: available clients", Object.keys(agentIdentityClients));


			const client = agentIdentityClients[chainIdHex];
			if (!client) {
				throw new Error(`No identity client available for chainId ${chainId} (${chainIdHex})`);
			}
			
			let name: string | null = null;
			let account: string | null = null;
			let tokenUri: string | null = null;
			
			// Try to use the agent name from the row if available
			if (row.agentName) {
				name = row.agentName;
				console.info("+++++++++++++++++++ openAgentInfo: using agentName from row", name);
			}
			
			// Get the token URI from the database row
			if (row.metadataURI) {
				tokenUri = row.metadataURI;
				console.info("+++++++++++++++++++ openAgentInfo: using tokenUri from row", tokenUri);
			}
			
			try {
				console.info("++++++++++++++++++++++++ openAgentInfo: get agent name from agentIdentityClient for chain", chainId, "chainIdHex", chainIdHex);
				// client is guaranteed to exist here due to check above
				console.info(`openAgentInfo: Fetching agent account for agentId ${agentIdNum} on chain ${chainId} (${chainIdHex})`);
				
				// Only fetch from chain if we don't have it from the row
				if (!name) {
					name = await client.getAgentName(agentIdNum);
				}
				account = await client.getAgentAccount(agentIdNum);
				
				// Fetch token URI from chain if not available from database
				if (!tokenUri) {
					try {
						tokenUri = await (client as any).getTokenURI(agentIdNum);
						console.info("+++++++++++++++++++ openAgentInfo: fetched tokenUri from chain", tokenUri);
					} catch (e) {
						console.warn("Failed to fetch token URI from chain:", e);
					}
				}
			} catch (e: any) {
				console.warn("Failed to get agent info from identity client:", e);
				// If we have the agent name from the database, we can still show that
				if (!name && row.agentName) {
					name = row.agentName;
				}
			}

			console.info("++++++++++++++++++++ openAgentInfo: name", name, "account", account, "tokenUri", tokenUri);

			setInfoData({ agentId: agentId, agentName: name || null, agentAccount: account || null, tokenUri: tokenUri || null, chainId: chainId, a2aEndpoint: row.a2aEndpoint || null });
		} catch (e: any) {
			setInfoError(e?.message || 'Failed to load agent info');
		} finally {
			setInfoLoading(false);
		}
	}

	function decodeAgentIdentity(registryHex?: string | null): { chainId: number; address: `0x${string}`; agentId: string } | null {
		try {
			if (!registryHex || !/^0x[0-9a-fA-F]+$/.test(registryHex)) return null;
			const hex = registryHex.slice(2);
			// version(1) ns(1) chainId(4) address(20) idLen(1) id(var)
			const chainIdHex = hex.slice(4, 12);
			const chainId = parseInt(chainIdHex, 16);
			const addressHex = hex.slice(12, 52);
			const idLen = parseInt(hex.slice(52, 54), 16);
			const idHex = hex.slice(54, 54 + idLen * 2);
			return { chainId, address: (`0x${addressHex}`) as `0x${string}`, agentId: BigInt(`0x${idHex || '0'}`).toString() };
		} catch { return null; }
	}

	async function openEnsDetails(row: Agent) {
		try {
			setEnsDetailsOpen(true);
			setEnsDetailsLoading(true);
			setEnsDetailsError(null);
			setEnsDetails(null);
			const name = (row.ensEndpoint || agentEnsNames[row.agentAddress]) as string | undefined;
			if (!name) { setEnsDetailsError('No ENS name'); return; }
			const tokenId = BigInt(namehash(name)).toString();
			const urlText = await ensService.getTextRecord(name, 'url', sepolia, process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL as string);
			const agentIdentityHex = await ensService.getTextRecord(name, 'agent-identity', sepolia, process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL as string);
			const decoded = decodeAgentIdentity(agentIdentityHex);
			setEnsDetails({ name, tokenId, urlText, agentIdentity: agentIdentityHex ?? null, decodedIdentity: decoded });
		} catch (e: any) {
			setEnsDetailsError(e?.message || 'Failed to load ENS details');
		} finally {
			setEnsDetailsLoading(false);
		}
	}

	// Helper function to clean ENS name
	const cleanEnsName = (name: string) => {
		return name.replace(/^ENS:\s*/, '').replace(/\.eth$/i, '').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
	};

	// Function to fetch ENS name for an agent address
	const fetchEnsName = async (agentAddress: string) => {
		try {
			const ensName = await ensService.getEnsName(agentAddress, sepolia);
			setAgentEnsNames(prev => ({
				...prev,
				[agentAddress]: ensName
			}));
		} catch (error) {
			console.error(`Error fetching ENS name for ${agentAddress}:`, error);
			setAgentEnsNames(prev => ({
				...prev,
				[agentAddress]: null
			}));
		}
	};

	// Function to fetch agent URL from ENS
	const fetchAgentUrl = React.useCallback(async (agentName: string) => {
		try {
			if (!agentENSClient) return;
			const url = await agentENSClient.getAgentUrlByName(agentName);
			setAgentUrls(prev => ({
				...prev,
				[agentName]: url
			}));
		} catch (error) {
			console.error(`Error fetching agent URL for ${agentName}:`, error);
			setAgentUrls(prev => ({
				...prev,
				[agentName]: null
			}));
		}
	}, [agentENSClient]);

	
	// Fetch ENS names when data changes
	/*
  React.useEffect(() => {
      if (data?.rows && Array.isArray(data.rows)) {
          data.rows.forEach(async (row) => {
              try {

				// Get the correct agent identity client based on the row's chainId
				const chainIdHex = getChainIdHex(row.chainId);
                
                // Only proceed if we have a valid chain configuration for this chainId
                if (!chainIdHex) {
                    console.warn(`AgentTable: No chain configuration found for chainId ${row.chainId}, skipping getAgentAccount`);
                    return; // Skip this row
                }

                  const agentIdentityClient = agentIdentityClients[chainIdHex];
                  if (agentIdentityClient) {
                      const agentIdNum = BigInt(row.agentId);
                      
                      // Fetch account address using the row's chainId
                      console.info(`AgentTable: Fetching agent account for agentId ${row.agentId} on chain ${row.chainId} (${chainIdHex})`);
                      const acct = await agentIdentityClient.getAgentAccount(agentIdNum);
                      setMetadataAccounts(prev => ({ ...prev, [row.agentId]: acct ?? null }));
                      
                      // Fetch name if database has null/empty name
                      if (!row.agentName || row.agentName.trim() === '') {
							const name = await agentIdentityClient.getAgentName(agentIdNum);
                          if (name) {
                              setMetadataNames(prev => ({ ...prev, [row.agentId]: name }));
                              const isENS = name.endsWith('.eth');
                              setMetadataNamesIsENS(prev => ({ ...prev, [row.agentId]: isENS }));
                          }
                      }
                      
                      // Fetch ENS name for the account address if not already fetched
                      if (acct && (!agentEnsNames[acct] || agentEnsNames[acct] === null)) {
                          fetchEnsName(acct);
                      }
                  } else {
                      console.warn("............AgentTable: No client found for chain:", row.chainId, "chainIdHex:", chainIdHex);
                  }
              } catch (e) {
                  console.warn("............AgentTable: Error fetching agent name/account:", e);
              }
              // Fetch ENS name for agent address if not already fetched
              if (!agentEnsNames[row.agentAddress]) {
                  fetchEnsName(row.agentAddress);
              }
          });
      }
  }, [data]);
  */

   /*
	React.useEffect(() => {
		try {
			const rows = data?.rows || [];
			rows.forEach((row) => {
				const uri = row.metadataURI;
				//if (!isValidRegistrationUri(uri)) {
				//	if (tokenUriValidById[row.agentId] === undefined) setTokenUriValidById((p) => ({ ...p, [row.agentId]: false }));
				//	return;
				//}
				if (tokenUriValidById[row.agentId] !== undefined) return;
				const target = (() => {
					if (!uri) return null;
					const u = String(uri).trim().replace(/^@+/, '');
					if (/^ipfs:\/\//i.test(u)) {
						try {
							const rest = u.slice('ipfs://'.length);
							const cid = rest.split('/')[0]?.trim();
							if (cid) return `/api/ipfs/download/${cid}`;
						} catch {}
						return null;
					}
					return u;
				})();
        if (!target) {
          if (tokenUriValidById[row.agentId] === undefined) setTokenUriValidById((p) => ({ ...p, [row.agentId]: null }));
          return;
        }


				fetch(target)
					.then(async (res) => {
						// Try JSON; on failure, inspect error message and fallback to text heuristics
						try {
							await res.clone().json();
							return true;
						} catch (err: any) {
							const msg = typeof err?.message === 'string' ? err.message : '';
							// Common browser error message when HTML is returned
							if (/Unexpected token\s*</i.test(msg) || /not valid JSON/i.test(msg)) return false;
							try {
								const text = await res.text();
								const trimmed = (text || '').trim();
								if (/^</.test(trimmed)) return false; // looks like HTML/XML
								// If it looks like JSON text, try to parse
								if (/^[{\[]/.test(trimmed)) {
									try { JSON.parse(trimmed); return true; } catch {}
								}
							} catch {}
							return false;
						}
					})
					.then((ok) => {
						setTokenUriValidById((p) => ({ ...p, [row.agentId]: ok ?? null }));
					})
					.catch(() => setTokenUriValidById((p) => ({ ...p, [row.agentId]: null })));
						});
					 } catch {}
					}

		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [data?.rows]);
	*/

	/*
	React.useEffect(() => {
		try {
			const rows = data?.rows || [];
			rows.forEach((row) => {
				const url = row.a2aEndpoint;
				if (!url || !/^https?:\/\//i.test(String(url))) return;
				if (a2aJsonById[row.agentId] !== undefined) return;
				// Fetch preview JSON
				try{

				
					fetch(String(url))
					.then((res) => res.json().catch(() => null))
					.then((json) => {
						let preview: string | null = null;
						if (json && typeof json === 'object' && !Array.isArray(json)) {
							try {
								preview = JSON.stringify(json, null, 2);
								if (preview.length > 800) preview = preview.slice(0, 800) + '\n...';
							} catch {}
						}
						setA2aJsonById((prev) => ({ ...prev, [row.agentId]: preview }));
					})
					.catch(() => {
						setA2aJsonById((prev) => ({ ...prev, [row.agentId]: null }));
					});
				}
				catch {}
			});
		} catch {}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [data?.rows]);
	*/

	// Check if parent ENS domain is already wrapped
	const checkParentWrapStatus = async () => {
		const orgName = process.env.NEXT_PUBLIC_ETH_SEPOLIA_ENS_NAME as string;
		if (!orgName) {
			console.log('❌ NEXT_PUBLIC_ETH_SEPOLIA_ENS_NAME not configured');
			setEnsError('Parent ENS name not configured');
			return;
		}

		console.log('🔍 Starting wrap status check...');
		console.log('📋 Configuration:', {
			orgName,
			chainName: sepolia.name,
			chainId: sepolia.id,
			ENS_PRIVATE_KEY: process.env.NEXT_PUBLIC_ENS_PRIVATE_KEY ? `${process.env.NEXT_PUBLIC_ENS_PRIVATE_KEY.slice(0, 10)}...` : 'NOT_SET'
		});

		setIsCheckingWrapStatus(true);
		setEnsError(null);

		try {
			const cleanName = cleanEnsName(orgName);
			console.log('🧹 Cleaned ENS name:', cleanName);
			
			// Create public client for reading contract data
			const publicClient = createPublicClient({
				chain: sepolia,
				transport: http(process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL as string),
			});

			const agentIdentityClient = agentIdentityClientRef.current;
			if (agentIdentityClient) {

			}

			let orgAccount = '0x0000000000000000000000000000000000000000'
			const orgIdentityClient = orgIdentityClientRef.current;
			if (orgIdentityClient) {
				orgAccount = await orgIdentityClient.getOrgAccountByName(orgName) as `0x${string}`;
			}
			
			
			if (orgAccount === '0x0000000000000000000000000000000000000000') {
				console.log('❌ Parent domain does not exist or has no owner');
				setEnsError(`Parent domain "${cleanName}.eth" does not exist or has no owner`);
				return;
			}
			
			setOrgOwner(orgAccount);

		} catch (error) {
			console.error('❌ Error checking wrap status:', error);
			setEnsError(`Failed to check wrap status: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			setIsCheckingWrapStatus(false);
		}
	};

	function scheduleAutoSave() {
		if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
		saveTimeoutRef.current = window.setTimeout(() => { autoSave(); }, 600) as any;
	}

	function buildMerged(base: any) {
		console.info("&&&&&&&&&&&& buildMerged: base: ", base)
		const obj = base || {};
		const name = cardFields.name || obj.name;
		const description = cardFields.description || obj.description;
		const url = cardFields.url || obj.url;
		const version = cardFields.version || obj.version;
		const preferredTransport = cardFields.preferredTransport || obj.preferredTransport;
		const protocolVersion = cardFields.protocolVersion || obj.protocolVersion;
		const skills: any[] = Array.isArray(cardFields.skills) ? cardFields.skills.map((s: any, idx: number) => {
			const baseSkills = Array.isArray((obj as any).skills) ? (obj as any).skills : [];
			const existing = (s?.id ? baseSkills.find((x: any) => x?.id === s.id) : baseSkills[idx]) || {};
			return {
				...existing,
				id: s?.id ?? existing.id,
				name: s?.name ?? existing.name,
				description: s?.description ?? existing.description,
				tags: Array.isArray(s?.tags) ? s.tags.filter(Boolean) : (Array.isArray(existing?.tags) ? existing.tags : []),
				examples: Array.isArray(s?.examples) ? s.examples.filter(Boolean) : (Array.isArray(existing?.examples) ? existing.examples : []),
				inputModes: Array.isArray(s?.inputModes) ? s.inputModes.filter(Boolean) : (Array.isArray(existing?.inputModes) ? existing.inputModes : []),
				outputModes: Array.isArray(s?.outputModes) ? s.outputModes.filter(Boolean) : (Array.isArray(existing?.outputModes) ? existing.outputModes : []),
			};
		}) : (() => {
			// fallback to legacy single-skill fields, preserve existing when present
			const existing0 = Array.isArray((obj as any).skills) ? (obj as any).skills[0] || {} : {};
			const fallback = {
				id: cardFields.skillId || existing0.id,
				name: cardFields.skillName || existing0.name,
				description: cardFields.skillDesc || existing0.description,
				tags: String(cardFields.skillTags || '').split(',').map((x: string) => x.trim()).filter(Boolean).concat(Array.isArray(existing0.tags) ? existing0.tags : []).filter(Boolean),
				examples: String(cardFields.skillExamples || '').split(/\n|,/).map((x: string) => x.trim()).filter(Boolean).concat(Array.isArray(existing0.examples) ? existing0.examples : []).filter(Boolean),
				inputModes: Array.isArray(existing0.inputModes) ? existing0.inputModes : [],
				outputModes: Array.isArray(existing0.outputModes) ? existing0.outputModes : [],
			};
			return [fallback];
		})();
		const trustModels = Array.isArray(cardFields.trustModels)
			? cardFields.trustModels
			: String(cardFields.trustModels || '')
				.split(',')
				.map((x: string) => x.trim())
				.filter(Boolean);
		const capabilities = { 
			streaming: !!cardFields.capStream,
			pushNotifications: !!cardFields.capPush,
			stateTransitionHistory: !!cardFields.capStateTransitionHistory
		};
		const defaultInputModes = Array.isArray(cardFields.defaultInputModes)
			? cardFields.defaultInputModes.filter(Boolean)
			: String(cardFields.defaultInputModes || '').split(',').map((x: string) => x.trim()).filter(Boolean);
		const defaultOutputModes = Array.isArray(cardFields.defaultOutputModes)
			? cardFields.defaultOutputModes.filter(Boolean)
			: String(cardFields.defaultOutputModes || '').split(',').map((x: string) => x.trim()).filter(Boolean);
		const provider = (cardFields.providerOrganization || cardFields.providerUrl) ? {
			organization: cardFields.providerOrganization || undefined,
			url: cardFields.providerUrl || undefined
		} : undefined;
		const ordered: any = {};
		// Exact requested order
		ordered.name = name;
		ordered.description = description;
		ordered.url = url;
		ordered.version = version;
		ordered.preferredTransport = preferredTransport;
		ordered.protocolVersion = protocolVersion;
		ordered.skills = skills;
		if (obj?.registrations) {
			const regs = Array.isArray(obj.registrations) ? obj.registrations : [];
			ordered.registrations = regs.map((r: any) => ({
				...r,
				signature: r?.signature,
			}));
		}
		ordered.trustModels = trustModels;
		ordered.capabilities = capabilities;
		ordered.defaultInputModes = defaultInputModes;
		ordered.defaultOutputModes = defaultOutputModes;
		if (provider) ordered.provider = provider;
		if (cardFields.supportsAuthenticatedExtendedCard !== undefined) {
			ordered.supportsAuthenticatedExtendedCard = cardFields.supportsAuthenticatedExtendedCard;
		}

		return ordered;
	}

	async function autoSave() {
		if (!cardDomain) return;
		try {
			const base = cardJson ? JSON.parse(cardJson) : {};
			const merged = buildMerged(base);
			// Note: agent-cards API endpoint removed - cards are now stored client-side only
			const json = JSON.stringify(merged, null, 2);
			setStoredCard(cardDomain, json);
			setCardJson(json);
		} catch (e: any) {
			setCardError(e?.message ?? 'Save failed');
		}
	}

	function handleFieldChange(key: string, value: any) {
		setCardFields((f) => ({ ...f, [key]: value }));
		scheduleAutoSave();
	}

	async function populateFieldsFromObj(obj: any) {
		const skills = Array.isArray(obj?.skills) ? obj.skills : [];
		
		// Regenerate signature if it's truncated
		let regeneratedSignature = null;
		if (obj?.registrations?.[0]?.signature && obj.registrations[0].signature.includes('…')) {
			try {
				// Get the domain from the card or use a default
				const domain = cardDomain || 'example.com';
				console.log('Signature is truncated, regenerating for domain:', domain);
				
				// Regenerate signature by signing the domain
				if (provider) {
					const signature = await provider.request({
						method: 'personal_sign',
						params: [domain, address],
					});
					regeneratedSignature = signature;
					console.log('Regenerated signature:', signature);
				}
			} catch (e) {
				console.log('Could not regenerate signature:', e);
			}
		}
		
		setCardFields({
			name: obj?.name ?? '',
			description: obj?.description ?? '',
			url: obj?.url ?? '',
			version: obj?.version ?? '',
			preferredTransport: obj?.preferredTransport ?? '',
			protocolVersion: obj?.protocolVersion ?? '',
			trustModels: Array.isArray(obj?.trustModels) ? obj.trustModels : [],
			capStream: !!obj?.capabilities?.streaming,
			capPush: !!obj?.capabilities?.pushNotifications,
			capStateTransitionHistory: !!obj?.capabilities?.stateTransitionHistory,
			defaultInputModes: Array.isArray(obj?.defaultInputModes) ? obj.defaultInputModes : [],
			defaultOutputModes: Array.isArray(obj?.defaultOutputModes) ? obj.defaultOutputModes : [],
			providerOrganization: obj?.provider?.organization ?? '',
			providerUrl: obj?.provider?.url ?? '',
			supportsAuthenticatedExtendedCard: !!obj?.supportsAuthenticatedExtendedCard,
			skills: skills.map((s: any) => ({
				id: s?.id ?? '',
				name: s?.name ?? '',
				description: s?.description ?? '',
				tags: Array.isArray(s?.tags) ? s.tags : (typeof s?.tags === 'string' ? [s.tags] : []),
				examples: Array.isArray(s?.examples) ? s.examples : (typeof s?.examples === 'string' ? [s.examples] : []),
				inputModes: Array.isArray(s?.inputModes) ? s.inputModes : [],
				outputModes: Array.isArray(s?.outputModes) ? s.outputModes : [],
			})),
		});
		
		// If we regenerated a signature, update the card
		if (regeneratedSignature && obj?.registrations?.[0]) {
			obj.registrations[0].signature = regeneratedSignature;
			// Trigger a re-render with the updated signature
			const updatedJson = JSON.stringify(obj, null, 2);
			setCardJson(updatedJson);
		}
	}


		async function fetchData(page = 1, overrides?: { name?: string; address?: string; agentId?: string; chainId?: number }) {
		setIsLoading(true);
		console.info("&&&&&&&&&&&& fetchData: page: ", page)
		console.info("&&&&&&&&&&&& fetchData: overrides: ", overrides)
			const url = new URL("/api/agents", window.location.origin);
			const nameFilter = overrides?.name ?? domain;
			const addressFilter = overrides?.address ?? address;
			const idFilter = overrides?.agentId ?? agentId;
			const chainIdFilter = overrides?.chainId ?? selectedChainIdFilter;
			
			if (nameFilter) url.searchParams.set("name", nameFilter);
			if (addressFilter) url.searchParams.set("address", addressFilter);
			if (idFilter) url.searchParams.set("id", idFilter);
			if (chainIdFilter) url.searchParams.set("chainId", String(chainIdFilter));
        url.searchParams.set("page", String(page));
        url.searchParams.set("pageSize", "50");
		try {

				const res = await fetch(url);
                if (!res.ok) {
                    setData({ page: page, pageSize: 50, total: 0, rows: [] });
					return;
				}
				const text = await res.text();
				let json: any = null;
				if (text && text.trim().length > 0) {
					try { json = JSON.parse(text); } catch { json = null; }
				}
				
				// Ensure the response has the correct structure
                const responseData = json ?? { page, pageSize: 50, total: 0, rows: [] };
                setData({
                    page: responseData.page ?? page,
                    pageSize: responseData.pageSize ?? 50,
                    total: responseData.total ?? 0,
                    rows: Array.isArray(responseData.rows) ? responseData.rows : []
                });
		} finally {
			setIsLoading(false);
		}
	}

	React.useEffect(() => { fetchData(); }, []);
	
	// Refresh when refreshKey changes
	React.useEffect(() => {
		if (refreshKey !== undefined && refreshKey > 0) {
			fetchData(data.page);
		}
	}, [refreshKey]);

    React.useEffect(() => {
        (async () => {
            try {
                const { ethers } = await import('ethers');
				const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL as string);
                const adapter = new EthersAdapter(provider);

				agentENSClientRef.current = agentENSClient;
                agentIdentityClientRef.current = agentIdentityClient;
                orgIdentityClientRef.current = orgIdentityClient;
            } catch {}
        })();
        async function computeOwnership() {
            if (!Array.isArray(data.rows) || data.rows.length === 0 || !provider || !eoa) { setOwned({}); return; }
				const rpcUrl = process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL as string;
            const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
            const entries: Record<string, boolean> = {};
            for (const row of data.rows) {
                try {
                    const addr = row.agentAddress as `0x${string}`;
                    const code = await publicClient.getBytecode({ address: addr });
                    if (!code || code === '0x') {
                        // Agent is an EOA; ownership = EOA matches connected EOA
                        entries[row.agentId] = (eoa?.toLowerCase() === addr.toLowerCase());
                    } else {
                        // Contract: check owner() / getOwner() / owners()
                        let controller: string | null = null;
                        try {
                            controller = await publicClient.readContract({
                                address: addr,
                                abi: [{ name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }],
                                functionName: 'owner' as any,
                                args: [],
                            }) as `0x${string}`;
                        } catch {}
                        if (!controller) {
                            try {
                                controller = await publicClient.readContract({
                                    address: addr,
                                    abi: [{ name: 'getOwner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }],
                                    functionName: 'getOwner' as any,
                                    args: [],
                                }) as `0x${string}`;
                            } catch {}
                        }
                        if (!controller) {
                            try {
                                const owners = await publicClient.readContract({
                                    address: addr,
                                    abi: [{ name: 'owners', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address[]' }] }],
                                    functionName: 'owners' as any,
                                    args: [],
                                }) as `0x${string}`[];
                                controller = owners?.[0] ?? null;
                            } catch {}
                        }
                        entries[row.agentId] = !!controller && controller.toLowerCase() === eoa?.toLowerCase();
                    }
                } catch {}
            }
            setOwned(entries);
        }
        computeOwnership();
    }, [data, provider, eoa]);

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		fetchData(1);
	}

	// Auto-refresh when chain filter changes
	React.useEffect(() => {
		// Skip initial mount - let the existing useEffect handle that
		fetchData(1);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedChainIdFilter]);

	// Fetch agent URLs for agents with ENS names
	React.useEffect(() => {
		if (!data?.rows || !agentENSClient) return;
		
		data.rows.forEach((row) => {
			const acct = metadataAccounts[row.agentId] || (row.agentAddress as `0x${string}`);
			const ens = row.ensEndpoint || agentEnsNames[acct] || agentEnsNames[row.agentAddress];
			
			// Only fetch if we have an ENS name and haven't fetched/stored it yet
			if (ens && !(ens in agentUrls)) {
				fetchAgentUrl(ens);
			}
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [data?.rows, agentENSClient, agentEnsNames, metadataAccounts, fetchAgentUrl]);

	async function handleRefresh() {
		setRefreshing(true);
		try {
			// Trigger full index by calling indexAgent with agentId 1
			// This will index agent 1 and then trigger a full backfill for all chains
			const indexResponse = await fetch('/api/indexAgent', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					agentId: '1',
				}),
			});

			if (indexResponse.ok) {
				const indexData = await indexResponse.json();
				console.log('✅ Full index triggered successfully:', indexData);
				
				// Refresh the table data
				await fetchData(data.page);
			} else {
				const errorData = await indexResponse.json();
				console.error('❌ Failed to trigger full index:', errorData);
			}
		} catch (error: any) {
			console.error('❌ Error triggering full index:', error?.message || error);
		} finally {
			setRefreshing(false);
		}
	}

	function clearFilters() {
		setDomain("");
		setAddress("");
		setAgentId("");
		setMineOnly(false);
		setSelectedChainIdFilter(null);
			// Force-refresh immediately with cleared filters (state updates are async)
			fetchData(1, { name: "", address: "", agentId: "", chainId: undefined });
	}

	async function runDiscover() {
		try {
			setDiscoverLoading(true);
			setDiscoverError(null);
			if (!Array.isArray(data.rows) || data.rows.length === 0) {
				setDiscoverMatches(new Set());
				setDiscoverTrustScores({});
				return;
			}
			const agents = data.rows.map((r) => ({
				agentId: r.agentId,
				agentName: r.agentName,
				description: r.description ?? null,
			}));
			const res = await fetch('/api/discover', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: discoverQuery, agents }),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({} as any));
				throw new Error(err?.error || 'Discover request failed');
			}
			const json = await res.json();
			const matches: any[] = Array.isArray(json?.matches) ? json.matches : [];
			const ids = new Set<string>();
			const scores: Record<string, { score: number; reasoning?: string }> = {};
			matches.forEach((m) => {
				const id = typeof m === 'string' ? m : m?.agentId;
				if (id) {
					ids.add(id);
					scores[id] = {
						score: typeof m === 'object' && typeof m.trustScore === 'number' ? m.trustScore : 50,
						reasoning: typeof m === 'object' ? m.reasoning : undefined,
					};
				}
			});
			setDiscoverMatches(ids);
			setDiscoverTrustScores(scores);
		} catch (e: any) {
			setDiscoverError(e?.message || 'Failed to run discover');
		} finally {
			setDiscoverLoading(false);
		}
	}

	function clearDiscover() {
		setDiscoverQuery("");
		setDiscoverError(null);
		setDiscoverMatches(null);
		setDiscoverTrustScores({});
	}


	function getStoredCard(domain: string): string | null {
		try { return localStorage.getItem(`agent_card:${domain.trim().toLowerCase()}`); } catch { return null; }
	}

	function setStoredCard(domain: string, value: string) {
		try { localStorage.setItem(`agent_card:${domain.trim().toLowerCase()}`, value); } catch {}
	}

	async function loadIdentityDefaults(row: Agent): Promise<{ name?: string; description?: string; url?: string }> {
		const out: { name?: string; description?: string; url?: string } = {};
		try {
			// Use ERC8004 SDK to fetch registration file
			const rpcUrl = process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL as string;
			const { ethers } = await import('ethers');
			const ethersProvider = new ethers.JsonRpcProvider(rpcUrl);
			const { EthersAdapter } = await import('@erc8004/sdk');
			const { ERC8004Client } = await import('@erc8004/sdk');
			const adapter = new EthersAdapter(ethersProvider);
			const erc8004Client = new ERC8004Client({
				adapter,
				addresses: {
					identityRegistry: process.env.NEXT_PUBLIC_ETH_SEPOLIA_IDENTITY_REGISTRY as string,
					reputationRegistry: '0x0000000000000000000000000000000000000000',
					validationRegistry: '0x0000000000000000000000000000000000000000',
					chainId: 11155111,
				}
			});
			const identity = await erc8004Client.identity.getRegistrationFile(BigInt(row.agentId)) as any;
			console.info(">>>>>>>>>>>>>>>>> identity: ", identity);

			if (identity && typeof identity === 'object' && !Array.isArray(identity)) {
				if (typeof (identity as any).name === 'string' && (identity as any).name.trim()) out.name = (identity as any).name.trim();
				if (typeof (identity as any).description === 'string' && (identity as any).description.trim()) out.description = (identity as any).description.trim();
				if (typeof (identity as any).url === 'string' && /^https?:\/\//i.test((identity as any).url)) out.url = (identity as any).url;
				try {
					const endpoints = Array.isArray((identity as any).endpoints) ? (identity as any).endpoints : [];
					const a2a = endpoints.find((e: any) => String(e?.name || '').toUpperCase() === 'A2A');
					const a2aUrl = (a2a?.endpoint || a2a?.url) as string | undefined;
					if (a2aUrl && /^https?:\/\//i.test(a2aUrl)) {
						const res = await fetch(a2aUrl);
						if (res.ok) {
							const cardJson: any = await res.json().catch(() => null);
							if (cardJson && typeof cardJson === 'object' && !Array.isArray(cardJson)) {
								if (!out.name && typeof cardJson.name === 'string' && cardJson.name.trim()) out.name = cardJson.name.trim();
								if (!out.description && typeof cardJson.description === 'string' && cardJson.description.trim()) out.description = cardJson.description.trim();
								if (!out.url && typeof cardJson.url === 'string' && /^https?:\/\//i.test(cardJson.url)) out.url = cardJson.url;
							}
						}
					}
				} catch {}
			}
		} catch {}
		return out;
	}

	async function viewOrCreateCard(row: Agent) {
		console.info("viewOrCreateCard: ", row)
		console.info("row: ", row)
		const agentName = row.agentName.trim().toLowerCase();
		if (!owned[row.agentId]) return; // only mine
		setCurrentAgentForCard(row);
		setCardDomain(agentName);
		setCardError(null);
		// Prefer loading the Agent Card directly from the discovered A2A endpoint
		/*
		if (row.a2aEndpoint && typeof row.a2aEndpoint === 'string' && /^https?:\/\//i.test(row.a2aEndpoint)) {
			try {
				const res = await fetch(row.a2aEndpoint);
				if (res.ok) {
					const cardObj = await res.json();
					const json = JSON.stringify(cardObj, null, 2);
					setStoredCard(agentName, json);
					setCardJson(json);
					try { await populateFieldsFromObj(cardObj); } catch {}
					setCardOpen(true);
					console.info("............cardObj aaa: ", cardObj)
					return;
					
				}
			} catch {}
		}
			*/
		console.info("............getStoredCard for agentName: ", agentName)
		let existing = getStoredCard(agentName);
		if (existing) {
			setCardJson(existing);
			try { await populateFieldsFromObj(JSON.parse(existing)); } catch {}
			setCardOpen(true);
			return;
		}
		await regenerateCard(row);
	}

	async function regenerateCard(row: Agent) {
		const agentName = row.agentName.trim().toLowerCase();
		setCardLoading(true);
		setCardError(null);
		try {
			// If A2A endpoint is present, load the Agent Card directly
			/*
			if (row.a2aEndpoint && typeof row.a2aEndpoint === 'string' && /^https?:\/\//i.test(row.a2aEndpoint)) {
				try {
					const res = await fetch(row.a2aEndpoint);
					if (res.ok) {
						const cardObj = await res.json();
						const json = JSON.stringify(cardObj, null, 2);
						setStoredCard(agentName, json);
						setCardJson(json);
						await populateFieldsFromObj(cardObj);
						
						setCardOpen(true);
						console.info("............cardObj: ", cardObj)
						return;
					}
				} catch {}
			}
			*/
                    const registry = process.env.NEXT_PUBLIC_ETH_SEPOLIA_IDENTITY_REGISTRY as `0x${string}`;
			if (!provider || !eoa) throw new Error('Not connected');
			const walletClient = createWalletClient({ chain: sepolia as any, transport: custom(provider as any), account: eoa as `0x${string}` });
			const cardObj = await buildAgentCard({
				a2aUrl: row.a2aEndpoint ?? undefined,
				registry,
				agentName,
				chainId: 11155111,
				trustModels: (process.env.NEXT_PUBLIC_ERC8004_TRUST_MODELS || 'feedback').split(',').map((x) => x.trim()).filter(Boolean),
				signMessage: async (message: string) => {
					return await walletClient.signMessage({ account: eoa as `0x${string}`, message }) as any;
				},
			});
			// Merge defaults from identity JSON and A2A URL
			const defaults = await loadIdentityDefaults(row);
			console.info("............defaults: ", defaults)
			if (defaults.name) (cardObj as any).name = defaults.name;
			if (defaults.description) (cardObj as any).description = defaults.description;
			if (defaults.url) (cardObj as any).url = defaults.url;
			const json = JSON.stringify(cardObj, null, 2);
			setStoredCard(agentName, json);
			setCardJson(json);
			await populateFieldsFromObj(cardObj);
			// Note: agent-cards API endpoint removed - cards are now stored client-side only
			setCardOpen(true);
		} catch (err: any) {
			setCardError(err?.message ?? 'Failed to build agent card');
			setCardOpen(true);
		} finally {
			setCardLoading(false);
		}
	}

	function openDidWebModal(row: Agent) {
		if (!owned[row.agentId]) return; // only mine
		setCurrentAgentForDid(row);
		setCurrentAgentEnsName(agentEnsNames[row.agentAddress] || null);
		setDidWebOpen(true);
	}

	function openDidAgentModal(row: Agent) {
		if (!owned[row.agentId]) return; // only mine
		setCurrentAgentForDid(row);
		setCurrentAgentEnsName(agentEnsNames[row.agentAddress] || null);
		setDidAgentOpen(true);
	}


	async function openFeedbackFor(row: Agent) {
		setCurrentAgent(row);
		setFeedbackOpen(true);
		setFeedbackLoading(true);
		setFeedbackError(null);
		setFeedbackData([]);

    try {
		console.info("............xxxx openFeedbackFor for agentId: ", row.agentId)
        const rpcUrl = process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL as string;
        const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
        const reputationRegistry = process.env.NEXT_PUBLIC_REPUTATION_REGISTRY as `0x${string}`;
        if (!reputationRegistry) throw new Error('Reputation registry not configured');
        const zero32 = '0x0000000000000000000000000000000000000000000000000000000000000000';
        console.info("............readAllFeedback for agentId: ", row.agentId)
		const res: any = await publicClient.readContract({
            address: reputationRegistry,
            abi: reputationRegistryAbi as any,
            functionName: 'readAllFeedback' as any,
            args: [BigInt(row.agentId), [], zero32, zero32, true],
        });
		console.info("............res: ", res)
        const clients = (res?.outClients ?? res?.[0]) || [];
        const scores = (res?.scores ?? res?.[1]) || [];
        const tag1s = (res?.tag1s ?? res?.[2]) || [];
        const tag2s = (res?.tag2s ?? res?.[3]) || [];
        const revoked = (res?.revokedStatuses ?? res?.[4]) || [];
        const list = clients.map((addr: string, i: number) => ({
            client: addr,
            score: Number(scores[i] ?? 0),
            tag1: tag1s[i] as `0x${string}`,
            tag2: tag2s[i] as `0x${string}`,
            revoked: Boolean(revoked[i]),
        }));
        setFeedbackData(list);
    } catch (error: any) {
        console.error('Error fetching feedback data:', error);
        setFeedbackError(error.message || 'Failed to fetch feedback data');
    } finally {
        setFeedbackLoading(false);
    }
	}


	async function openEnsFor(row: Agent) {
		setEnsCurrentAgent(row);
		setEnsOpen(true);
		setEnsLoading(true);
		setEnsError(null);
		setEnsData(null);
		setEnsSubdomainName('');
		
		// Set parent name from environment variables
		const parentEnsName = process.env.NEXT_PUBLIC_ETH_SEPOLIA_ENS_NAME as string;
		if (parentEnsName) {
			setEnsParentName(cleanEnsName(parentEnsName) + '.eth');
		}

		try {
			// First check parent domain wrap status
			await checkParentWrapStatus();
			
			// Perform reverse lookup to get ENS name for the agent address
			const ensName = await ensService.getEnsName(row.agentAddress, sepolia);
			
			if (ensName) {
				// Get comprehensive ENS data including avatar
				const comprehensiveData = await ensService.getEnsComprehensiveData(row.agentAddress, sepolia);
				setEnsData(comprehensiveData);
			} else {
				// No ENS name found, set empty data
				setEnsData({
					name: null,
					avatar: null,
					website: null,
					email: null,
					twitter: null,
					github: null,
					discord: null
				});
			}
		} catch (error: any) {
			console.error('Error fetching ENS data:', error);
			setEnsError(error?.message ?? 'Failed to fetch ENS data');
		} finally {
			setEnsLoading(false);
		}
	}



	async function openSessionFor(row: Agent) {
		console.log('Starting session creation for:', row.agentName);
		setSessionLoading(true);
		try {
			if (!provider || !eoa) throw new Error('Not connected');
			
			// Get chain-specific configuration based on the agent's chainId
			const agentChainId = row.chainId;
			const rpcUrl = getRpcUrl(agentChainId);
			const chain = getViemChain(agentChainId);
			const bundlerUrl = getBundlerUrl(agentChainId);
			const identityRegistry = getIdentityRegistry(agentChainId);
			
			if (!rpcUrl || !chain || !bundlerUrl) {
				throw new Error(`Chain configuration not found for chainId ${agentChainId}`);
			}
			
			// Switch wallet to the agent's chain
			const chainIdHex = getChainIdHex(agentChainId);
			const web3AuthProvider = provider as any;
			const eip1193 = web3AuthProvider;
			
			try {
				await eip1193.request({
					method: "wallet_switchEthereumChain",
					params: [{ chainId: chainIdHex }]
				});
			} catch (switchError: any) {
				// If the chain doesn't exist (code 4902), try to add it
				if (switchError.code === 4902) {
					const chainConfig = getChainConfig(agentChainId);
					await eip1193.request({
						method: "wallet_addEthereumChain",
						params: [{
							chainId: chainIdHex,
							chainName: chainConfig?.chainName || `Chain ${agentChainId}`,
							nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
							rpcUrls: [rpcUrl]
						}]
					});
				} else {
					throw switchError;
				}
			}
			
			// Add delay to allow wallet to adapt to chain switch
			await new Promise(resolve => setTimeout(resolve, 1000));
			
			const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
			const walletClient = createWalletClient({ chain: chain as any, transport: custom(provider as any), account: eoa as `0x${string}` });

			// Use existing AA address from the table row instead of deriving via salt
			console.info("*********** using agent account address from row: ", row.agentAddress);
			const smartAccount = await toMetaMaskSmartAccount({
				address: row.agentAddress as `0x${string}`,
				client: publicClient,
				implementation: Implementation.Hybrid,
				signatory: { walletClient },
			} as any);
			const aa = await smartAccount.getAddress() as `0x${string}`;

			console.info("*********** ai agent address: ", aa);
			const entryPoint = (await (smartAccount as any).getEntryPointAddress?.()) as `0x${string}` || '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
			const chainId = agentChainId;

			// Ensure main AA is deployed via bundler (sponsored)
			const aaCode = await publicClient.getBytecode({ address: aa });
			const aaDeployed = !!aaCode && aaCode !== '0x';
			if (!aaDeployed) {
				const paymasterUrl = (process.env.NEXT_PUBLIC_PAYMASTER_URL as string) || undefined;
				console.info("create bundler client ", bundlerUrl, paymasterUrl);
				const pimlicoClient = createPimlicoClient({ transport: http(bundlerUrl) });
				const bundlerClient = createBundlerClient({
					transport: http(bundlerUrl),
					paymaster: true as any,
					chain: chain as any,
					paymasterContext: { mode: 'SPONSORED' },
				} as any);

				console.info("get gas price");
				const { fast: fee } = await pimlicoClient.getUserOperationGasPrice();

				console.info("deploy indivAccount EOA address: ", eoa);
				console.info("deploy indivAccountClient AA address: ", aa);
				try {
					console.info("send user operation with bundlerClient 2: ", bundlerClient);
					const userOperationHash = await bundlerClient!.sendUserOperation({
						account: smartAccount as any,
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

			// Session key
			const pk = generatePrivateKey() as `0x${string}`;
			const sk = privateKeyToAccount(pk);
			const skAddr = sk.address as `0x${string}`;
			const now = Math.floor(Date.now()/1000);
			const validAfter = now - 60;
			const validUntil = now + 60*30;

			const paymasterUrl = (process.env.NEXT_PUBLIC_PAYMASTER_URL as string) || undefined;
			const reputationRegistry = (process.env.NEXT_PUBLIC_REPUTATION_REGISTRY as `0x${string}`) || '0x0000000000000000000000000000000000000000';

			// Create session AA (burner) from session key pk
			const burnerAccountClient = await toMetaMaskSmartAccount({
				client: publicClient,
				implementation: Implementation.Hybrid,
				deployParams: [skAddr, [], [], []],
				signatory: { account: sk },
				deploySalt: toHex(10),
			} as any);
			const sessionAA = await burnerAccountClient.getAddress() as `0x${string}`;


			const code = await publicClient.getBytecode({ address: sessionAA });
			const isDeployed = !!code && code !== '0x';
			if (!isDeployed) {
				const pimlico = createPimlicoClient({ transport: http(bundlerUrl) });
				const bundlerClient = createBundlerClient({
					transport: http(bundlerUrl),
					paymaster: true as any,
					chain: chain as any,
					paymasterContext: { mode: 'SPONSORED' },
				} as any);
				const { fast: fee } = await pimlico.getUserOperationGasPrice();
				const userOperationHash = await bundlerClient.sendUserOperation({
					account: burnerAccountClient as any,
					calls: [ { to: zeroAddress } ],
					...fee,
				});
				await bundlerClient.waitForUserOperationReceipt({ hash: userOperationHash });
			}

			// Preferred DTK flow: AA signs delegation with caveats
			let signedDelegation: any;

			// Go back to CaveatBuilder but fix the address issue
			console.log('Creating caveats using CaveatBuilder');
			console.log('reputationRegistry:', reputationRegistry, typeof reputationRegistry);
			const environment = (smartAccount as any).environment;
			const registryAddress = String(reputationRegistry).toLowerCase() as `0x${string}`;
			console.log('registryAddress:', registryAddress);
			const caveatBuilder = createCaveatBuilder(environment as any);
			const caveats = caveatBuilder
				.addCaveat("allowedTargets", [registryAddress] as any)
				.build();


			const del = await (createDelegation as any)({ 
				from: aa as `0x${string}`, 
				to: sessionAA as `0x${string}`, 
				caveats: caveats
			});
			let signature: `0x${string}`;
			if ((smartAccount as any).signDelegation) {
				signature = await (smartAccount as any).signDelegation({ delegation: del }) as `0x${string}`;
			} else if ((walletClient as any).signDelegation) {
				signature = await (walletClient as any).signDelegation({ delegation: del }) as `0x${string}`;
			} else {
				throw new Error('signDelegation helper not available');
			}
			signedDelegation = { message: del, signature };
		

			const session = {
				agentId: row.agentId,
				chainId,
				aa,
				sessionAA,
				reputationRegistry,
				selector: '0x8524d988',
				sessionKey: { privateKey: pk, address: skAddr, validAfter, validUntil },
				entryPoint,
				bundlerUrl,
				paymasterUrl,
				signedDelegation,
			} as any;

			// Approve sessionAA as operator for this specific Identity tokenId on IdentityRegistry
			try {
				if (identityRegistry) {
					const approveCalldata = encodeFunctionData({
						abi: registryAbi as any,
						functionName: 'approve' as any,
						args: [sessionAA as `0x${string}`, BigInt(row.agentId)],
					});
					const pimlicoApprove = createPimlicoClient({ transport: http(bundlerUrl) });
					const bundlerApprove = createBundlerClient({
						transport: http(bundlerUrl),
						paymaster: true as any,
						chain: chain as any,
						paymasterContext: { mode: 'SPONSORED' },
					} as any);
					const { fast: feeApprove } = await pimlicoApprove.getUserOperationGasPrice();
					const uoHashApprove = await bundlerApprove.sendUserOperation({
						account: smartAccount as any,
						calls: [{ to: identityRegistry, data: approveCalldata }],
						...feeApprove,
					});
					await bundlerApprove.waitForUserOperationReceipt({ hash: uoHashApprove });
					console.info('sessionAA approved for tokenId', row.agentId);
				}
			} catch (e) {
				console.info('failed to approve sessionAA operator', e);
			}

			console.log('Session created successfully:', session);
			setSessionJson(JSON.stringify(session, null, 2));
			setSessionOpen(true);
		} catch (e: any) {
			console.error('Error creating session:', e);
			setCardError(e?.message ?? 'Failed to build session');
		} finally {
			setSessionLoading(false);
		}
	}

	// Compute filtered rows once to avoid recalculating
	const filteredRowsForDisplay = React.useMemo(() => 
		data.rows.filter((row) => {
			const inDiscover = !discoverMatches || discoverMatches.has(row.agentId);
			const acct = metadataAccounts[row.agentId] || (row.agentAddress as `0x${string}`);
			const ens = row.ensEndpoint || agentEnsNames[acct] || agentEnsNames[row.agentAddress];
			const dbName = row.agentName || '';
			const fetchedName = metadataNames[row.agentId] || null;
			const displayName = dbName || fetchedName || null;
			const hasName = displayName || ens;
			return inDiscover && (!mineOnly || owned[row.agentId]) && hasName;
		}), [data.rows, discoverMatches, mineOnly, owned, metadataAccounts, metadataNames, agentEnsNames]
	);
	const showCardViewForDesktop = filteredRowsForDisplay.length <= 4 && !isMobile;

	return (
		<Stack spacing={1}>
			<Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2.5 }, borderColor: '#d0d7de', bgcolor: '#ffffff', borderRadius: '6px' }}>
				<Stack spacing={2}>
					{/* Search Form */}
				<Box component="form" onSubmit={handleSubmit} sx={{ display: 'block' }}>
						<Grid container spacing={2}>
							<Grid item xs={12} md={2} sx={{ display: { xs: 'none', sm: 'block' } }}>
								<TextField
									fullWidth
									select
									label="Chain"
									value={selectedChainIdFilter ?? ''}
									onChange={(e) => {
										const value = e.target.value;
										setSelectedChainIdFilter(value === '' ? null : parseInt(value));
									}}
									size="small"
									InputLabelProps={{
										shrink: true,
									}}
									SelectProps={{
										native: true,
									}}
								>
									<option value="">All Chains</option>
									{CHAIN_CONFIGS.map((config) => (
										<option key={config.chainId} value={config.chainId}>
											{config.chainName}
										</option>
									))}
								</TextField>
							</Grid>
							<Grid item xs={12} md={2} sx={{ display: { xs: 'none', sm: 'block' } }}>
								<TextField 
									fullWidth 
									label="address" 
									placeholder="0x…" 
									value={address} 
									onChange={(e) => setAddress(e.target.value)} 
									size="small"
									sx={{
										'& .MuiOutlinedInput-root': {
											borderColor: '#d0d7de',
											'&:hover': {
												borderColor: '#d0d7de',
											},
											'&.Mui-focused': {
												borderColor: '#0969da',
											},
										},
									}}
								/>
							</Grid>
						<Grid item xs={7} sm={12} md={3}>
							<TextField 
								fullWidth 
								label="name" 
								placeholder={isMobile ? "Filter by name" : "Filter by name (ENS or metadata)"}
								value={domain} 
								onChange={(e) => setDomain(e.target.value)} 
								size="small"
								sx={{
									'& .MuiOutlinedInput-root': {
										borderColor: '#d0d7de',
										'&:hover': {
											borderColor: '#d0d7de',
										},
										'&.Mui-focused': {
											borderColor: '#0969da',
										},
									},
								}}
							/>
						</Grid>
						<Grid item xs={5} sm={12} md={2}>
							<TextField 
								fullWidth 
								label="id" 
								placeholder="Filter by id" 
								value={agentId} 
								onChange={(e) => {
									const value = e.target.value;
									// Only allow digits and limit to 5 characters
									if (value === '' || (/^\d+$/.test(value) && value.length <= 5)) {
										setAgentId(value);
									}
								}} 
								size="small"
								inputProps={{
									maxLength: 5,
								}}
								sx={{
									'& .MuiOutlinedInput-root': {
										borderColor: '#d0d7de',
										'&:hover': {
											borderColor: '#d0d7de',
										},
										'&.Mui-focused': {
											borderColor: '#0969da',
										},
									},
								}}
							/>
						</Grid>
						<Grid item xs={12} md={1} sx={{ display: { xs: 'none', sm: 'block' } }}>
							<FormControlLabel control={<Checkbox checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} size="small" />} label="Mine" />
						</Grid>
						<Grid item xs={12} md={2}>
							<Stack direction="row" spacing={1} sx={{ height: '100%', flexWrap: { xs: 'nowrap', sm: 'nowrap' } }}>
								<Button 
									type="submit" 
									variant="contained" 
									disableElevation 
									sx={{ 
										flex: { xs: 1, sm: 1 },
										minWidth: { xs: 'auto', sm: 'auto' },
										backgroundColor: 'rgb(31, 136, 61)',
										color: '#ffffff',
										'&:hover': {
											backgroundColor: 'rgb(26, 115, 51)',
										},
										'&:disabled': {
											backgroundColor: 'rgba(31, 136, 61, 0.5)',
											color: '#ffffff',
										},
									}} 
									disabled={isLoading}
								>
									{isLoading ? 'Searching…' : 'Search'}
								</Button>
								<Button 
									type="button" 
									variant="outlined" 
									size="small"
									sx={{ 
										flex: { xs: 0, sm: 1 },
										minWidth: { xs: 'auto', sm: 'auto' },
										px: { xs: 1, sm: 1.5 },
										borderColor: '#d0d7de',
										color: '#24292f',
										whiteSpace: 'nowrap',
										'&:hover': {
											borderColor: '#d0d7de',
											backgroundColor: '#f6f8fa',
										},
									}} 
									disabled={isLoading} 
									onClick={clearFilters}
								>
									Clear
								</Button>
							</Stack>
						</Grid>
				</Grid>
			</Box>

			{/* Discover below search - Hidden for now */}
			<Box component="form" onSubmit={(e) => { e.preventDefault(); runDiscover(); }} sx={{ display: 'none' }}>
				<Grid container spacing={2} alignItems="center">
					<Grid item xs={12} md={9}>
						<TextField fullWidth label="discover agents" placeholder="Describe what you're looking for…" value={discoverQuery} onChange={(e) => setDiscoverQuery(e.target.value)} size="small" />
					</Grid>
					<Grid item xs={12} md={3}>
						<Stack direction="row" spacing={1} sx={{ height: '100%' }}>
							<Button 
								type="submit" 
								variant="contained" 
								disableElevation 
								sx={{ 
									flex: 1,
									backgroundColor: 'rgb(31, 136, 61)',
									color: '#ffffff',
									'&:hover': {
										backgroundColor: 'rgb(26, 115, 51)',
									},
									'&:disabled': {
										backgroundColor: 'rgba(31, 136, 61, 0.5)',
										color: '#ffffff',
									},
								}} 
								disabled={discoverLoading || !discoverQuery.trim()}
							>
								{discoverLoading ? 'Discovering…' : 'Discover'}
							</Button>
							<Button type="button" variant="outlined" sx={{ flex: 1 }} disabled={discoverLoading && !discoverMatches} onClick={clearDiscover}>Clear</Button>
						</Stack>
					</Grid>
					{discoverError && (
						<Grid item xs={12}>
							<Typography variant="body2" color="error">{discoverError}</Typography>
						</Grid>
					)}
					{discoverMatches && (
						<Grid item xs={12}>
							<Typography variant="caption" color="text.secondary">Showing {discoverMatches.size} discovered match(es)</Typography>
						</Grid>
					)}
				</Grid>
			</Box>
				</Stack>
			</Paper>

			{/* Mobile & Desktop Card View (when 4 or fewer agents) */}
			<Box sx={{ display: showCardViewForDesktop ? { xs: 'none', sm: 'block' } : { xs: 'block', sm: 'none' } }}>
				{!isLoading && filteredRowsForDisplay.length === 0 && (
					<Paper variant="outlined" sx={{ p: 3, borderColor: '#d0d7de', bgcolor: '#ffffff', borderRadius: '6px', textAlign: 'center' }}>
						<Typography variant="body2" color="text.secondary">No agents found.</Typography>
					</Paper>
				)}
				{isLoading && (
					<Paper variant="outlined" sx={{ p: 3, borderColor: '#d0d7de', bgcolor: '#ffffff', borderRadius: '6px', textAlign: 'center' }}>
						<Typography variant="body2" color="text.secondary">Loading…</Typography>
					</Paper>
				)}
				<Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, flexWrap: { xs: 'nowrap', md: 'wrap' }, gap: 2 }}>
					{filteredRowsForDisplay.sort((a, b) => {
						if (discoverMatches && discoverTrustScores[a.agentId] && discoverTrustScores[b.agentId]) {
							return discoverTrustScores[b.agentId].score - discoverTrustScores[a.agentId].score;
						}
						if (discoverMatches && discoverTrustScores[a.agentId]) return -1;
						if (discoverMatches && discoverTrustScores[b.agentId]) return 1;
						return 0;
					})?.map((row) => {
						const chainConfig = getChainConfig(row.chainId);
						const acct = metadataAccounts[row.agentId] || (row.agentAddress as `0x${string}`);
						const ens = row.ensEndpoint || agentEnsNames[acct] || agentEnsNames[row.agentAddress];
						const dbName = row.agentName || '';
						const fetchedName = metadataNames[row.agentId] || null;
						const displayName = dbName || fetchedName || null;
						const nameText = displayName || ens || '—';
						const registryAddress = getIdentityRegistry(row.chainId);
						
						// Get agent URL if already fetched
						const agentUrl = ens ? agentUrls[ens] : null;
						
						return (
							<Card 
								key={`${row.chainId}-${row.agentId}`}
								variant="outlined" 
								sx={{ 
									borderColor: '#d0d7de', 
									bgcolor: '#ffffff', 
									borderRadius: '6px',
									cursor: { xs: 'pointer', sm: 'default' },
									width: { xs: '100%', md: '500px' },
									flexShrink: 0,
									'&:hover': {
										backgroundColor: { xs: '#f6f8fa', sm: '#ffffff' },
										boxShadow: { xs: 1, sm: 0 },
									},
								}}
								onClick={(e) => {
									// Only trigger on mobile, and not when clicking buttons/links
									if (isMobile && !(e.target as HTMLElement).closest('button, a')) {
										openAgentInfo(row);
									}
								}}
							>
								<CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
									<Stack spacing={2}>
										{/* Name */}
										<Box>
											{ens ? (
												<Typography
													component="a"
													href={`https://sepolia.app.ens.domains/${ens as string}`}
													target="_blank"
													rel="noopener noreferrer"
													variant="body1"
													onClick={(e) => e.stopPropagation()}
													sx={{ 
														fontFamily: 'ui-monospace, monospace', 
														color: 'primary.main', 
														textDecoration: 'underline', 
														cursor: 'pointer',
														fontWeight: 600,
														display: 'block',
													}}
												>
													{nameText}
												</Typography>
											) : (
												<Typography variant="body1" sx={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>
													{nameText}
												</Typography>
											)}
										</Box>

										{/* ID and Session */}
										<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
											{registryAddress ? (
												<Typography
													component="a"
													href={`${getExplorerUrl(row.chainId)}/nft/${registryAddress}/${row.agentId}`}
													target="_blank"
													rel="noopener noreferrer"
													variant="body2"
													onClick={(e) => e.stopPropagation()}
													sx={{ fontFamily: 'ui-monospace, monospace', color: 'primary.main', textDecoration: 'underline', cursor: 'pointer', fontWeight: 600 }}
													title={`View NFT #${row.agentId} on ${getExplorerName(row.chainId)}`}
												>
													ID: {row.agentId}
												</Typography>
											) : (
												<Chip label={`ID: ${row.agentId}`} size="small" sx={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600 }} />
											)}
											{/* Session Link (only for owned agents) */}
											{owned[row.agentId] && (
												<Typography
													component="button"
													onClick={(e) => {
														e.stopPropagation();
														openSessionFor(row);
													}}
													disabled={sessionLoading}
													variant="caption"
													color="primary"
													sx={{
														fontSize: '0.75rem',
														textDecoration: 'underline',
														cursor: 'pointer',
														fontWeight: 600,
														border: 'none',
														background: 'none',
														padding: 0,
														'&:hover': {
															color: 'primary.dark',
															textDecoration: 'none',
														},
														'&:disabled': {
															color: 'text.disabled',
															cursor: 'not-allowed',
														},
													}}
												>
													{sessionLoading ? 'Loading...' : 'Session file'}
												</Typography>
											)}
										</Box>

										{/* Chain and Account */}
										<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
											{(() => {
												const getChainDisplayName = (chainId: number): string => {
													switch (chainId) {
														case 11155111: return 'eth-sepolia';
														case 84532: return 'base-sepolia';
														case 11155420: return 'op-sepolia';
														default: return `chain-${chainId}`;
													}
												};
												
												return (
													<Typography 
														variant="body2" 
														sx={{ 
															fontFamily: 'ui-monospace, monospace',
															fontSize: '0.75rem',
															color: '#24292f',
															fontWeight: 500,
														}}
													>
														{getChainDisplayName(row.chainId)}
													</Typography>
												);
											})()}
											<Typography variant="body2" sx={{ fontSize: '0.75rem', color: '#24292f' }}>, </Typography>
											<Typography
												component="a"
												href={`${getExplorerUrl(row.chainId)}/address/${row.agentAddress}#nfttransfers`}
												target="_blank"
												rel="noopener noreferrer"
												variant="body2"
												onClick={(e) => e.stopPropagation()}
												sx={{
													fontFamily: 'ui-monospace, monospace',
													fontSize: '0.75rem',
													color: 'primary.main',
													textDecoration: 'underline',
													cursor: 'pointer',
													fontWeight: 500,
													'&:hover': {
														color: 'primary.dark',
													},
												}}
												title={`View account on ${getExplorerName(row.chainId)}`}
											>
												account
											</Typography>
											{registryAddress && (
												<>
													<Typography variant="body2" sx={{ fontSize: '0.75rem', color: '#24292f' }}>, </Typography>
													<Typography
														component="a"
														href={`${getExplorerUrl(row.chainId)}/address/${registryAddress}`}
														target="_blank"
														rel="noopener noreferrer"
														variant="body2"
														onClick={(e) => e.stopPropagation()}
														sx={{
															fontFamily: 'ui-monospace, monospace',
															fontSize: '0.75rem',
															color: 'primary.main',
															textDecoration: 'underline',
															cursor: 'pointer',
															fontWeight: 500,
															'&:hover': {
																color: 'primary.dark',
															},
														}}
														title={`View registry on ${getExplorerName(row.chainId)}`}
													>
														reg
													</Typography>
												</>
											)}
										</Box>
										

										{/* Description */}
										{row.description && (
											<Box sx={{ 
												bgcolor: '#f8f9fa', 
												border: '1px solid #e1e4e8', 
												borderRadius: '6px',
												p: 1.5,
												position: 'relative',
											}}>
												<FormLabel sx={{ 
													fontSize: '0.625rem', 
													fontWeight: 600, 
													color: 'text.secondary', 
													position: 'absolute',
													top: -8,
													left: 8,
													px: 0.5,
													bgcolor: '#f8f9fa',
													display: 'block'
												}}>
													description
												</FormLabel>
												<Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem', pr: 3 }}>
													{row.description}
												</Typography>
												<IconButton
													size="small"
													sx={{
														position: 'absolute',
														top: 4,
														right: 4,
														padding: '4px',
														color: 'text.secondary',
														'&:hover': {
															color: 'primary.main',
															backgroundColor: 'rgba(25, 113, 194, 0.04)',
														},
													}}
													onClick={(e) => {
														e.stopPropagation();
														// TODO: Open edit modal for description
													}}
												>
													<EditIcon sx={{ fontSize: '0.75rem' }} />
												</IconButton>
											</Box>
										)}

										{/* Agent URL from ENS */}
										{agentUrl && (
											<Box sx={{ 
												bgcolor: '#f8f9fa', 
												border: '1px solid #e1e4e8', 
												borderRadius: '6px',
												p: 1.5,
												position: 'relative',
											}}>
												<FormLabel sx={{ 
													fontSize: '0.625rem', 
													fontWeight: 600, 
													color: 'text.secondary', 
													position: 'absolute',
													top: -8,
													left: 8,
													px: 0.5,
													bgcolor: '#f8f9fa',
													display: 'block'
												}}>
													url
												</FormLabel>
												<Typography 
													component="a"
													href={agentUrl}
													target="_blank"
													rel="noopener noreferrer"
													onClick={(e) => e.stopPropagation()}
													variant="caption" 
													color="primary"
													sx={{ 
														fontSize: '0.75rem',
														textDecoration: 'underline',
														cursor: 'pointer',
														pr: 3,
														display: 'block',
														wordBreak: 'break-all',
														'&:hover': {
															color: 'primary.dark',
															textDecoration: 'none',
														},
													}}
												>
													{agentUrl}
												</Typography>
												<IconButton
													size="small"
													sx={{
														position: 'absolute',
														top: 4,
														right: 4,
														padding: '2px',
														color: 'text.secondary',
														'&:hover': {
															color: 'primary.main',
															backgroundColor: 'rgba(25, 113, 194, 0.04)',
														},
													}}
													onClick={(e) => {
														e.stopPropagation();
														// TODO: Open edit modal for URL
													}}
												>
													<EditIcon sx={{ fontSize: '0.75rem' }} />
												</IconButton>
											</Box>
										)}

										{/* ENS URL - Only show on mobile, not desktop card view */}
										{ens && !showCardViewForDesktop && (
											<Typography 
												component="a"
												href={`https://sepolia.app.ens.domains/${ens as string}`}
												target="_blank"
												rel="noopener noreferrer"
												onClick={(e) => e.stopPropagation()}
												variant="caption" 
												color="primary"
												sx={{ 
													fontFamily: 'ui-monospace, monospace',
													fontSize: '0.7rem',
													textDecoration: 'underline',
													cursor: 'pointer',
													display: 'block',
													'&:hover': {
														color: 'primary.dark',
														textDecoration: 'none',
													},
												}}
											>
												ENS: {ens}
											</Typography>
										)}


										{/* DID Key Path - Only show on mobile, not desktop card view */}
										{!showCardViewForDesktop && (
										<Typography 
											variant="caption" 
											color="text.secondary"
											sx={{ 
												fontFamily: 'ui-monospace, monospace',
												fontSize: '0.7rem',
												display: 'block',
												wordBreak: 'break-all',
											}}
										>
											DID: eip155:{row.chainId}:{acct}
										</Typography>
										)}

										{/* Trust Score (if discover is active) */}
										{discoverMatches && discoverTrustScores[row.agentId] && (
											<Chip 
												label={`Trust: ${discoverTrustScores[row.agentId].score.toFixed(2)}`}
												size="small"
												color="primary"
												sx={{ alignSelf: 'flex-start' }}
											/>
										)}

										{/* Actions */}
										<Stack 
											direction="row" 
											spacing={0.5} 
											flexWrap="wrap" 
											useFlexGap
											onClick={(e) => e.stopPropagation()}
										>
											{owned[row.agentId] && (
												<IconButton
													size="small"
													color="error"
													onClick={async (e) => {
														e.stopPropagation();
														try {
															const registry = process.env.NEXT_PUBLIC_ETH_SEPOLIA_IDENTITY_REGISTRY as `0x${string}`;
															if (!registry) throw new Error('Registry address not configured');
															const rpcUrl = (process.env.NEXT_PUBLIC_RPC_URL as string) || 'https://rpc.ankr.com/eth_sepolia';
															const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
															const walletClient = createWalletClient({ chain: sepolia as any, transport: custom(provider as any), account: eoa as `0x${string}` });
															const domainOwnerAddress = row.agentAddress;
															const smartAccountClient = await toMetaMaskSmartAccount({
																address: domainOwnerAddress as `0x${string}`,
																client: publicClient,
																implementation: Implementation.Hybrid,
																signatory: { walletClient },
															});
															const calldata = encodeFunctionData({
																abi: registryAbi as any,
																functionName: 'transferFrom' as any,
																args: [domainOwnerAddress, '0x000000000000000000000000000000000000dEaD' as `0x${string}`, BigInt(row.agentId)],
															});
															const bundlerUrl2 = (process.env.NEXT_PUBLIC_BUNDLER_URL as string) || '';
															const pimlicoClient2 = createPimlicoClient({ transport: http(bundlerUrl2) });
															const bundlerClient2 = createBundlerClient({
																transport: http(bundlerUrl2),
																paymaster: true as any,
																chain: sepolia as any,
																paymasterContext: { mode: 'SPONSORED' },
															} as any);
															const { fast: fee2 } = await pimlicoClient2.getUserOperationGasPrice();
															const userOpHash = await bundlerClient2.sendUserOperation({
																account: smartAccountClient as any,
																calls: [{ to: registry, data: calldata }],
																...fee2,
															});
															await bundlerClient2.waitForUserOperationReceipt({ hash: userOpHash });
															fetchData(data?.page ?? 1);
														} catch (err) {
															console.error('Failed to burn identity', err);
														}
													}}
												>
													<LocalFireDepartmentIcon fontSize="small" />
												</IconButton>
											)}
											<Button 
												size="small" 
												onClick={(e) => {
													e.stopPropagation();
													openAgentInfo(row);
												}} 
												sx={{ fontSize: '0.7rem', minWidth: 'auto', px: 1 }}
											>
												Info
											</Button>
											<Button 
														size="small" 
														onClick={(e) => {
															e.stopPropagation();
															openIdentityJson(row);
														}}
														disabled={!isValidRegistrationUri(row.metadataURI) || tokenUriValidById[row.agentId] === false}
														sx={{ fontSize: '0.7rem', minWidth: 'auto', px: 1 }}
													>
														Reg
													</Button>
											{owned[row.agentId] && (
												<>
													
													<Button 
														size="small" 
														onClick={(e) => {
															e.stopPropagation();
															viewOrCreateCard(row);
														}} 
														sx={{ fontSize: '0.7rem', minWidth: 'auto', px: 1 }}
													>
														Card
													</Button>
													<Button 
														size="small" 
														onClick={(e) => {
															e.stopPropagation();
															openDidWebModal(row);
														}}
														sx={{ fontSize: '0.7rem', minWidth: 'auto', px: 1 }}
													>
														DID:Web
													</Button>
													<Button 
														size="small" 
														onClick={(e) => {
															e.stopPropagation();
															openDidAgentModal(row);
														}}
														sx={{ fontSize: '0.7rem', minWidth: 'auto', px: 1 }}
													>
														DID:Agent
													</Button>
													{row.a2aEndpoint && (
														<Button 
															component="a"
															href={row.a2aEndpoint}
															target="_blank"
															rel="noopener noreferrer"
															size="small"
															onClick={(e) => e.stopPropagation()}
															sx={{ fontSize: '0.7rem', minWidth: 'auto', px: 1 }}
														>
															A2A
														</Button>
													)}
												</>
											)}
										</Stack>
									</Stack>
								</CardContent>
							</Card>
						);
					})}
				</Box>
			</Box>

			{/* Desktop Table View (only when more than 4 agents) */}
			<TableContainer 
				component={Paper} 
				variant="outlined" 
				sx={{ 
					display: showCardViewForDesktop ? { xs: 'none', sm: 'none' } : { xs: 'none', sm: 'block' },
					overflowX: 'auto', 
					borderColor: '#d0d7de', 
					bgcolor: '#ffffff', 
					borderRadius: '6px',
					'-webkit-overflow-scrolling': 'touch',
					width: '100%',
				}}
			>
				<Table size="small" sx={{ minWidth: 1200 }}>
                            <TableHead sx={{ display: { xs: 'none', sm: 'table-header-group' } }}>
								<TableRow sx={{ bgcolor: '#f6f8fa', borderBottom: '1px solid #d0d7de' }}>
								<TableCell sx={{ fontWeight: 600, color: '#24292f', fontSize: { xs: '0.65rem', sm: '0.75rem' }, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Chain</TableCell>
								<TableCell sx={{ fontWeight: 600, color: '#24292f', fontSize: { xs: '0.65rem', sm: '0.75rem' }, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Account Address</TableCell>
                                    <TableCell sx={{ fontWeight: 600, color: '#24292f', fontSize: { xs: '0.65rem', sm: '0.75rem' }, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Name</TableCell>
                                    <TableCell sx={{ fontWeight: 600, color: '#24292f', fontSize: { xs: '0.65rem', sm: '0.75rem' }, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Description</TableCell>
								<TableCell sx={{ fontWeight: 600, color: '#24292f', fontSize: { xs: '0.65rem', sm: '0.75rem' }, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Identity ID</TableCell>
								<TableCell sx={{ fontWeight: 600, color: '#24292f', fontSize: { xs: '0.65rem', sm: '0.75rem' }, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>A2A</TableCell>
								{discoverMatches && <TableCell sx={{ fontWeight: 600, color: '#24292f', fontSize: { xs: '0.65rem', sm: '0.75rem' }, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Trust Score</TableCell>}
							</TableRow>
						</TableHead>
					<TableBody>
					{!isLoading && data.rows.filter((row) => {
						const inDiscover = !discoverMatches || discoverMatches.has(row.agentId);
						return inDiscover && (!mineOnly || owned[row.agentId]);
					}).length === 0 && (
                            <TableRow>
                                <TableCell colSpan={discoverMatches ? 7 : 6} align="center" sx={{ py: 3, color: '#656d76', fontSize: '0.875rem', borderBottom: '1px solid #d0d7de' }}>
									<Typography variant="body2" color="text.secondary">No agents found.</Typography>
								</TableCell>
							</TableRow>
						)}
						{isLoading && (
                            <TableRow>
                                <TableCell colSpan={discoverMatches ? 7 : 6} align="center" sx={{ py: 3, color: '#656d76', fontSize: '0.875rem', borderBottom: '1px solid #d0d7de' }}>
									<Typography variant="body2" color="text.secondary">Loading…</Typography>
								</TableCell>
							</TableRow>
						)}
					{data.rows.filter((row) => {
						const inDiscover = !discoverMatches || discoverMatches.has(row.agentId);
						return inDiscover && (!mineOnly || owned[row.agentId]);
					}).sort((a, b) => {
						// Sort by trust score if discover is active (highest first)
						if (discoverMatches && discoverTrustScores[a.agentId] && discoverTrustScores[b.agentId]) {
							return discoverTrustScores[b.agentId].score - discoverTrustScores[a.agentId].score;
						}
						// If only one has a score, prioritize it
						if (discoverMatches && discoverTrustScores[a.agentId]) return -1;
						if (discoverMatches && discoverTrustScores[b.agentId]) return 1;
						// Default: maintain original order
						return 0;
					})?.map((row) => (
									<TableRow 
										key={`${row.chainId}-${row.agentId}`} 
										hover
										sx={{
											borderBottom: '1px solid #d0d7de',
											'&:hover': {
												backgroundColor: '#f6f8fa',
											},
											'&:last-child': {
												borderBottom: 'none',
											},
										}}
									>
										<TableCell sx={{ color: '#24292f', fontSize: { xs: '0.75rem', sm: '0.875rem' }, py: { xs: 0.75, sm: 1 } }}>
											{(() => {
												// Map chainId to lowercase hyphenated format
												const getChainDisplayName = (chainId: number): string => {
													switch (chainId) {
														case 11155111: return 'eth-sepolia';
														case 84532: return 'base-sepolia';
														case 11155420: return 'op-sepolia';
														default: return `chain-${chainId}`;
													}
												};
												
												return (
													<Typography 
														variant="body2" 
														sx={{ 
															fontFamily: 'ui-monospace, monospace',
															fontSize: { xs: '0.75rem', sm: '0.875rem' },
															color: '#24292f',
														}}
													>
														{getChainDisplayName(row.chainId)}
													</Typography>
												);
											})()}
										</TableCell>
										<TableCell sx={{ display: { xs: 'none', sm: 'table-cell' }, color: '#24292f', fontSize: { xs: '0.75rem', sm: '0.875rem' }, py: { xs: 0.75, sm: 1 } }}>
											<Stack direction="row" spacing={0.25} alignItems="center">
												{(() => {
													const acct = metadataAccounts[row.agentId] || (row.agentAddress as `0x${string}`);
													const display = `${acct.slice(0, 6)}...${acct.slice(-4)}`;
													return (
														<Typography 
															component="span" 
															variant="body2" 
															sx={{ fontFamily: 'ui-monospace, monospace', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
															onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
															noWrap 
															title={`Click to view on ${getExplorerName(row.chainId)}: ${acct}`}
															onClick={() => window.open(`${getExplorerUrl(row.chainId)}/address/${acct}`, '_blank')}
														>
															{display}
														</Typography>
													);
												})()}
											</Stack>
                                        </TableCell>
                        <TableCell sx={{ color: '#24292f', fontSize: '0.875rem', py: 1 }}>
                            {(() => {
                                const acct = metadataAccounts[row.agentId] || (row.agentAddress as `0x${string}`);
                                const ens = row.ensEndpoint || agentEnsNames[acct] || agentEnsNames[row.agentAddress];
                                // Use fetched name if database name is empty, otherwise use database name
                                const dbName = row.agentName || '';
                                const fetchedName = metadataNames[row.agentId] || null;
                                const displayName = dbName || fetchedName || null;
                                const a2aPreview = a2aJsonById[row.agentId];
                                const tooltip = a2aPreview ? `${displayName || ens || ''}\n\n${a2aPreview}` : (displayName || ens || '—');
                                const nameText = displayName || ens || '—';
                                if (ens) {
                                    return (
                                        <Typography
                                            component="a"
                                            href={`https://sepolia.app.ens.domains/${ens as string}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            variant="body2"
                                            noWrap
                                            sx={{ fontFamily: 'ui-monospace, monospace', color: 'primary.main', textDecoration: 'underline', cursor: 'pointer', '&:hover': { color: 'primary.dark', textDecoration: 'none' } }}
                                            title={tooltip}
                                        >
                                            {nameText}
                                        </Typography>
                                    );
                                }
                                return (
                                    <Typography
                                        variant="body2"
                                        noWrap
                                        sx={{ fontFamily: 'ui-monospace, monospace' }}
                                        title={tooltip}
                                    >
                                        {nameText}
                                    </Typography>
                                );
                            })()}
                            {(row.ensEndpoint || agentEnsNames[row.agentAddress]) && (
                                <>
                                    <Button 
                                        size="small" 
                                        onClick={() => openEnsDetails(row)}
                                        sx={{ minWidth: 'auto', px: 0.5, py: 0.25, fontSize: '0.65rem', lineHeight: 1, height: 'auto', ml: 0.5 }}
                                    >
                                        ENS
                                    </Button>
                                </>
                            )}
                            {/* Non-owner sees same info buttons already rendered in the previous block; no duplicates needed */}
                        </TableCell>
                                        <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' }, color: '#24292f', fontSize: '0.875rem', py: 1 }}>
                                            <Typography
                                                variant="body2"
                                                noWrap
                                                sx={{ fontFamily: 'ui-monospace, monospace' }}
                                                title={row.description || ''}
                                            >
                                                {(row.description || '—').slice(0, 5)}
                                            </Typography>
                                        </TableCell>

									<TableCell sx={{ color: '#24292f', fontSize: '0.875rem', py: 1 }}>
										<Stack direction="row" spacing={1} alignItems="center">
											{(() => {
												// Get chain-specific registry address
												const registryAddress = getIdentityRegistry(row.chainId);
												
												if (registryAddress) {
													return (
														<>
														<Typography
															component="a"
															href={`${getExplorerUrl(row.chainId)}/nft/${registryAddress}/${row.agentId}`}
															target="_blank"
															rel="noopener noreferrer"
															variant="body2"
															sx={{ fontFamily: 'ui-monospace, monospace', color: 'primary.main', textDecoration: 'underline', cursor: 'pointer', '&:hover': { color: 'primary.dark', textDecoration: 'none' } }}
															title={`View NFT #${row.agentId} on ${getExplorerName(row.chainId)}`}
														>
															{row.agentId}
														</Typography>
														
														</>
													);
												} else {
													return (
														<Chip label={row.agentId} size="small" sx={{ fontFamily: 'ui-monospace, monospace' }} />
													);
												}
											})()}

											{/* Always-visible actions (read-only) */}
											<Button 
												size="small" 
												onClick={() => openAgentInfo(row)}
												sx={{ minWidth: 'auto', px: 0.5, py: 0.25, fontSize: '0.65rem', lineHeight: 1, height: 'auto', ml: 0.5 }}
											>
												Info
											</Button>
											<Tooltip title={row.metadataURI || 'No registration URI'}>
												<span>
													<Button 
														size="small" 
														onClick={() => openIdentityJson(row)}
														disabled={!isValidRegistrationUri(row.metadataURI) || tokenUriValidById[row.agentId] === false /* allow null (unknown) */}
														sx={{ minWidth: 'auto', px: 0.5, py: 0.25, fontSize: '0.65rem', lineHeight: 1, height: 'auto' }}
													>
														Reg
													</Button>
												</span>
											</Tooltip>
											{owned[row.agentId] && (
												<>
													
													<Button 
														size="small" 
														onClick={() => viewOrCreateCard(row)}
														sx={{ minWidth: 'auto', px: 0.5, py: 0.25, fontSize: '0.65rem', lineHeight: 1, height: 'auto' }}
													>
														Card
													</Button>
													<Button 
														size="small" 
														onClick={() => openDidWebModal(row)}
														sx={{ minWidth: 'auto', px: 0.5, py: 0.25, fontSize: '0.65rem', lineHeight: 1, height: 'auto' }}
													>
														DID:Web
													</Button>
													<Button 
														size="small" 
														onClick={() => openDidAgentModal(row)}
														sx={{ minWidth: 'auto', px: 0.5, py: 0.25, fontSize: '0.65rem', lineHeight: 1, height: 'auto' }}
													>
														DID:Agent
													</Button>
													<Button 
														size="small" 
														onClick={() => openSessionFor(row)} 
														disabled={sessionLoading}
														sx={{ minWidth: 'auto', px: 0.5, py: 0.25, fontSize: '0.65rem', lineHeight: 1, height: 'auto' }}
													>
														{sessionLoading ? 'Loading...' : 'Session'}
													</Button>
													<Tooltip title="Burn Identity (send to 0x000…dEaD)">
													<span>
													<IconButton
														size="small"
														color="error"
														onClick={async () => {
															try {
                                            const registry = process.env.NEXT_PUBLIC_ETH_SEPOLIA_IDENTITY_REGISTRY as `0x${string}`;
																if (!registry) throw new Error('Registry address not configured');
																const rpcUrl = (process.env.NEXT_PUBLIC_RPC_URL as string) || 'https://rpc.ankr.com/eth_sepolia';
																const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
																const walletClient = createWalletClient({ chain: sepolia as any, transport: custom(provider as any), account: eoa as `0x${string}` });

																const domainOwnerAddress = row.agentAddress;
																const smartAccountClient = await toMetaMaskSmartAccount({
																	address: domainOwnerAddress as `0x${string}`,
																	client: publicClient,
																	implementation: Implementation.Hybrid,
																	signatory: { walletClient },
																});

																// Build calldata for transferFrom(from=AA, to=0x000...dEaD, tokenId)
																const calldata = encodeFunctionData({
																	abi: registryAbi as any,
																	functionName: 'transferFrom' as any,
																	args: [domainOwnerAddress, '0x000000000000000000000000000000000000dEaD' as `0x${string}`, BigInt(row.agentId)],
																});

																// Send UO via bundler
																const bundlerUrl2 = (process.env.NEXT_PUBLIC_BUNDLER_URL as string) || '';
																const pimlicoClient2 = createPimlicoClient({ transport: http(bundlerUrl2) });
																const bundlerClient2 = createBundlerClient({
																	transport: http(bundlerUrl2),
																	paymaster: true as any,
																	chain: sepolia as any,
																	paymasterContext: { mode: 'SPONSORED' },
																} as any);
																const { fast: fee2 } = await pimlicoClient2.getUserOperationGasPrice();

																console.info(" send user operation to burn identity");
																const userOpHash = await bundlerClient2.sendUserOperation({
																	account: smartAccountClient as any,
																	calls: [{ to: registry, data: calldata }],
																	...fee2,
																});
																await bundlerClient2.waitForUserOperationReceipt({ hash: userOpHash });
																console.info(" burn completed");
																fetchData(data?.page ?? 1);
															} catch (err) {
																console.error('Failed to burn identity', err);
															}
														}}
														sx={{ minWidth: 'auto', p: 0.5, lineHeight: 1, height: 'auto' }}
													>
														<LocalFireDepartmentIcon fontSize="small" />
												</IconButton>
													{/* JSON link moved outside tooltip to avoid burn hover text */}
												</span>
												</Tooltip>
												</>
											)}

									
											
												
											
										
										</Stack>
									</TableCell>

							<TableCell sx={{ color: '#24292f', fontSize: '0.875rem', py: 1 }}>
								{row.a2aEndpoint ? (
									<Button 
										size="small" 
										onClick={() => window.open(row.a2aEndpoint as string, '_blank')}
										sx={{ 
											minWidth: 'auto',
											px: 0.5,
											py: 0.25,
											fontSize: '0.65rem',
											lineHeight: 1,
											height: 'auto'
										}}
									>
										A2A
									</Button>
								) : (
									<Typography variant="body2" color="text.secondary">—</Typography>
								)}
							</TableCell>

							{discoverMatches && (
								<TableCell sx={{ color: '#24292f', fontSize: '0.875rem', py: 1 }}>
									{discoverTrustScores[row.agentId] ? (
										<Tooltip title={discoverTrustScores[row.agentId].reasoning || 'Trust score based on feedback and relationships'} arrow>
											<Chip 
												label={`${discoverTrustScores[row.agentId].score}/100`}
												size="small"
												color={discoverTrustScores[row.agentId].score >= 70 ? 'success' : discoverTrustScores[row.agentId].score >= 40 ? 'warning' : 'error'}
												sx={{ fontWeight: 600 }}
											/>
										</Tooltip>
									) : (
										<Typography variant="body2" color="text.secondary">—</Typography>
									)}
								</TableCell>
							)}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</TableContainer>

		{/* Identity JSON dialog */}
		<Dialog open={identityJsonOpen} onClose={() => setIdentityJsonOpen(false)} fullWidth maxWidth="md">
			<DialogTitle>Agent Identity Registration</DialogTitle>
			<DialogContent dividers>
                {/* Always show NFT/registration URI if we know it */}
                {identityCurrentAgent?.agentId && (
                    <Box sx={{ mb: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                            NFT URL:&nbsp;
                            {(() => {
                                // Get chain-specific registry address
                                const reg = getIdentityRegistry(identityCurrentAgent.chainId);
                                if (reg) {
                                    const href = `${getExplorerUrl(identityCurrentAgent.chainId)}/nft/${reg}/${identityCurrentAgent.agentId}`;
                                    return (
                                        <Typography component="a" href={href} target="_blank" rel="noopener noreferrer" variant="caption" sx={{ color: 'primary.main', textDecoration: 'underline' }}>
                                            {href}
                                        </Typography>
                                    );
                                }
                                return <Typography component="span" variant="caption">—</Typography>;
                            })()}
                        </Typography>
                        {identityTokenUri && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                tokenURI:&nbsp;
                                <Typography component="a" href={identityTokenUri} target="_blank" rel="noopener noreferrer" variant="caption" sx={{ color: 'primary.main', textDecoration: 'underline' }}>
                                    {identityTokenUri}
                                </Typography>
                            </Typography>
                        )}
                    </Box>
                )}
                {identityJsonLoading ? (
                    <Typography variant="body2" color="text.secondary">Loading…</Typography>
                ) : identityJsonError ? (
                    <Typography variant="body2" color="error">{identityJsonError}</Typography>
                ) : identityJsonData ? (
					<Grid container spacing={2}>
						{/* Left: endpoints editor */}
						{identityCurrentAgent && owned[identityCurrentAgent.agentId] && (
						<Grid item xs={12} md={6} sx={{ display: { xs: 'none', md: 'block' } }}>
						<Stack spacing={1}>
								{identityUpdateError && (
									<Box sx={{ p: 1, bgcolor: 'error.light', borderRadius: 1 }}>
										<Typography variant="caption" color="error">{identityUpdateError}</Typography>
									</Box>
								)}
								<Stack direction="row" alignItems="center" justifyContent="space-between">
									<Typography variant="subtitle2">Endpoints</Typography>
									<IconButton size="small" onClick={addEndpointRow}><AddIcon fontSize="inherit" /></IconButton>
								</Stack>
								<Stack spacing={1}>
									{identityEndpoints.map((ep, idx) => (
										<Box key={idx} sx={{ p: 1, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
											<Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
												<Typography variant="caption">Endpoint #{idx + 1}</Typography>
												<IconButton 
													size="small" 
													disabled={!identityCurrentAgent || !owned[identityCurrentAgent.agentId]}
													onClick={() => removeEndpointRow(idx)}
												>
													<DeleteIcon fontSize="inherit" />
												</IconButton>
											</Stack>
											<Grid container spacing={1}>
												<Grid item xs={12} sm={6}>
													<TextField 
														fullWidth 
														size="small" 
														label="name" 
														value={ep.name} 
														disabled={!identityCurrentAgent || !owned[identityCurrentAgent.agentId]}
														onChange={(e) => handleEndpointFieldChange(idx, 'name', e.target.value)} 
													/>
												</Grid>
												<Grid item xs={12} sm={6}>
													<TextField 
														fullWidth 
														size="small" 
														label="version" 
														value={ep.version || ''} 
														disabled={!identityCurrentAgent || !owned[identityCurrentAgent.agentId]}
														onChange={(e) => handleEndpointFieldChange(idx, 'version', e.target.value)} 
													/>
												</Grid>
												<Grid item xs={12}>
													<TextField 
														fullWidth 
														size="small" 
														label="endpoint" 
														value={ep.endpoint} 
														disabled={!identityCurrentAgent || !owned[identityCurrentAgent.agentId]}
														onChange={(e) => handleEndpointFieldChange(idx, 'endpoint', e.target.value)} 
													/>
												</Grid>
											</Grid>
										</Box>
									))}
								</Stack>
							</Stack>
						</Grid>
						)}
						{/* Right: merged JSON preview */}
						<Grid item xs={12} md={identityCurrentAgent && owned[identityCurrentAgent.agentId] ? 6 : 12}>
							<Box sx={{ position: 'relative', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
								<IconButton size="small" aria-label="Copy JSON" onClick={() => { try { const merged = { ...(identityJsonData || {}), endpoints: identityEndpoints }; navigator.clipboard.writeText(JSON.stringify(merged, null, 2)).catch(() => {}); } catch {} }} sx={{ position: 'absolute', top: 4, right: 4 }}>
									<ContentCopyIcon fontSize="inherit" />
								</IconButton>
								<Box component="pre" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, fontFamily: 'ui-monospace, monospace', m: 0 }}>
									{(() => {
										try {
											const merged = { ...(identityJsonData || {}), endpoints: identityEndpoints };
											return JSON.stringify(merged, null, 2);
										} catch {
											return identityJsonText;
										}
									})()}
								</Box>
							</Box>
						</Grid>
					</Grid>
                ) : (
                    <Typography variant="body2" color="text.secondary">No data</Typography>
                )}
			</DialogContent>
			<DialogActions>
				{identityCurrentAgent && owned[identityCurrentAgent.agentId] && (
				<>
					<Button 
						variant="contained" 
						size="small" 
						disabled={identityUpdateLoading || identityJsonLoading || !identityJsonData}
						onClick={updateIdentityRegistration}
						sx={{
							display: { xs: 'none', sm: 'inline-flex' },
							backgroundColor: 'rgb(31, 136, 61)',
							color: '#ffffff',
							'&:hover': {
								backgroundColor: 'rgb(26, 115, 51)',
							},
							'&:disabled': {
								backgroundColor: 'rgba(31, 136, 61, 0.5)',
								color: '#ffffff',
							},
						}}
					>
						{identityUpdateLoading ? 'Updating…' : 'Update'}
					</Button>
					<Button 
						onClick={() => { try { const eps = Array.isArray((identityJsonData as any)?.endpoints) ? (identityJsonData as any).endpoints : []; setIdentityEndpoints(eps.map((e: any) => ({ name: String(e?.name ?? ''), endpoint: String(e?.endpoint ?? ''), version: e?.version ? String(e.version) : '' }))); } catch { setIdentityEndpoints([]); } }}
						sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
					>
						Reset
					</Button>
				</>
				)}
				<Button onClick={() => setIdentityJsonOpen(false)}>Close</Button>
			</DialogActions>
		</Dialog>

		{/* ENS details dialog */}
		<Dialog open={ensDetailsOpen} onClose={() => setEnsDetailsOpen(false)} fullWidth maxWidth="sm">
			<DialogTitle>ENS Details</DialogTitle>
			<DialogContent dividers>
				{ensDetailsLoading ? (
					<Typography variant="body2" color="text.secondary">Loading…</Typography>
				) : ensDetailsError ? (
					<Typography variant="body2" color="error">{ensDetailsError}</Typography>
				) : ensDetails ? (
					<Stack spacing={1}>
						<Typography variant="body2"><strong>Name:</strong> {ensDetails.name}</Typography>
						<Typography variant="body2"><strong>NFT tokenId:</strong> {ensDetails.tokenId}</Typography>
						<Typography variant="body2"><strong>URL:</strong> {ensDetails.urlText ?? '—'}</Typography>
						<Typography variant="body2"><strong>agent-identity:</strong> {ensDetails.agentIdentity ?? '—'}</Typography>
						{ensDetails.decodedIdentity && (
							<Stack spacing={0.5} sx={{ pl: 1 }}>
								<Typography variant="caption" color="text.secondary">chainId: {ensDetails.decodedIdentity.chainId}</Typography>
								<Typography variant="caption" color="text.secondary">address: {ensDetails.decodedIdentity.address}</Typography>
								<Typography variant="caption" color="text.secondary">agentId: {ensDetails.decodedIdentity.agentId}</Typography>
							</Stack>
						)}
					</Stack>
				) : (
					<Typography variant="body2" color="text.secondary">No details</Typography>
				)}
			</DialogContent>
			<DialogActions>
				<Button onClick={() => setEnsDetailsOpen(false)}>Close</Button>
			</DialogActions>
		</Dialog>

		{/* Agent INFO dialog - ENS Name Card Style */}
		<Dialog open={infoOpen} onClose={() => setInfoOpen(false)} fullWidth maxWidth="md" PaperProps={{ sx: { borderRadius: 2 } }}>
			{infoLoading ? (
				<>
					<DialogTitle>Loading…</DialogTitle>
					<DialogContent>
						<Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>Loading agent information…</Typography>
					</DialogContent>
				</>
			) : infoError ? (
				<>
					<DialogTitle>Error</DialogTitle>
					<DialogContent>
						<Typography variant="body2" color="error" sx={{ py: 2 }}>{infoError}</Typography>
					</DialogContent>
					<DialogActions>
						<Button onClick={() => setInfoOpen(false)}>Close</Button>
					</DialogActions>
				</>
			) : infoData ? (
				<>
					{/* Header - Domain Name */}
					<Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', p: 3, position: 'relative' }}>
						<Typography variant="h4" component="h1" sx={{ fontWeight: 600, mb: 0.5, wordBreak: 'break-word' }}>
							{infoData.agentName || 'Unnamed Agent'}
						</Typography>
						{infoData.agentName && (
							<Link 
								href={`https://sepolia.app.ens.domains/${infoData.agentName}`} 
								target="_blank" 
								rel="noopener noreferrer"
								sx={{ color: 'primary.contrastText', opacity: 0.9, textDecoration: 'none', fontSize: '0.875rem', '&:hover': { textDecoration: 'underline' } }}
							>
								View on ENS App →
							</Link>
						)}
					</Box>

					<DialogContent sx={{ p: 0 }}>
						<Stack spacing={0}>
							{/* Address Records Card */}
							<Card variant="outlined" sx={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}>
								<CardHeader 
									title="Address" 
									titleTypographyProps={{ variant: 'subtitle2', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}
									sx={{ pb: 1 }}
								/>
								<CardContent sx={{ pt: 0 }}>
									{infoData.agentAccount ? (
										<Stack spacing={1}>
											<Box>
												<Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
													{infoData.chainId ? getExplorerName(infoData.chainId) : 'Ethereum'}
												</Typography>
												<Stack direction="row" spacing={1} alignItems="center">
													{infoData.chainId && getExplorerUrl(infoData.chainId) && infoData.agentAccount ? (
														<Link 
															href={`${getExplorerUrl(infoData.chainId)}/address/${infoData.agentAccount}`} 
															target="_blank" 
															rel="noopener noreferrer"
															sx={{ 
																fontFamily: 'monospace', 
																wordBreak: 'break-all',
																fontWeight: 500,
																textDecoration: 'none',
																color: 'inherit',
																flex: 1,
																'&:hover': { textDecoration: 'underline' }
															}}
														>
															{infoData.agentAccount}
														</Link>
													) : (
														<Typography 
															variant="body2" 
															sx={{ 
																fontFamily: 'monospace', 
																wordBreak: 'break-all',
																fontWeight: 500,
																flex: 1
															}}
														>
															{infoData.agentAccount}
														</Typography>
													)}
													<Tooltip title="Copy address">
														<IconButton 
															size="small" 
															onClick={() => navigator.clipboard.writeText(infoData.agentAccount!)}
														>
															<ContentCopyIcon fontSize="small" />
														</IconButton>
													</Tooltip>
												</Stack>
											</Box>
										</Stack>
									) : (
										<Typography variant="body2" color="text.secondary">No address set</Typography>
									)}
								</CardContent>
							</Card>

							{/* Text Records Card */}
							<Card variant="outlined" sx={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}>
								<CardHeader 
									title="Records" 
									titleTypographyProps={{ variant: 'subtitle2', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}
									sx={{ pb: 1 }}
								/>
								<CardContent sx={{ pt: 0 }}>
									<Stack spacing={2}>
										{infoData.agentId && (
											<Box>
												<Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Agent ID</Typography>
												<Stack direction="row" spacing={1} alignItems="center">
													<Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
														{infoData.agentId}
													</Typography>
													{infoData.chainId && (() => {
														const identityRegistry = getIdentityRegistry(infoData.chainId);
														const explorerBase = getExplorerUrl(infoData.chainId);
														if (identityRegistry && explorerBase) {
															const nftUrl = `${explorerBase}/nft/${identityRegistry}/${infoData.agentId}`;
															return (
																<Link 
																	href={nftUrl} 
																	target="_blank" 
																	rel="noopener noreferrer"
																	sx={{ 
																		fontSize: '0.875rem',
																		textDecoration: 'none',
																		'&:hover': { textDecoration: 'underline' }
																	}}
																>
																	View on {getExplorerName(infoData.chainId)} →
																</Link>
															);
														}
														return null;
													})()}
												</Stack>
											</Box>
										)}
										{infoData.a2aEndpoint && (
											<Box>
												<Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>A2A Endpoint</Typography>
												<Link 
													href={infoData.a2aEndpoint} 
													target="_blank" 
													rel="noopener noreferrer"
													sx={{ 
														wordBreak: 'break-all',
														fontSize: '0.875rem',
														textDecoration: 'none',
														'&:hover': { textDecoration: 'underline' }
													}}
												>
													{infoData.a2aEndpoint}
												</Link>
											</Box>
										)}
										
										{infoData.tokenUri && (
											<Box>
												<Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Token URI</Typography>
												<Typography 
													variant="body2" 
													sx={{ 
														wordBreak: 'break-all',
														fontFamily: 'monospace',
														fontSize: '0.875rem'
													}}
												>
													{infoData.tokenUri}
												</Typography>
											</Box>
										)}
									</Stack>
								</CardContent>
							</Card>
						</Stack>
					</DialogContent>
					<DialogActions sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
						<Button onClick={() => setInfoOpen(false)} variant="outlined">Close</Button>
					</DialogActions>
				</>
			) : (
				<>
					<DialogTitle>No Information</DialogTitle>
					<DialogContent>
						<Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>No agent information available</Typography>
					</DialogContent>
					<DialogActions>
						<Button onClick={() => setInfoOpen(false)}>Close</Button>
					</DialogActions>
				</>
			)}
		</Dialog>

			{/* Agent Card dialog */}
			<Dialog open={cardOpen} onClose={() => setCardOpen(false)} fullWidth maxWidth="md">
				<DialogTitle>Agent Card {cardDomain ? `— ${cardDomain}` : ''}</DialogTitle>
				<DialogContent dividers>
					<Grid container spacing={2}>
						<Grid item xs={12} md={6}>
							<Stack spacing={1} sx={{ mb: 2 }}>
								<TextField label="name" size="small" value={cardFields.name ?? ''} onChange={(e) => handleFieldChange('name', e.target.value)} />
								<TextField label="description" size="small" value={cardFields.description ?? ''} onChange={(e) => handleFieldChange('description', e.target.value)} />
								<TextField label="url" size="small" value={cardFields.url ?? ''} onChange={(e) => handleFieldChange('url', e.target.value)} />
								<TextField label="version" size="small" value={cardFields.version ?? ''} onChange={(e) => handleFieldChange('version', e.target.value)} />
								<TextField label="preferredTransport" size="small" value={cardFields.preferredTransport ?? ''} onChange={(e) => handleFieldChange('preferredTransport', e.target.value)} />
								<TextField label="protocolVersion" size="small" value={cardFields.protocolVersion ?? ''} onChange={(e) => handleFieldChange('protocolVersion', e.target.value)} />
								
								<Divider sx={{ my: 1 }} />
								<Typography variant="subtitle2">Provider</Typography>
								<TextField label="Provider Organization" size="small" value={cardFields.providerOrganization ?? ''} onChange={(e) => handleFieldChange('providerOrganization', e.target.value)} />
								<TextField label="Provider URL" size="small" value={cardFields.providerUrl ?? ''} onChange={(e) => handleFieldChange('providerUrl', e.target.value)} />
		
								<Divider sx={{ my: 1 }} />
								<Typography variant="subtitle2">Capabilities</Typography>
								<FormControlLabel 
									control={<Checkbox checked={!!cardFields.capStream} onChange={(e) => handleFieldChange('capStream', e.target.checked)} />} 
									label="Streaming" 
								/>
								<FormControlLabel 
									control={<Checkbox checked={!!cardFields.capPush} onChange={(e) => handleFieldChange('capPush', e.target.checked)} />} 
									label="Push Notifications" 
								/>
								<FormControlLabel 
									control={<Checkbox checked={!!cardFields.capStateTransitionHistory} onChange={(e) => handleFieldChange('capStateTransitionHistory', e.target.checked)} />} 
									label="State Transition History" 
								/>
								
								<Divider sx={{ my: 1 }} />
								<Typography variant="subtitle2">Extended Card</Typography>
								<FormControlLabel 
									control={<Checkbox checked={!!cardFields.supportsAuthenticatedExtendedCard} onChange={(e) => handleFieldChange('supportsAuthenticatedExtendedCard', e.target.checked)} />} 
									label="Supports Authenticated Extended Card" 
								/>

								<Divider sx={{ my: 1 }} />
								<Stack direction="row" alignItems="center" justifyContent="space-between">
									<Typography variant="subtitle2">Skills</Typography>
									<IconButton size="small" onClick={() => handleFieldChange('skills', [ ...(cardFields.skills || []), { id: '', name: '', description: '', tags: [], examples: [], inputModes: [], outputModes: [] } ])}><AddIcon fontSize="inherit" /></IconButton>
								</Stack>
								<Stack spacing={1}>
									{(cardFields.skills || []).map((s: any, idx: number) => (
										<Box key={idx} sx={{ p: 1, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
											<Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
												<Typography variant="caption">Skill #{idx + 1}</Typography>
												<IconButton size="small" onClick={() => {
													const next = [...(cardFields.skills || [])];
													next.splice(idx, 1);
													handleFieldChange('skills', next);
												}}><DeleteIcon fontSize="inherit" /></IconButton>
											</Stack>
											<Grid container spacing={1}>
												<Grid item xs={12} sm={6}><TextField fullWidth size="small" label="id" value={s.id} onChange={(e) => {
													const next = [...(cardFields.skills || [])]; next[idx] = { ...next[idx], id: e.target.value }; handleFieldChange('skills', next);
												}} /></Grid>
												<Grid item xs={12} sm={6}><TextField fullWidth size="small" label="name" value={s.name} onChange={(e) => {
													const next = [...(cardFields.skills || [])]; next[idx] = { ...next[idx], name: e.target.value }; handleFieldChange('skills', next);
												}} /></Grid>
												<Grid item xs={12}><TextField fullWidth size="small" label="description" value={s.description} onChange={(e) => {
													const next = [...(cardFields.skills || [])]; next[idx] = { ...next[idx], description: e.target.value }; handleFieldChange('skills', next);
												}} /></Grid>
												<Grid item xs={12}><TextField fullWidth size="small" label="examples (one per line)" multiline minRows={2} value={(s.examples || []).join('\n')} onChange={(e) => {
													const lines = e.target.value.split(/\n/).map((x) => x.trim()).filter(Boolean);
													const next = [...(cardFields.skills || [])]; next[idx] = { ...next[idx], examples: lines }; handleFieldChange('skills', next);
												}} /></Grid>
												<Grid item xs={12}><TextField fullWidth size="small" label="tags (one per line)" multiline minRows={2} value={(s.tags || []).join('\n')} onChange={(e) => {
													const lines = e.target.value.split(/\n/).map((x) => x.trim()).filter(Boolean);
													const next = [...(cardFields.skills || [])]; next[idx] = { ...next[idx], tags: lines }; handleFieldChange('skills', next);
												}} /></Grid>
												<Grid item xs={12}><TextField fullWidth size="small" label="inputModes (one per line)" multiline minRows={2} value={(s.inputModes || []).join('\n')} onChange={(e) => {
													const lines = e.target.value.split(/\n/).map((x) => x.trim()).filter(Boolean);
													const next = [...(cardFields.skills || [])]; next[idx] = { ...next[idx], inputModes: lines }; handleFieldChange('skills', next);
												}} /></Grid>
												<Grid item xs={12}><TextField fullWidth size="small" label="outputModes (one per line)" multiline minRows={2} value={(s.outputModes || []).join('\n')} onChange={(e) => {
													const lines = e.target.value.split(/\n/).map((x) => x.trim()).filter(Boolean);
													const next = [...(cardFields.skills || [])]; next[idx] = { ...next[idx], outputModes: lines }; handleFieldChange('skills', next);
												}} /></Grid>
											</Grid>
										</Box>
									))}
								</Stack>

								<Divider sx={{ my: 1 }} />
								<TextField label="trustModels (one per line)" size="small" multiline minRows={2} value={Array.isArray(cardFields.trustModels) ? cardFields.trustModels.join('\n') : ''} onChange={(e) => handleFieldChange('trustModels', e.target.value.split(/\n/).map((x) => x.trim()).filter(Boolean))} />
								<TextField label="defaultInputModes (one per line)" size="small" multiline minRows={2} value={Array.isArray(cardFields.defaultInputModes) ? cardFields.defaultInputModes.join('\n') : ''} onChange={(e) => handleFieldChange('defaultInputModes', e.target.value.split(/\n/).map((x) => x.trim()).filter(Boolean))} />
								<TextField label="defaultOutputModes (one per line)" size="small" multiline minRows={2} value={Array.isArray(cardFields.defaultOutputModes) ? cardFields.defaultOutputModes.join('\n') : ''} onChange={(e) => handleFieldChange('defaultOutputModes', e.target.value.split(/\n/).map((x) => x.trim()).filter(Boolean))} />
							</Stack>
							{cardLoading && <Typography variant="body2">Building…</Typography>}
							{cardError && <Typography variant="body2" color="error">{cardError}</Typography>}
						</Grid>
						<Grid item xs={12} md={6}>
							<Box>
								<Box sx={{ position: 'relative', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
									<IconButton size="small" aria-label="Copy JSON" onClick={() => { try { const base = cardJson ? JSON.parse(cardJson) : {}; const merged = { ...base,
										name: cardFields.name || base.name,
										description: cardFields.description || base.description,
										homepage: cardFields.homepage || base.homepage,
										url: cardFields.url || base.url,
										version: cardFields.version || base.version,
										preferredTransport: cardFields.preferredTransport || base.preferredTransport,
										protocolVersion: cardFields.protocolVersion || base.protocolVersion,
										trustModels: Array.isArray(cardFields.trustModels) ? cardFields.trustModels : String(cardFields.trustModels || '').split(',').map((x: string) => x.trim()).filter(Boolean),
										capabilities: { pushNotifications: !!cardFields.capPush, streaming: !!cardFields.capStream },
										defaultInputModes: String(cardFields.defaultInputModes || '').split(',').map((x: string) => x.trim()).filter(Boolean),
										defaultOutputModes: String(cardFields.defaultOutputModes || '').split(',').map((x: string) => x.trim()).filter(Boolean),
										skills: [{ id: cardFields.skillId || undefined, name: cardFields.skillName || undefined, description: cardFields.skillDesc || undefined, tags: String(cardFields.skillTags || '').split(',').map((x: string) => x.trim()).filter(Boolean), examples: String(cardFields.skillExamples || '').split(/\n|,/).map((x: string) => x.trim()).filter(Boolean) }]
									}; navigator.clipboard.writeText(JSON.stringify(merged, null, 2)).catch(() => {});} catch { navigator.clipboard.writeText(cardJson || '').catch(() => {}); } }} sx={{ position: 'absolute', top: 4, right: 4 }}>
										<ContentCopyIcon fontSize="inherit" />
									</IconButton>
									{cardJson && (() => {
										try {
											const obj = JSON.parse(cardJson);
											// Merge editable fields
											const merged = {
												...buildMerged(obj),
											};
											if (obj?.registrations?.[0]?.signature) {
												merged.registrations[0].signature = obj.registrations[0].signature;
											}
											// Remove description field from display
											const { description, ...mergedWithoutDesc } = merged;
											const shortJson = JSON.stringify(mergedWithoutDesc, null, 2);
											return <Box component="pre" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, fontFamily: 'ui-monospace, monospace', m: 0 }}>{shortJson}</Box>;
										} catch {
											return <Box component="pre" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, fontFamily: 'ui-monospace, monospace', m: 0 }}>{cardJson}</Box>;
										}
									})()}
								</Box>
							</Box>
						</Grid>
					</Grid>
			</DialogContent>
			<DialogActions>
				<Button onClick={async () => { if (currentAgentForCard) { await regenerateCard(currentAgentForCard); } }}>Reset</Button>
				<Button onClick={() => { if (cardJson && cardDomain) setStoredCard(cardDomain, cardJson); setCardOpen(false); }}>Close</Button>
			</DialogActions>
			</Dialog>

			{/* Session dialog */}
			<Dialog open={sessionOpen} onClose={() => setSessionOpen(false)} fullWidth maxWidth="sm">
				<DialogTitle>Session Package</DialogTitle>
				<DialogContent dividers>
					<Box sx={{ position: 'relative', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
						<IconButton size="small" aria-label="Copy" onClick={() => { if (sessionJson) { navigator.clipboard.writeText(sessionJson).catch(() => {}); } }} sx={{ position: 'absolute', top: 4, right: 4 }}>
							<ContentCopyIcon fontSize="inherit" />
						</IconButton>
						<Box component="pre" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, fontFamily: 'ui-monospace, monospace', m: 0 }}>
							{sessionJson}
						</Box>
					</Box>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setSessionOpen(false)}>Close</Button>
				</DialogActions>
			</Dialog>

			{/* Feedback Dialog */}
			<Dialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} maxWidth="md" fullWidth>
				<DialogTitle>
					Feedback for {currentAgent?.agentName}
				</DialogTitle>
				<DialogContent>
					{feedbackLoading && (
						<Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
							<Typography>Loading feedback data...</Typography>
						</Box>
					)}
					
					{feedbackError && (
						<Box sx={{ p: 2, bgcolor: 'error.light', borderRadius: 1, mb: 2 }}>
							<Typography color="error">{feedbackError}</Typography>
						</Box>
					)}
					
					{!feedbackLoading && !feedbackError && feedbackData.length === 0 && (
						<Box sx={{ p: 2, textAlign: 'center' }}>
							<Typography color="text.secondary">No feedback data available</Typography>
						</Box>
					)}
					
					{!feedbackLoading && !feedbackError && feedbackData.length > 0 && (
						<Stack spacing={2}>
							{feedbackData.map((item, index) => (
								<Paper key={index} sx={{ p: 2, bgcolor: 'grey.50' }}>
									<Stack spacing={1}>
										{Object.entries(item).map(([key, value]) => (
											<Box key={key}>
												<Typography variant="subtitle2" color="primary" sx={{ fontWeight: 600 }}>
													{key}:
												</Typography>
												<Typography variant="body2" sx={{ 
													fontFamily: typeof value === 'object' ? 'ui-monospace, monospace' : 'inherit',
													whiteSpace: 'pre-wrap',
													wordBreak: 'break-word'
												}}>
													{typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
												</Typography>
											</Box>
										))}
									</Stack>
								</Paper>
							))}
							<Stack direction="row" spacing={1} sx={{ mt: 1 }}>
								<Button 
									variant="contained" 
									size="small" 
									disabled={identityUpdateLoading} 
									onClick={updateIdentityRegistration}
									sx={{
										backgroundColor: 'rgb(31, 136, 61)',
										color: '#ffffff',
										'&:hover': {
											backgroundColor: 'rgb(26, 115, 51)',
										},
										'&:disabled': {
											backgroundColor: 'rgba(31, 136, 61, 0.5)',
											color: '#ffffff',
										},
									}}
								>
									{identityUpdateLoading ? 'Updating…' : 'Update'}
								</Button>
								<Button size="small" onClick={() => { try { const eps = Array.isArray((identityJsonData as any)?.endpoints) ? (identityJsonData as any).endpoints : []; setIdentityEndpoints(eps.map((e: any) => ({ name: String(e?.name ?? ''), endpoint: String(e?.endpoint ?? ''), version: e?.version ? String(e.version) : '' }))); } catch { setIdentityEndpoints([]); } }}>Reset</Button>
							</Stack>
						</Stack>
					)}
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setFeedbackOpen(false)}>Close</Button>
				</DialogActions>
			</Dialog>

		{/* All Feedback Dialog */}
		<Dialog open={allFeedbackOpen} onClose={() => setAllFeedbackOpen(false)} maxWidth="md" fullWidth>
			<DialogTitle>
				All Feedback for {currentAgent?.agentName}
			</DialogTitle>
			<DialogContent dividers>
				{allFeedbackLoading && (
					<Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
						<Typography>Loading…</Typography>
					</Box>
				)}
				{allFeedbackError && (
					<Box sx={{ p: 2, bgcolor: 'error.light', borderRadius: 1, mb: 2 }}>
						<Typography color="error">{allFeedbackError}</Typography>
					</Box>
				)}
				{!allFeedbackLoading && !allFeedbackError && allFeedbackData.length === 0 && (
					<Typography variant="body2" color="text.secondary">No feedback found.</Typography>
				)}
				{!allFeedbackLoading && !allFeedbackError && allFeedbackData.length > 0 && (
					<Stack spacing={1}>
						{allFeedbackData.map((fb: any, idx: number) => (
							<Box key={idx} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
								<Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{typeof fb === 'string' ? fb : JSON.stringify(fb)}</Typography>
							</Box>
						))}
					</Stack>
				)}
			</DialogContent>
			<DialogActions>
				<Button onClick={() => setAllFeedbackOpen(false)}>Close</Button>
			</DialogActions>
		</Dialog>

			{/* ENS Dialog */}
			<Dialog open={ensOpen} onClose={() => setEnsOpen(false)} maxWidth="md" fullWidth>
				<DialogTitle sx={{ pb: 1 }}>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
						<Box>
							<Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
								Agent ENS Domain
							</Typography>
							{ensData?.name && (
								<Typography 
									variant="h6" 
									sx={{ 
										fontFamily: 'ui-monospace, monospace', 
										color: 'primary.main',
										fontWeight: 500,
										cursor: 'pointer',
										'&:hover': {
											textDecoration: 'underline'
										}
									}}
									onClick={() => {
										window.open(`https://sepolia.app.ens.domains/${ensData.name}`, '_blank');
									}}
								>
									{ensData.name}
								</Typography>
							)}
						</Box>
					</Box>
				</DialogTitle>
				<DialogContent>
					{ensLoading && (
						<Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
							<Typography>Loading ENS data...</Typography>
						</Box>
					)}
					
					{isCheckingWrapStatus && (
						<Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
							<Typography>Checking parent domain status...</Typography>
						</Box>
					)}
					
					{ensError && (
						<Box sx={{ p: 2, bgcolor: 'error.light', borderRadius: 2, mb: 3 }}>
							<Typography color="error">{ensError}</Typography>
						</Box>
					)}
					
					{!ensLoading && !ensError && ensData && (
						<Stack spacing={3}>
							{ensData.name ? (
								<>
									{/* ENS Domain Information */}
									<Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
										<Stack spacing={2}>

											{/* Owner Address */}
											<Box>
												<Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
													Owner
												</Typography>
												<Typography 
													variant="body1" 
													sx={{ 
														fontFamily: 'ui-monospace, monospace',
														color: 'primary.main',
														cursor: 'pointer',
														'&:hover': {
															textDecoration: 'underline'
														}
													}}
													onClick={() => window.open(`${getExplorerUrl(ensCurrentAgent?.chainId || 11155111)}/address/${ensCurrentAgent?.agentAddress}`, '_blank')}
												>
													{ensCurrentAgent?.agentAddress}
												</Typography>
											</Box>

											{/* NFT Wrapper Link */}
											<Box>
												<Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
													NFT Wrapper
												</Typography>
												<Box sx={{ 
													p: 2, 
													bgcolor: 'white', 
													borderRadius: 1,
													border: '1px solid',
													borderColor: 'info.main',
													display: 'flex',
													alignItems: 'center',
													gap: 1,
													cursor: 'pointer',
													'&:hover': {
														bgcolor: 'grey.50',
														'& .nft-icon': {
															filter: 'brightness(0) invert(1)'
														}
													}
												}}
												onClick={() => {
													if (ensData.name) {
														const tokenId = BigInt(namehash(ensData.name as string));
														const nftUrl = `https://sepolia.etherscan.io/nft/${(process.env.NEXT_PUBLIC_ENS_IDENTITY_WRAPPER as `0x${string}`) || '0x0635513f179D50A207757E05759CbD106d7dFcE8'}/${tokenId}`;
														window.open(nftUrl, '_blank');
													}
												}}
												>
													<img 
														src="https://sepolia.etherscan.io/images/main/nft-placeholder.svg" 
														alt="NFT" 
														className="nft-icon"
														style={{ 
															width: 24, 
															height: 24,
															transition: 'filter 0.2s ease'
														}} 
													/>
													<Typography variant="body2" sx={{ fontWeight: 500 }}>
														View on Etherscan
													</Typography>
												</Box>
											</Box>
										</Stack>
									</Paper>
									
									{ensData.avatar && (
										<Box>
											<Typography variant="subtitle2" color="primary" sx={{ fontWeight: 600, mb: 1 }}>
												Avatar:
											</Typography>
											<Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
												<img 
													src={ensData.avatar} 
													alt="ENS Avatar" 
													style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }}
													onError={(e) => {
														e.currentTarget.style.display = 'none';
													}}
												/>
												<Typography variant="body2" sx={{ 
													fontFamily: 'ui-monospace, monospace',
													wordBreak: 'break-all'
												}}>
													{ensData.avatar}
												</Typography>
											</Box>
										</Box>
									)}
									
									{(ensData.website || ensData.email || ensData.twitter || ensData.github || ensData.discord) && (
										<Box>
											<Typography variant="subtitle2" color="primary" sx={{ fontWeight: 600, mb: 1 }}>
												Additional Records:
											</Typography>
											<Stack spacing={1}>
												{ensData.website && (
													<Box>
														<Typography variant="body2" sx={{ fontWeight: 600 }}>Website:</Typography>
														<Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace' }}>
															{ensData.website}
														</Typography>
													</Box>
												)}
												{ensData.email && (
													<Box>
														<Typography variant="body2" sx={{ fontWeight: 600 }}>Email:</Typography>
														<Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace' }}>
															{ensData.email}
														</Typography>
													</Box>
												)}
												{ensData.twitter && (
													<Box>
														<Typography variant="body2" sx={{ fontWeight: 600 }}>Twitter:</Typography>
														<Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace' }}>
															{ensData.twitter}
														</Typography>
													</Box>
												)}
												{ensData.github && (
													<Box>
														<Typography variant="body2" sx={{ fontWeight: 600 }}>GitHub:</Typography>
														<Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace' }}>
															{ensData.github}
														</Typography>
													</Box>
												)}
												{ensData.discord && (
													<Box>
														<Typography variant="body2" sx={{ fontWeight: 600 }}>Discord:</Typography>
														<Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace' }}>
															{ensData.discord}
														</Typography>
													</Box>
												)}
											</Stack>
										</Box>
									)}
								</>
							) : (
								<>
									{/* No ENS Name Found */}
									<Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
										<Stack spacing={2}>
											<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
												<Box sx={{ 
													width: 8, 
													height: 8, 
													borderRadius: '50%', 
													bgcolor: 'warning.main' 
												}} />
												<Typography variant="h6" sx={{ fontWeight: 600 }}>
													No ENS Domain Found
												</Typography>
											</Box>
											
											<Typography variant="body2" color="text.secondary">
												This agent address doesn't have an ENS domain associated with it. You can create a subdomain if you own a parent ENS domain.
											</Typography>
										</Stack>
									</Paper>
									
									{/* Create ENS Subdomain Section */}
									<Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
										<Stack spacing={2}>
											<Typography variant="h6" sx={{ fontWeight: 600 }}>
												Create ENS Subdomain
											</Typography>
											<Typography variant="body2" color="text.secondary">
												Create a subdomain for this agent address using your parent ENS domain.
											</Typography>
											
											<Stack spacing={2}>
											<TextField
												label="Parent Domain"
												value={ensParentName}
												placeholder="mydomain.eth"
												size="small"
												fullWidth
												disabled
												helperText="Parent domain from environment configuration"
											/>
											<TextField
												label="Subdomain Name"
												value={ensSubdomainName}
												onChange={(e) => setEnsSubdomainName(e.target.value)}
												placeholder="finder"
												size="small"
												fullWidth
												helperText="Enter a single label (no dots). Example: 'finder' creates 'finder.orgtrust.eth'"
												error={ensSubdomainName.includes('.')}
											/>


											{ensSubdomainName.includes('.') && (
												<Typography variant="body2" color="error" sx={{ mt: 1 }}>
													❌ Invalid subdomain name: Cannot contain dots. Use a single label like "finder" instead of "finder.airbnb.org"
												</Typography>
											)}

											</Stack>
										</Stack>
									</Paper>
								</>
							)}
						</Stack>
					)}

					{/* Parent Domain */}
					{!ensLoading && !isCheckingWrapStatus && (
						<Box sx={{ mt: 3 }}>
							<Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
								Parent Domain
							</Typography>

							<Paper sx={{ p: 3, border: '1px solid', borderColor: 'success.main', borderRadius: 2 }}>

											<Box>
												<Typography variant="body2" color="text.secondary">
													Domain
												</Typography>
												<Typography 
													variant="body1" 
													sx={{ 
														fontFamily: 'ui-monospace, monospace',
														color: 'primary.main',
														cursor: 'pointer',
														'&:hover': {
															textDecoration: 'underline'
														}
													}}
													onClick={() => window.open(`https://sepolia.app.ens.domains/${ensParentName}`, '_blank')}
												>
													{ensParentName}
												</Typography>
											</Box>
											<Box>
												<Typography variant="body2" color="text.secondary">
													Owner
												</Typography>
												<Typography 
													variant="body1" 
													sx={{ 
														fontFamily: 'ui-monospace, monospace',
														color: 'primary.main',
														cursor: 'pointer',
														'&:hover': {
															textDecoration: 'underline'
														}
													}}
												onClick={() => window.open(`${getExplorerUrl(11155111)}/address/${orgOwner}`, '_blank')}
												>
													{orgOwner}
												</Typography>
											</Box>

							</Paper>

						</Box>
					)}

				</DialogContent>
				<DialogActions>
					<Button onClick={() => setEnsOpen(false)}>Close</Button>
				</DialogActions>
			</Dialog>

			{/* Add Agent Modal */}
			<AddAgentModal
				open={addAgentOpen}
				onClose={() => {
					if (externalAddAgentOpen !== undefined) {
						// External state is being used - call the close callback
						if (onAddAgentClose) onAddAgentClose();
					} else {
						// Internal state is being used - close it
						setInternalAddAgentOpen(false);
					}
					// Note: onAgentIndexed will handle the refresh with the filter
				}}
				onAgentIndexed={(agentName) => {
					// Set the name filter to the newly created agent and clear other filters
					if (agentName) {
						setDomain(agentName);
						setAddress("");
						setAgentId("");
						setMineOnly(false);
						setSelectedChainIdFilter(null);
						// Refresh the table with the new agent name filter applied
						fetchData(1, { name: agentName });
					} else {
						// Refresh the table after agent indexing
						fetchData(data.page);
					}
					if (externalOnAgentIndexed) externalOnAgentIndexed(agentName);
				}}
			/>

			{/* DID:Web Modal */}
			<DidWebModal
				open={didWebOpen}
				onClose={() => setDidWebOpen(false)}
				agent={{
					agentId: (currentAgentForDid as any)?.agentId ?? '',
					agentAddress: (currentAgentForDid as any)?.agentAddress ?? '',
					agentDomain: (currentAgentForDid as any)?.agentName ?? ''
				}}
				ensName={currentAgentEnsName}
			/>

			{/* DID:Agent Modal */}
			<DidAgentModal
				open={didAgentOpen}
				onClose={() => setDidAgentOpen(false)}
				agent={{
					agentId: (currentAgentForDid as any)?.agentId ?? '',
					agentAddress: (currentAgentForDid as any)?.agentAddress ?? '',
					agentName: (currentAgentForDid as any)?.agentName ?? '',
					agentENSDomain: currentAgentEnsName ?? '',
					agentDNSDomain: currentAgentEnsName ?? ''
				}}
				ensName={currentAgentEnsName}
			/>

			{/* Trust Graph Modal */}
			<TrustGraphModal
				open={trustGraphOpen}
				onClose={() => setTrustGraphOpen(false)}
				agentId={currentAgentForGraph?.agentId ?? ''}
				agentName={currentAgentForGraph?.agentName ?? ''}
			/>

			<Stack direction="row" alignItems="center" justifyContent="space-between">
				<Typography variant="body2" color="text.secondary">Total: {data?.total ?? 0}</Typography>
				<Stack direction="row" spacing={1}>
					<Button variant="outlined" size="small" disabled={(data?.page ?? 1) <= 1 || isLoading} onClick={() => fetchData(Math.max(1, (data?.page ?? 1) - 1))}>Prev</Button>
					<Button variant="outlined" size="small" disabled={isLoading || ((data?.page ?? 1) * (data?.pageSize ?? 20) >= (data?.total ?? 0))} onClick={() => fetchData((data?.page ?? 1) + 1)}>Next</Button>
				</Stack>
			</Stack>
		</Stack>
	);
}
