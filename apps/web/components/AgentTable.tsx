'use client';
import * as React from 'react';
import { Box, Paper, TextField, Button, Grid, Chip, Checkbox, Dialog, DialogTitle, DialogContent, DialogActions, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, Stack, FormControlLabel, IconButton, Divider, Tooltip } from '@mui/material';
import { useWeb3Auth } from '@/components/Web3AuthProvider';
import { createPublicClient, createWalletClient, http, custom, keccak256, stringToHex, toHex, zeroAddress, encodeAbiParameters, namehash, encodeFunctionData } from 'viem';
import { identityRegistryAbi as registryAbi } from '@/lib/abi/identityRegistry';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { toMetaMaskSmartAccount, Implementation, createDelegation, createCaveatBuilder } from '@metamask/delegation-toolkit';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { createBundlerClient } from 'viem/account-abstraction';
import { AddAgentModal } from './AddAgentModal';
import { DidWebModal } from './DidWebModal';
import { DidAgentModal } from './DidAgentModal';
import { buildAgentCard } from '@/lib/agentCard';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import WebIcon from '@mui/icons-material/Web';
import ensService from '@/service/ensService';

export type Agent = {
	agentId: string;
	agentAddress: string;
	owner?: string;
	agentDomain: string;
	metadataURI?: string | null;
	createdAtBlock: number;
	createdAtTime: number;
  name?: string | null;
  description?: string | null;
  a2aEndpoint?: string | null;
  ensEndpoint?: string | null;
};

export function AgentTable() {
	const [domain, setDomain] = React.useState("");
	const [address, setAddress] = React.useState("");
	const [agentId, setAgentId] = React.useState("");
	const [isLoading, setIsLoading] = React.useState(false);
	const [data, setData] = React.useState<{ rows: Agent[]; total: number; page: number; pageSize: number } | null>(null);
	const [mineOnly, setMineOnly] = React.useState(false);
	const [owned, setOwned] = React.useState<Record<string, boolean>>({});
	const { provider, address: eoa } = useWeb3Auth();

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

	// Fetch ENS names when data changes
	React.useEffect(() => {
		if (data?.rows) {
			data.rows.forEach(row => {
				if (!agentEnsNames[row.agentAddress]) {
					fetchEnsName(row.agentAddress);
				}
			});
		}
	}, [data]);


	// Check if parent ENS domain is already wrapped
	const checkParentWrapStatus = async () => {
		const parentEnsName = process.env.NEXT_PUBLIC_ENS_NAME;
		if (!parentEnsName) {
			console.log('❌ NEXT_PUBLIC_ENS_NAME not configured');
			setEnsError('Parent ENS name not configured');
			return;
		}

		console.log('🔍 Starting wrap status check...');
		console.log('📋 Configuration:', {
			parentEnsName,
			chainName: sepolia.name,
			chainId: sepolia.id,
			ENS_PRIVATE_KEY: process.env.NEXT_PUBLIC_ENS_PRIVATE_KEY ? `${process.env.NEXT_PUBLIC_ENS_PRIVATE_KEY.slice(0, 10)}...` : 'NOT_SET'
		});

		setIsCheckingWrapStatus(true);
		setEnsError(null);

		try {
			const cleanName = cleanEnsName(parentEnsName);
			console.log('🧹 Cleaned ENS name:', cleanName);
			
			// Create public client for reading contract data
			const publicClient = createPublicClient({
				chain: sepolia,
				transport: http(process.env.NEXT_PUBLIC_RPC_URL as string),
			});
			
			// Check if the parent domain is wrapped by checking if ENS Registry owner is NameWrapper
			const ENS_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_ENS_REGISTRY as `0x${string}`) || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
			const NAME_WRAPPER_ADDRESS = (process.env.NEXT_PUBLIC_ENS_IDENTITY_WRAPPER as `0x${string}`) || '0x0635513f179D50A207757E05759CbD106d7dFcE8';
			const parentNode = namehash(cleanName + '.eth');
			
			console.log('🔍 Checking ENS Registry for parent domain owner...');
			const parentOwner = await publicClient.readContract({
				address: ENS_REGISTRY_ADDRESS as `0x${string}`,
				abi: [{ name: 'owner', type: 'function', inputs: [{ name: 'node', type: 'bytes32' }], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' }],
				functionName: 'owner',
				args: [parentNode]
			}) as `0x${string}`;
			
			console.log(`🔗 Parent domain: ${cleanName}.eth`);
			console.log(`🔗 Parent node: ${parentNode}`);
			console.log(`👤 Parent owner - from ENS Registry which for wrapped points to NameWrapper: ${parentOwner}`);
			
			if (parentOwner === '0x0000000000000000000000000000000000000000') {
				console.log('❌ Parent domain does not exist or has no owner');
				setEnsError(`Parent domain "${cleanName}.eth" does not exist or has no owner`);
				setIsParentWrapped(false);
				return;
			}
			
			// For wrapped ENS records, we need to get the actual owner from NameWrapper
			let actualOwner: string;
			let isWrapped = false;
			
			if (parentOwner.toLowerCase() === NAME_WRAPPER_ADDRESS.toLowerCase()) {
				console.log('✅ Parent domain is wrapped, getting NameWrapper owner...');
				isWrapped = true;
				
				try {
					const tokenId = BigInt(parentNode);
					actualOwner = await publicClient.readContract({
						address: NAME_WRAPPER_ADDRESS as `0x${string}`,
						abi: [{ name: 'ownerOf', type: 'function', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' }],
						functionName: 'ownerOf',
						args: [tokenId]
					}) as `0x${string}`;
					
					console.log(`🎯 NameWrapper owner: ${actualOwner}`);
				} catch (error) {
					console.error('❌ Error getting NameWrapper owner:', error);
					setEnsError(`Failed to get NameWrapper owner: ${error instanceof Error ? error.message : String(error)}`);
					setIsParentWrapped(false);
					return;
				}
			} else {
				actualOwner = parentOwner;
				console.log(`🎯 Direct owner (not wrapped): ${actualOwner}`);
			}
			
			setIsParentWrapped(isWrapped);
			setParentEnsOwner(actualOwner);
			
			if (isWrapped) {
				console.log('✅ Parent domain is wrapped successfully');
				console.log('👑 Current wrapped domain owner:', actualOwner);
				
				// Calculate what the expected AA address should be
				const ensPrivateKey = process.env.NEXT_PUBLIC_ENS_PRIVATE_KEY as `0x${string}`;
				if (ensPrivateKey) {
					const ensOwnerEOA = privateKeyToAccount(ensPrivateKey);
					console.log('🔍 Expected AA owner details:', {
						eoaAddress: ensOwnerEOA.address,
						expectedAASalt: 200,
						expectedAASaltHex: `0x${(200).toString(16)}`,
						note: 'This AA should own the wrapped parent domain'
					});
				}
			} else {
				console.log('⚠️  Parent domain is NOT wrapped');
				setEnsError(`Parent domain "${cleanName}.eth" is not wrapped.`);
			}
		} catch (error) {
			console.error('❌ Error checking wrap status:', error);
			setEnsError(`Failed to check wrap status: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			setIsCheckingWrapStatus(false);
		}
	};

	const [cardOpen, setCardOpen] = React.useState(false);
	const [cardJson, setCardJson] = React.useState<string | null>(null);
	const [cardDomain, setCardDomain] = React.useState<string | null>(null);
	const [cardError, setCardError] = React.useState<string | null>(null);
	const [cardLoading, setCardLoading] = React.useState(false);
	const [cardFields, setCardFields] = React.useState<Record<string, any>>({});
	const saveTimeoutRef = React.useRef<number | undefined>(undefined);

	const [sessionOpen, setSessionOpen] = React.useState(false);
	const [sessionJson, setSessionJson] = React.useState<string | null>(null);
	const [sessionLoading, setSessionLoading] = React.useState(false);

	const [feedbackOpen, setFeedbackOpen] = React.useState(false);
	const [feedbackData, setFeedbackData] = React.useState<any[]>([]);
	const [feedbackLoading, setFeedbackLoading] = React.useState(false);
	const [feedbackError, setFeedbackError] = React.useState<string | null>(null);
	const [currentAgent, setCurrentAgent] = React.useState<Agent | null>(null);
	const [agentFeedbackURIs, setAgentFeedbackURIs] = React.useState<Record<string, string>>({});
	const [agentEnsNames, setAgentEnsNames] = React.useState<Record<string, string | null>>({});

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
	const [ensCreating, setEnsCreating] = React.useState(false);
	const [isParentWrapped, setIsParentWrapped] = React.useState<boolean | null>(null);
	const [isCheckingWrapStatus, setIsCheckingWrapStatus] = React.useState(false);
	const [parentEnsOwner, setParentEnsOwner] = React.useState<string | null>(null);
	
	const [addAgentOpen, setAddAgentOpen] = React.useState(false);
	const [didWebOpen, setDidWebOpen] = React.useState(false);
	const [didAgentOpen, setDidAgentOpen] = React.useState(false);
	const [currentAgentForDid, setCurrentAgentForDid] = React.useState<Agent | null>(null);
	const [currentAgentEnsName, setCurrentAgentEnsName] = React.useState<string | null>(null);

	function scheduleAutoSave() {
		if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
		saveTimeoutRef.current = window.setTimeout(() => { autoSave(); }, 600) as any;
	}

	function buildMerged(base: any) {
		const obj = base || {};
		const name = cardFields.name || obj.name;
		const description = cardFields.description || obj.description;
		const url = cardFields.url || obj.url;
		const version = cardFields.version || obj.version;
		const preferredTransport = cardFields.preferredTransport || obj.preferredTransport;
		const protocolVersion = cardFields.protocolVersion || obj.protocolVersion;
		const skills: any[] = Array.isArray(cardFields.skills) ? cardFields.skills.map((s: any) => ({
			id: s?.id || undefined,
			name: s?.name || undefined,
			description: s?.description || undefined,
			tags: Array.isArray(s?.tags) ? s.tags.filter(Boolean) : [],
			examples: Array.isArray(s?.examples) ? s.examples.filter(Boolean) : [],
			inputModes: Array.isArray(s?.inputModes) ? s.inputModes.filter(Boolean) : undefined,
			outputModes: Array.isArray(s?.outputModes) ? s.outputModes.filter(Boolean) : undefined,
		})) : (() => {
			// fallback to legacy single-skill fields
			const fallback = {
				id: cardFields.skillId || obj?.skills?.[0]?.id,
				name: cardFields.skillName || obj?.skills?.[0]?.name,
				description: cardFields.skillDesc || obj?.skills?.[0]?.description,
				tags: String(cardFields.skillTags || '').split(',').map((x: string) => x.trim()).filter(Boolean),
				examples: String(cardFields.skillExamples || '').split(/\n|,/).map((x: string) => x.trim()).filter(Boolean),
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
		if (cardFields.feedbackDataURI !== undefined) {
			ordered.feedbackDataURI = cardFields.feedbackDataURI;
		}
		return ordered;
	}

	async function autoSave() {
		if (!cardDomain) return;
		try {
			const base = cardJson ? JSON.parse(cardJson) : {};
			const merged = buildMerged(base);
			await fetch('/api/agent-cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain: cardDomain, card: merged }) });
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
			feedbackDataURI: obj?.feedbackDataURI ?? '',
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


		async function fetchData(page = 1, overrides?: { name?: string; address?: string; agentId?: string }) {
		setIsLoading(true);
			const url = new URL("/api/agents", window.location.origin);
			const nameFilter = overrides?.name ?? domain;
			const addressFilter = overrides?.address ?? address;
			const idFilter = overrides?.agentId ?? agentId;
			if (nameFilter) url.searchParams.set("name", nameFilter);
			if (addressFilter) url.searchParams.set("address", addressFilter);
			if (idFilter) url.searchParams.set("agentId", idFilter);
		url.searchParams.set("page", String(page));
		url.searchParams.set("pageSize", "20");
		try {
				const res = await fetch(url);
				if (!res.ok) {
					setData({ page, pageSize: 20, total: 0, rows: [] });
					return;
				}
				const text = await res.text();
				let json: any = null;
				if (text && text.trim().length > 0) {
					try { json = JSON.parse(text); } catch { json = null; }
				}
				setData(json ?? { page, pageSize: 20, total: 0, rows: [] });
		} finally {
			setIsLoading(false);
		}
	}

	React.useEffect(() => { fetchData(); }, []);

    React.useEffect(() => {
        async function computeOwnership() {
            if (!data?.rows || !provider || !eoa) { setOwned({}); return; }
            const rpcUrl = (process.env.NEXT_PUBLIC_RPC_URL as string) || 'https://rpc.ankr.com/eth_sepolia';
            const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
            const entries: Record<string, boolean> = {};
            for (const row of data.rows) {
                try {
                    const addr = row.agentAddress as `0x${string}`;
                    const code = await publicClient.getBytecode({ address: addr });
                    if (!code || code === '0x') {
                        // Agent is an EOA; ownership = EOA matches connected EOA
                        entries[row.agentId] = addr.toLowerCase() === (eoa as string).toLowerCase();
                        continue;
                    }
                    // Try common owner selectors on the AA
                    let controller: string | null = null;
                    try {
                        controller = await publicClient.readContract({
                            address: addr,
                            abi: [{ name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }],
                            functionName: 'owner'
                        }) as string;
                    } catch {}
                    if (!controller) {
                        try {
                            controller = await publicClient.readContract({
                                address: addr,
                                abi: [{ name: 'getOwner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }],
                                functionName: 'getOwner'
                            }) as string;
                        } catch {}
                    }
                    if (!controller) {
                        try {
                            const owners = await publicClient.readContract({
                                address: addr,
                                abi: [{ name: 'owners', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address[]' }] }],
                                functionName: 'owners'
                            }) as string[];
                            controller = Array.isArray(owners) && owners.length ? owners[0] : null;
                        } catch {}
                    }
                    entries[row.agentId] = !!controller && (controller as string).toLowerCase() === (eoa as string).toLowerCase();
                } catch {
                    entries[row.agentId] = false;
                }
            }
            setOwned(entries);

            // Check for feedback URIs for all agents
            const feedbackURIMap: Record<string, string> = {};
            for (const row of data.rows) {
                try {
                    const response = await fetch(`/api/agent-cards?domain=${encodeURIComponent(row.agentDomain)}`);
                    const cardData = await response.json();
                    if (cardData.found && cardData.card?.feedbackDataURI) {
                        feedbackURIMap[row.agentId] = cardData.card.feedbackDataURI;
                    }
                } catch {
                    // Ignore errors, just don't add feedback URI
                }
            }
            setAgentFeedbackURIs(feedbackURIMap);
        }
        computeOwnership();
    }, [data?.rows, provider, eoa]);

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		fetchData(1);
	}

		function clearFilters() {
		setDomain("");
		setAddress("");
		setAgentId("");
		setMineOnly(false);
			// Force-refresh immediately with cleared filters (state updates are async)
			fetchData(1, { name: "", address: "", agentId: "" });
	}


	function getStoredCard(domain: string): string | null {
		try { return localStorage.getItem(`agent_card:${domain.trim().toLowerCase()}`); } catch { return null; }
	}

	function setStoredCard(domain: string, value: string) {
		try { localStorage.setItem(`agent_card:${domain.trim().toLowerCase()}`, value); } catch {}
	}

	async function viewOrCreateCard(row: Agent) {
		const domain = row.agentDomain.trim().toLowerCase();
		if (!owned[row.agentId]) return; // only mine
		setCardDomain(domain);
		setCardError(null);
		let existing = getStoredCard(domain);
		if (!existing) {
			try {
				const res = await fetch(`/api/agent-cards?domain=${encodeURIComponent(domain)}`);
				const json = await res.json();
				if (json?.found && json?.card) existing = JSON.stringify(json.card);
			} catch {}
		}
		if (existing) {
			setCardJson(existing);
			try { await populateFieldsFromObj(JSON.parse(existing)); } catch {}
			setCardOpen(true);
			return;
		}
		await regenerateCard(row);
	}

	async function regenerateCard(row: Agent) {
		const domain = row.agentDomain.trim().toLowerCase();
		setCardLoading(true);
		setCardError(null);
		try {
			const registry = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS as `0x${string}`;
			if (!provider || !eoa) throw new Error('Not connected');
			const walletClient = createWalletClient({ chain: sepolia as any, transport: custom(provider as any), account: eoa as `0x${string}` });
			const cardObj = await buildAgentCard({
				registry,
				domain,
				chainId: 11155111,
				trustModels: (process.env.NEXT_PUBLIC_ERC8004_TRUST_MODELS || 'feedback').split(',').map((x) => x.trim()).filter(Boolean),
				signMessage: async (message: string) => {
					return await walletClient.signMessage({ account: eoa as `0x${string}`, message }) as any;
				},
			});
			const json = JSON.stringify(cardObj, null, 2);
			setStoredCard(domain, json);
			setCardJson(json);
			await populateFieldsFromObj(cardObj);
			// Persist immediately on first creation
			try {
				await fetch('/api/agent-cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain, card: cardObj }) });
			} catch (e: any) {
				setCardError(e?.message ?? 'Save failed');
			}
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
			// Use the pre-fetched feedback URI
			const feedbackURI = agentFeedbackURIs[row.agentId];
			if (!feedbackURI) {
				setFeedbackError('No feedback data URI found for this agent');
				setFeedbackLoading(false);
				return;
			}

			// Fetch feedback data from the URI
			const feedbackResponse = await fetch(feedbackURI);
			if (!feedbackResponse.ok) {
				throw new Error(`Failed to fetch feedback data: ${feedbackResponse.statusText}`);
			}
			
			const feedback = await feedbackResponse.json();
			
			// Handle different response formats
			let feedbackList = [];
			if (Array.isArray(feedback)) {
				feedbackList = feedback;
			} else if (feedback.data && Array.isArray(feedback.data)) {
				feedbackList = feedback.data;
			} else if (feedback.feedback && Array.isArray(feedback.feedback)) {
				feedbackList = feedback.feedback;
			} else {
				feedbackList = [feedback]; // Single feedback item
			}
			
			setFeedbackData(feedbackList);
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
		const parentEnsName = process.env.NEXT_PUBLIC_ENS_NAME;
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

	async function createEnsSubdomain() {
		if (!ensCurrentAgent || !ensSubdomainName.trim() || !ensParentName.trim()) {
			setEnsError('Please provide both subdomain name and parent domain name');
			return;
		}

		if (!isParentWrapped) {
			setEnsError('Parent domain is not wrapped. Please wrap the parent domain first.');
			return;
		}

		setEnsCreating(true);
		setEnsError(null);

		try {
			console.log('🚀 Creating ENS subdomain using ENS owner AA with paymaster...');
			console.log('Agent Address:', ensCurrentAgent.agentAddress);
			console.log('Subdomain:', ensSubdomainName);
			console.log('Parent:', ensParentName);

			// Get ENS private key from environment
			const ensPrivateKey = process.env.NEXT_PUBLIC_ENS_PRIVATE_KEY as `0x${string}`;
			if (!ensPrivateKey) {
				throw new Error('NEXT_PUBLIC_ENS_PRIVATE_KEY not configured');
			}

			// Create ENS owner EOA from private key
			const ensOwnerEOA = privateKeyToAccount(ensPrivateKey);
			console.log('🔍 ENS Owner EOA:', ensOwnerEOA.address);

			// Create public client
			const publicClient = createPublicClient({
				chain: sepolia,
				transport: http(process.env.NEXT_PUBLIC_RPC_URL as string),
			});

			// Create ENS owner account abstraction


			const ensOwnerAA = await toMetaMaskSmartAccount({
				client: publicClient,
				implementation: Implementation.Hybrid,
				deployParams: [ensOwnerEOA.address, [], [], []],
				signatory: { account: ensOwnerEOA },
				deploySalt: `0x${(10000).toString(16)}` as `0x${string}`, // Organization salt like in test
			  });

			console.log('🔧 ENS Owner AA Address:', await ensOwnerAA.getAddress());

			// Clean the parent name first
			const cleanParentName = ensParentName.replace(/\.eth$/i, '').toLowerCase();
			const subdomainName = ensSubdomainName.trim().toLowerCase();

			// Check if ENS owner AA is the actual owner of the parent domain
			const ensOwnerAAAddress = await ensOwnerAA.getAddress();
			console.log('🔍 Checking if ENS owner AA is the actual owner of parent domain...');
			console.log('ENS Owner AA Address:', ensOwnerAAAddress);
			console.log('Parent ENS Owner from check:', parentEnsOwner);
			
			if (parentEnsOwner && parentEnsOwner.toLowerCase() !== ensOwnerAAAddress.toLowerCase()) {
				console.log('⚠️  ENS Owner AA is not the actual owner of the parent domain');
				console.log('Attempting to transfer parent domain to ENS owner AA...');
				
				try {
					// Create an ethers provider and wallet for the current owner
					const { ethers } = await import('ethers');
					const ethersProvider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL);
					const ensOwnerWallet = new ethers.Wallet(ensPrivateKey, ethersProvider);
					
					// We need to use the current owner's private key to transfer ownership
					// For now, let's check if the current owner is the EOA from the private key
					if (parentEnsOwner.toLowerCase() === ensOwnerEOA.address.toLowerCase()) {
						console.log('✅ Current owner is the EOA, transferring to ENS owner AA...');
						
						// Create NameWrapper contract instance
						const nameWrapper = new ethers.Contract(
							(process.env.NEXT_PUBLIC_ENS_IDENTITY_WRAPPER as `0x${string}`) || '0x0635513f179D50A207757E05759CbD106d7dFcE8',
							[
								{
									"inputs": [
										{"name": "tokenId", "type": "uint256"},
										{"name": "to", "type": "address"},
										{"name": "data", "type": "bytes"}
									],
									"name": "safeTransferFrom",
									"outputs": [],
									"stateMutability": "nonpayable",
									"type": "function"
								}
							],
							ensOwnerWallet
						);
						
						const parentNode = namehash(cleanParentName + '.eth');
						const tokenId = BigInt(parentNode);
						
						// Transfer ownership to ENS owner AA
						const transferTx = await nameWrapper.safeTransferFrom(
							ensOwnerEOA.address,
							ensOwnerAAAddress,
							tokenId,
							'0x'
						);
						
						console.log('⏳ Waiting for transfer transaction...');
						await transferTx.wait();
						console.log('✅ Parent domain transferred to ENS owner AA');
					} else {
						throw new Error(`Cannot transfer parent domain: Current owner (${parentEnsOwner}) is not the EOA (${ensOwnerEOA.address})`);
					}
				} catch (error: any) {
					console.error('❌ Error transferring parent domain:', error);
					setEnsError(`Failed to transfer parent domain to ENS owner AA: ${error.message}`);
					return;
				}
			}

			// Deploy ENS owner AA if needed
			const ensOwnerCode = await publicClient.getCode({ address: ensOwnerAAAddress as `0x${string}` });
			
			if (ensOwnerCode === '0x') {
				console.log('📦 Deploying ENS owner AA...');
				
				// Create bundler client for deployment
				const BUNDLER_URL = process.env.NEXT_PUBLIC_BUNDLER_URL as string;
				const bundlerClient = createBundlerClient({
					transport: http(BUNDLER_URL),
					paymaster: true,
					chain: sepolia,
					paymasterContext: {
						mode: 'SPONSORED',
					},
				});

				// Deploy ENS owner AA
				const userOperationHash = await bundlerClient.sendUserOperation({
					account: ensOwnerAA,
					calls: [{ to: zeroAddress }],
				});

				console.log('⏳ Waiting for ENS owner AA deployment...');
				const { receipt } = await bundlerClient.waitForUserOperationReceipt({
					hash: userOperationHash,
				});

				console.log('✅ ENS owner AA deployed successfully:', receipt);
			} else {
				console.log('✅ ENS owner AA already deployed');
			}

			// Create an ethers provider and signer for the ENS owner EOA (using private key directly)
			const { ethers } = await import('ethers');
			const ethersProvider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL);
			const ensOwnerWallet = new ethers.Wallet(ensPrivateKey, ethersProvider);
			const ensOwnerSigner = ensOwnerWallet.connect(ethersProvider);

			const walletClient = createWalletClient({ chain: sepolia as any, transport: custom(provider as any), account: eoa as `0x${string}` });

			console.info("*********** agent domain name: ", ensCurrentAgent.agentDomain);
			const deploySalt = BigInt(keccak256(stringToHex(ensCurrentAgent.agentDomain.trim().toLowerCase())));
			const agentAA = await toMetaMaskSmartAccount({
				client: publicClient,
				implementation: Implementation.Hybrid,
				deployParams: [eoa as `0x${string}`, [], [], []],
				signatory: { walletClient },
				deploySalt: toHex(deploySalt) as `0x${string}`,
			} as any);
			console.log('🔧 **************8888 Agent AA Address:', await agentAA.getAddress());

			// Create subdomain using ENS owner AA with paymaster
			// The agent address will be the owner of the subdomain
			const result = await ensService.createSubdomainForOrg(
				ensOwnerSigner as any, // Cast to any to bypass type issues
				ensOwnerAA,
				agentAA,
				ensCurrentAgent.agentAddress as `0x${string}`, // Agent address as subdomain owner
				cleanParentName, 
				subdomainName, 
				sepolia
			);

			await ensService.forwardFromEnsName(result, sepolia, ensOwnerAA, agentAA, subdomainName);
			await ensService.reverseFromEnsAddress(result, sepolia, ensOwnerAA, agentAA, subdomainName);

			console.log('✅ ENS subdomain created successfully:', result);
			
			// Refresh ENS data to show the new subdomain
			await openEnsFor(ensCurrentAgent);
			
		} catch (error: any) {
			console.error('❌ Error creating ENS subdomain:', error);
			setEnsError(error?.message ?? 'Failed to create ENS subdomain');
		} finally {
			setEnsCreating(false);
		}
	}

	async function openSessionFor(row: Agent) {
		console.log('Starting session creation for:', row.agentDomain);
		setSessionLoading(true);
		try {
			if (!provider || !eoa) throw new Error('Not connected');
			const rpcUrl = (process.env.NEXT_PUBLIC_RPC_URL as string) || 'https://rpc.ankr.com/eth_sepolia';
			const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
			const walletClient = createWalletClient({ chain: sepolia as any, transport: custom(provider as any), account: eoa as `0x${string}` });

			// Build AA address derived from domain same as ownership check
			console.info("*********** agent domain name: ", row.agentDomain);
			console.info("********* eoa: ", eoa)
			const deploySalt = BigInt(keccak256(stringToHex(row.agentDomain.trim().toLowerCase())));
			const smartAccount = await toMetaMaskSmartAccount({
				client: publicClient,
				implementation: Implementation.Hybrid,
				deployParams: [eoa as `0x${string}`, [], [], []],
				signatory: { walletClient },
				deploySalt: toHex(deploySalt) as `0x${string}`,
			} as any);
			const aa = await smartAccount.getAddress() as `0x${string}`;

			console.info("*********** ai agent address: ", aa);
			const entryPoint = (await (smartAccount as any).getEntryPointAddress?.()) as `0x${string}` || '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
			const chainId = 11155111; // sepolia

			// Ensure main AA is deployed via bundler (sponsored)
			const aaCode = await publicClient.getBytecode({ address: aa });
			const aaDeployed = !!aaCode && aaCode !== '0x';
			if (!aaDeployed) {
				const bundlerUrl = (process.env.NEXT_PUBLIC_BUNDLER_URL as string) || '';
				const paymasterUrl = (process.env.NEXT_PUBLIC_PAYMASTER_URL as string) || undefined;
				console.info("create bundler client ", bundlerUrl, paymasterUrl);
				const pimlicoClient = createPimlicoClient({ transport: http(bundlerUrl) });
				const bundlerClient = createBundlerClient({
					transport: http(bundlerUrl),
					paymaster: true as any,
					chain: sepolia as any,
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

			const bundlerUrl = (process.env.NEXT_PUBLIC_BUNDLER_URL as string) || '';
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
					chain: sepolia as any,
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

	return (
		<Stack spacing={3}>
			<Paper variant="outlined" sx={{ p: 2.5 }}>
				<Stack spacing={2}>
					{/* Header Row with EOA and Actions */}
					<Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
						<Stack direction="row" alignItems="center" spacing={2}>
							{eoa && (
								<Chip
									label={`EOA: ${eoa}`}
									size="small"
									variant="outlined"
									sx={{ 
										fontSize: '0.7rem',
										cursor: 'pointer',
										'&:hover': {
											backgroundColor: 'action.hover'
										}
									}}
									onClick={() => window.open(`https://sepolia.etherscan.io/address/${eoa}`, '_blank')}
								/>
							)}
							<Stack direction="row" spacing={1}>
								<Chip
									label={`Identity: ${(process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || 'Not configured').slice(0, 10)}...`}
									size="small"
									variant="outlined"
									sx={{ 
										fontSize: '0.7rem',
										cursor: 'pointer',
										'&:hover': {
											backgroundColor: 'action.hover'
										}
									}}
									onClick={() => {
										const address = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS;
										if (address) {
											window.open(`https://sepolia.etherscan.io/address/${address}`, '_blank');
										}
									}}
								/>
								<Chip
									label={`Reputation: ${(process.env.NEXT_PUBLIC_REPUTATION_REGISTRY || 'Not configured').slice(0, 10)}...`}
									size="small"
									variant="outlined"
									sx={{ 
										fontSize: '0.7rem',
										cursor: 'pointer',
										'&:hover': {
											backgroundColor: 'action.hover'
										}
									}}
									onClick={() => {
										const address = process.env.NEXT_PUBLIC_REPUTATION_REGISTRY;
										if (address) {
											window.open(`https://sepolia.etherscan.io/address/${address}`, '_blank');
										}
									}}
								/>
							</Stack>
						</Stack>
						{eoa && (
							<Button
								variant="contained"
								startIcon={<AddIcon />}
								onClick={() => setAddAgentOpen(true)}
								size="small"
							>
								Create Agent Identity
							</Button>
						)}
					</Stack>

					{/* Search Form */}
				<Box component="form" onSubmit={handleSubmit}>
						<Grid container spacing={2}>
							<Grid item xs={12} md={3}>
								<TextField fullWidth label="address" placeholder="0x…" value={address} onChange={(e) => setAddress(e.target.value)} size="small" />
							</Grid>
						<Grid item xs={12} md={3}>
							<TextField fullWidth label="name" placeholder="Filter by name (ENS or metadata)" value={domain} onChange={(e) => setDomain(e.target.value)} size="small" />
						</Grid>
						<Grid item xs={12} md={3}>
							<TextField fullWidth label="id" placeholder="Filter by id" value={agentId} onChange={(e) => setAgentId(e.target.value)} size="small" />
						</Grid>
						<Grid item xs={12} md={1}>
							<FormControlLabel control={<Checkbox checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} size="small" />} label="Mine" />
						</Grid>
						<Grid item xs={12} md={2}>
							<Stack direction="row" spacing={1} sx={{ height: '100%' }}>
								<Button type="submit" variant="contained" disableElevation sx={{ flex: 1 }} disabled={isLoading}>{isLoading ? 'Searching…' : 'Search'}</Button>
								<Button type="button" variant="outlined" sx={{ flex: 1 }} disabled={isLoading} onClick={clearFilters}>Clear</Button>
							</Stack>
						</Grid>
					</Grid>
				</Box>
				</Stack>
			</Paper>

			<TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
				<Table size="small" sx={{ minWidth: 600 }}>
                    <TableHead>
								<TableRow>
								<TableCell>Account Address</TableCell>
								<TableCell>ENS Name</TableCell>
								<TableCell>Identity ID</TableCell>
								<TableCell>A2A</TableCell>
								<TableCell>Mine</TableCell>
								{eoa && <TableCell></TableCell>}
							</TableRow>
						</TableHead>
					<TableBody>
						{!isLoading && (data?.rows?.filter((row) => {
							const agentIdNum = parseInt(row.agentId);
							return (!mineOnly || owned[row.agentId]);
						}).length ?? 0) === 0 && (
							<TableRow>
								<TableCell colSpan={eoa ? 6 : 5} align="center">
									<Typography variant="body2" color="text.secondary">No agents found.</Typography>
								</TableCell>
							</TableRow>
						)}
						{isLoading && (
							<TableRow>
								<TableCell colSpan={eoa ? 6 : 5} align="center">
									<Typography variant="body2" color="text.secondary">Loading…</Typography>
								</TableCell>
							</TableRow>
						)}
						{data?.rows?.filter((row) => (!mineOnly || owned[row.agentId]))?.map((row) => (
									<TableRow key={row.agentId} hover>
										<TableCell>
											<Stack direction="row" spacing={0.25} alignItems="center">
												<Typography 
													component="span" 
													variant="body2" 
													sx={{ 
														fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
														cursor: 'pointer',
														color: 'primary.main',
														textDecoration: 'underline',
														'&:hover': {
															color: 'primary.dark',
															textDecoration: 'none'
														}
													}} 
													noWrap 
													title={`Click to view on Etherscan: ${row.agentAddress}`}
													onClick={() => window.open(`https://sepolia.etherscan.io/address/${row.agentAddress}`, '_blank')}
												>
													{`${row.agentAddress.slice(0, 6)}...${row.agentAddress.slice(-4)}`}
												</Typography>
											</Stack>
										</TableCell>
						<TableCell>
							{(row.ensEndpoint || agentEnsNames[row.agentAddress]) ? (
								<Typography
									component="a"
									href={`https://sepolia.app.ens.domains/${(row.ensEndpoint || agentEnsNames[row.agentAddress]) as string}`}
									target="_blank"
									rel="noopener noreferrer"
									variant="body2"
									noWrap
									sx={{ fontFamily: 'ui-monospace, monospace', color: 'primary.main', textDecoration: 'underline', cursor: 'pointer', '&:hover': { color: 'primary.dark', textDecoration: 'none' } }}
									title={row.ensEndpoint || agentEnsNames[row.agentAddress] || ''}
								>
									{row.ensEndpoint || agentEnsNames[row.agentAddress]}
								</Typography>
							) : (
								<Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'ui-monospace, monospace' }}>—</Typography>
							)}
						</TableCell>

									<TableCell>
										<Stack direction="row" spacing={1} alignItems="center">
											{process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ? (
												<Typography
													component="a"
													href={`https://sepolia.etherscan.io/nft/${process.env.NEXT_PUBLIC_REGISTRY_ADDRESS}/${row.agentId}`}
													target="_blank"
													rel="noopener noreferrer"
													variant="body2"
													sx={{ fontFamily: 'ui-monospace, monospace', color: 'primary.main', textDecoration: 'underline', cursor: 'pointer', '&:hover': { color: 'primary.dark', textDecoration: 'none' } }}
													title={`View NFT #${row.agentId} on Etherscan`}
												>
													{row.agentId}
												</Typography>
											) : (
												<Chip label={row.agentId} size="small" sx={{ fontFamily: 'ui-monospace, monospace' }} />
											)}
											{owned[row.agentId] && (
												<Tooltip title="Burn Identity (send to 0x000…dEaD)">
													<IconButton
														size="small"
														color="error"
														onClick={async () => {
															try {
																const registry = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS as `0x${string}`;
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
												</Tooltip>
											)}
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
												</>
											)}
											{agentFeedbackURIs[row.agentId] && (
												<Button size="small" onClick={() => openFeedbackFor(row)} sx={{ minWidth: 'auto', px: 0.5, py: 0.25, fontSize: '0.65rem', lineHeight: 1, height: 'auto' }}>
													Feedback
												</Button>
											)}
										</Stack>
									</TableCell>

							<TableCell>
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

								<TableCell>
									{owned[row.agentId] ? <Chip label="Mine" color="primary" size="small" /> : null}
								</TableCell>
								{eoa && (
									<TableCell>
										<IconButton
											size="small"
											sx={{ 
												p: 0.5,
												color: 'primary.main',
												'&:hover': {
													color: 'primary.dark',
													backgroundColor: 'action.hover'
												}
											}}
											title={`Give feedback to ${row.agentDomain.replace(/\/$/, '')}`}
											onClick={() => {
												const cleanDomain = row.agentDomain.replace(/\/$/, '');
												const url = cleanDomain.startsWith('http') ? cleanDomain : `http://${cleanDomain}`;
												window.open(url, '_blank');
											}}
										>
											<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
												<path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M11,16.5L18,9.5L16.5,8L11,13.5L7.5,10L6,11.5L11,16.5Z" />
											</svg>
										</IconButton>
									</TableCell>
								)}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</TableContainer>

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
								<Typography variant="subtitle2">Feedback</Typography>
								<TextField label="Feedback Data URI" size="small" value={cardFields.feedbackDataURI ?? ''} onChange={(e) => handleFieldChange('feedbackDataURI', e.target.value)} />
								
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
											const shortJson = JSON.stringify(merged, null, 2);
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
					Feedback for {currentAgent?.agentDomain}
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
						</Stack>
					)}
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setFeedbackOpen(false)}>Close</Button>
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
													onClick={() => window.open(`https://sepolia.etherscan.io/address/${ensCurrentAgent?.agentAddress}`, '_blank')}
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
											<Button
												variant="contained"
												onClick={createEnsSubdomain}
												disabled={
													ensCreating || 
													!ensSubdomainName.trim() || 
													!ensParentName.trim() || 
													!isParentWrapped ||
													ensSubdomainName.includes('.')
												}
												sx={{ alignSelf: 'flex-start' }}
											>
												{ensCreating ? 'Creating...' : 'Create Subdomain'}
											</Button>
											{!isParentWrapped && (
												<Typography variant="body2" color="error" sx={{ mt: 1 }}>
													⚠️ Cannot create subdomain: Parent domain is not wrapped
												</Typography>
											)}
											{ensSubdomainName.includes('.') && (
												<Typography variant="body2" color="error" sx={{ mt: 1 }}>
													❌ Invalid subdomain name: Cannot contain dots. Use a single label like "finder" instead of "finder.airbnb.org"
												</Typography>
											)}
											{isParentWrapped && !ensSubdomainName.includes('.') && (
												<Typography variant="body2" color="success.dark" sx={{ mt: 1 }}>
													✅ Parent domain is wrapped. The ENS owner's account abstraction will create the subdomain for the agent.
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
							{isParentWrapped === true && (
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
														onClick={() => window.open(`https://sepolia.etherscan.io/address/${parentEnsOwner}`, '_blank')}
													>
														{parentEnsOwner}
													</Typography>
												</Box>
	
								</Paper>
							)}
							{isParentWrapped === false && (
								<Paper sx={{ p: 3, border: '1px solid', borderColor: 'warning.main', borderRadius: 2 }}>
									<Stack spacing={2}>
										<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
											<Box sx={{ 
												width: 8, 
												height: 8, 
												borderRadius: '50%', 
												bgcolor: 'warning.main' 
											}} />
											<Typography variant="h6" color="warning.dark" sx={{ fontWeight: 600 }}>
												Parent Domain Not Wrapped
											</Typography>
										</Box>
										<Box sx={{ 
											p: 2, 
											bgcolor: 'warning.light', 
											borderRadius: 1,
											border: '1px solid',
											borderColor: 'warning.main'
										}}>
											<Stack spacing={1}>
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
												<Typography variant="body2" color="warning.dark">
													Please wrap the parent domain before creating subdomains.
												</Typography>
											</Stack>
										</Box>
									</Stack>
								</Paper>
							)}
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
				onClose={() => setAddAgentOpen(false)}
				registryAddress={process.env.NEXT_PUBLIC_REGISTRY_ADDRESS as `0x${string}`}
				rpcUrl={process.env.NEXT_PUBLIC_RPC_URL as string}
			/>

			{/* DID:Web Modal */}
			<DidWebModal
				open={didWebOpen}
				onClose={() => setDidWebOpen(false)}
				agent={currentAgentForDid || { agentId: '', agentAddress: '', agentDomain: '' }}
				ensName={currentAgentEnsName}
			/>

			{/* DID:Agent Modal */}
			<DidAgentModal
				open={didAgentOpen}
				onClose={() => setDidAgentOpen(false)}
				agent={currentAgentForDid || { agentId: '', agentAddress: '', agentDomain: '' }}
				ensName={currentAgentEnsName}
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
