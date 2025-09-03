'use client';
import * as React from 'react';
import { Box, Paper, TextField, Button, Grid, Chip, Checkbox, Dialog, DialogTitle, DialogContent, DialogActions, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, Stack, FormControlLabel, IconButton } from '@mui/material';
import { useWeb3Auth } from '@/components/Web3AuthProvider';
import { createPublicClient, createWalletClient, http, custom, keccak256, stringToHex } from 'viem';
import { sepolia } from 'viem/chains';
import { toMetaMaskSmartAccount, Implementation } from '@metamask/delegation-toolkit';
import { buildAgentCard } from '@/lib/agentCard';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

export type Agent = {
	agentId: string;
	agentAddress: string;
	owner?: string;
	agentDomain: string;
	metadataURI?: string | null;
	createdAtBlock: number;
	createdAtTime: number;
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

	const [cardOpen, setCardOpen] = React.useState(false);
	const [cardJson, setCardJson] = React.useState<string | null>(null);
	const [cardDomain, setCardDomain] = React.useState<string | null>(null);
	const [cardError, setCardError] = React.useState<string | null>(null);
	const [cardLoading, setCardLoading] = React.useState(false);
	const [cardFields, setCardFields] = React.useState<Record<string, any>>({});
	const saveTimeoutRef = React.useRef<number | undefined>(undefined);

	function scheduleAutoSave() {
		if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
		saveTimeoutRef.current = window.setTimeout(() => { autoSave(); }, 600) as any;
	}

	function buildMerged(base: any) {
		const obj = base || {};
		const merged = {
			...obj,
			name: cardFields.name || obj.name,
			description: cardFields.description || obj.description,
			homepage: cardFields.homepage || obj.homepage,
			url: cardFields.url || obj.url,
			version: cardFields.version || obj.version,
			preferredTransport: cardFields.preferredTransport || obj.preferredTransport,
			protocolVersion: cardFields.protocolVersion || obj.protocolVersion,
			trustModels: Array.isArray(cardFields.trustModels)
				? cardFields.trustModels
				: String(cardFields.trustModels || '')
					.split(',')
					.map((x: string) => x.trim())
					.filter(Boolean),
			capabilities: { pushNotifications: !!cardFields.capPush, streaming: !!cardFields.capStream },
			defaultInputModes: String(cardFields.defaultInputModes || '')
				.split(',')
				.map((x: string) => x.trim())
				.filter(Boolean),
			defaultOutputModes: String(cardFields.defaultOutputModes || '')
				.split(',')
				.map((x: string) => x.trim())
				.filter(Boolean),
			skills: [
				{
					id: cardFields.skillId || undefined,
					name: cardFields.skillName || undefined,
					description: cardFields.skillDesc || undefined,
					tags: String(cardFields.skillTags || '')
						.split(',')
						.map((x: string) => x.trim())
						.filter(Boolean),
					examples: String(cardFields.skillExamples || '')
						.split(/\n|,/)
						.map((x: string) => x.trim())
						.filter(Boolean),
				},
			],
		};
		if (obj?.registrations?.[0]?.signature) {
			merged.registrations[0].signature = shortenSignature(obj.registrations[0].signature);
		}
		return merged;
	}

	async function autoSave() {
		if (!cardDomain) return;
		try {
			const base = cardJson ? JSON.parse(cardJson) : {};
			const merged = {
				...base,
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
				skills: [{ id: cardFields.skillId || undefined, name: cardFields.skillName || undefined, description: cardFields.skillDesc || undefined, tags: String(cardFields.skillTags || '').split(',').map((x: string) => x.trim()).filter(Boolean), examples: String(cardFields.skillExamples || '').split(/\n|,/).map((x: string) => x.trim()).filter(Boolean) }],
			};
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

	function populateFieldsFromObj(obj: any) {
		const skills = Array.isArray(obj?.skills) ? obj.skills : [];
		const firstSkill = skills[0] || {};
		setCardFields({
			name: obj?.name ?? '',
			description: obj?.description ?? '',
			homepage: obj?.homepage ?? '',
			url: obj?.url ?? '',
			version: obj?.version ?? '',
			preferredTransport: obj?.preferredTransport ?? '',
			protocolVersion: obj?.protocolVersion ?? '',
			trustModels: Array.isArray(obj?.trustModels) ? obj.trustModels : [],
			capPush: !!obj?.capabilities?.pushNotifications,
			capStream: !!obj?.capabilities?.streaming,
			defaultInputModes: Array.isArray(obj?.defaultInputModes) ? obj.defaultInputModes.join(', ') : (obj?.defaultInputModes ?? ''),
			defaultOutputModes: Array.isArray(obj?.defaultOutputModes) ? obj.defaultOutputModes.join(', ') : (obj?.defaultOutputModes ?? ''),
			skillId: firstSkill?.id ?? '',
			skillName: firstSkill?.name ?? '',
			skillDesc: firstSkill?.description ?? '',
			skillTags: Array.isArray(firstSkill?.tags) ? firstSkill.tags.join(', ') : (firstSkill?.tags ?? ''),
			skillExamples: Array.isArray(firstSkill?.examples) ? firstSkill.examples.join('\n') : (firstSkill?.examples ?? ''),
		});
	}

	function shortenSignature(hex?: string | null): string | null {
		if (!hex || typeof hex !== 'string') return hex ?? null;
		if (!hex.startsWith('0x') || hex.length <= 2 + 20) return hex;
		const body = hex.slice(2);
		const left = body.slice(0, 10);
		const right = body.slice(-10);
		return `0x${left}…${right}`;
	}

	async function fetchData(page = 1) {
		setIsLoading(true);
		const url = new URL("/api/agents", window.location.origin);
		if (domain) url.searchParams.set("domain", domain);
		if (address) url.searchParams.set("address", address);
		if (agentId) url.searchParams.set("agentId", agentId);
		url.searchParams.set("page", String(page));
		url.searchParams.set("pageSize", "20");
		try {
			const res = await fetch(url);
			setData(await res.json());
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
			const walletClient = createWalletClient({ chain: sepolia as any, transport: custom(provider as any), account: eoa as `0x${string}` });
			const entries: Record<string, boolean> = {};
			for (const row of data.rows) {
				try {
					const salt = keccak256(stringToHex(row.agentDomain.trim().toLowerCase()));
					const smartAccount = await toMetaMaskSmartAccount({
						client: publicClient,
						implementation: Implementation.Hybrid,
						deployParams: [eoa as `0x${string}`, [], [], []],
						signatory: { walletClient },
						deploySalt: salt as `0x${string}`,
					} as any);
					const derived = (await smartAccount.getAddress()).toLowerCase();
					entries[row.agentId] = derived === row.agentAddress.toLowerCase();
				} catch {
					entries[row.agentId] = false;
				}
			}
			setOwned(entries);
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
		fetchData(1);
	}

	async function copy(text: string) {
		try { await navigator.clipboard.writeText(text); } catch {}
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
			try { populateFieldsFromObj(JSON.parse(existing)); } catch {}
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
			populateFieldsFromObj(cardObj);
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

	async function saveCard() {
		if (!cardDomain) return;
		try {
			const base = cardJson ? JSON.parse(cardJson) : {};
			const merged = {
				...base,
				name: cardFields.name || undefined,
				description: cardFields.description || undefined,
				homepage: cardFields.homepage || undefined,
				trustModels: Array.isArray(cardFields.trustModels)
					? cardFields.trustModels
					: String(cardFields.trustModels || '')
						.split(',')
						.map((x: string) => x.trim())
						.filter(Boolean),
			};
			await fetch('/api/agent-cards', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ domain: cardDomain, card: merged }),
			});
			const json = JSON.stringify(merged, null, 2);
			setStoredCard(cardDomain, json);
			setCardJson(json);
		} catch (e: any) {
			setCardError(e?.message ?? 'Save failed');
		}
	}

	return (
		<Stack spacing={3}>
			<Paper variant="outlined" sx={{ p: 2.5 }}>
				<Box component="form" onSubmit={handleSubmit}>
					<Grid container spacing={2}>
						<Grid item xs={12} md={3}>
							<TextField fullWidth label="Domain" placeholder="Filter by domain" value={domain} onChange={(e) => setDomain(e.target.value)} size="small" />
						</Grid>
						<Grid item xs={12} md={3}>
							<TextField fullWidth label="Agent address" placeholder="0x…" value={address} onChange={(e) => setAddress(e.target.value)} size="small" />
						</Grid>
						<Grid item xs={12} md={3}>
							<TextField fullWidth label="AgentId" placeholder="Filter by id" value={agentId} onChange={(e) => setAgentId(e.target.value)} size="small" />
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
			</Paper>

			<TableContainer component={Paper} variant="outlined">
				<Table size="small">
					<TableHead>
						<TableRow>
							<TableCell>Domain</TableCell>
							<TableCell>Agent Address</TableCell>
							<TableCell>AgentId (uint256)</TableCell>
							<TableCell>Mine</TableCell>
						</TableRow>
					</TableHead>
					<TableBody>
						{!isLoading && (data?.rows?.filter((row) => !mineOnly || owned[row.agentId]).length ?? 0) === 0 && (
							<TableRow>
								<TableCell colSpan={4} align="center">
									<Typography variant="body2" color="text.secondary">No agents found.</Typography>
								</TableCell>
							</TableRow>
						)}
						{isLoading && (
							<TableRow>
								<TableCell colSpan={4} align="center">
									<Typography variant="body2" color="text.secondary">Loading…</Typography>
								</TableCell>
							</TableRow>
						)}
						{data?.rows?.filter((row) => !mineOnly || owned[row.agentId])?.map((row) => (
							<TableRow key={row.agentId} hover>
								<TableCell sx={{ fontWeight: 600 }}>{row.agentDomain}</TableCell>
								<TableCell>
									<Stack direction="row" spacing={1} alignItems="center">
										<Typography component="span" variant="body2" sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }} noWrap title={row.agentAddress}>{row.agentAddress}</Typography>
										<Button size="small" onClick={() => copy(row.agentAddress)}>Copy</Button>
										{owned[row.agentId] && (
											<Button size="small" onClick={() => viewOrCreateCard(row)}>Card</Button>
										)}
									</Stack>
								</TableCell>
								<TableCell>
									<Chip label={row.agentId} size="small" sx={{ fontFamily: 'ui-monospace, monospace' }} />
								</TableCell>
								<TableCell>
									{owned[row.agentId] ? <Chip label="Mine" color="primary" size="small" /> : null}
								</TableCell>
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
								<TextField label="homepage" size="small" value={cardFields.homepage ?? ''} onChange={(e) => handleFieldChange('homepage', e.target.value)} />
								<TextField label="url" size="small" value={cardFields.url ?? ''} onChange={(e) => handleFieldChange('url', e.target.value)} />
								<TextField label="version" size="small" value={cardFields.version ?? ''} onChange={(e) => handleFieldChange('version', e.target.value)} />
								<TextField label="preferredTransport" size="small" value={cardFields.preferredTransport ?? ''} onChange={(e) => handleFieldChange('preferredTransport', e.target.value)} />
								<TextField label="protocolVersion" size="small" value={cardFields.protocolVersion ?? ''} onChange={(e) => handleFieldChange('protocolVersion', e.target.value)} />
								<TextField label="defaultInputModes (comma)" size="small" value={cardFields.defaultInputModes ?? ''} onChange={(e) => handleFieldChange('defaultInputModes', e.target.value)} />
								<TextField label="defaultOutputModes (comma)" size="small" value={cardFields.defaultOutputModes ?? ''} onChange={(e) => handleFieldChange('defaultOutputModes', e.target.value)} />
								<TextField label="trustModels (comma-separated)" size="small" value={Array.isArray(cardFields.trustModels) ? cardFields.trustModels.join(', ') : (cardFields.trustModels ?? '')} onChange={(e) => handleFieldChange('trustModels', e.target.value)} />
								<TextField label="skillId" size="small" value={cardFields.skillId ?? ''} onChange={(e) => handleFieldChange('skillId', e.target.value)} />
								<TextField label="skillName" size="small" value={cardFields.skillName ?? ''} onChange={(e) => handleFieldChange('skillName', e.target.value)} />
								<TextField label="skillDescription" size="small" value={cardFields.skillDesc ?? ''} onChange={(e) => handleFieldChange('skillDesc', e.target.value)} />
								<TextField label="skillTags (comma-separated)" size="small" value={cardFields.skillTags ?? ''} onChange={(e) => handleFieldChange('skillTags', e.target.value)} />
								<TextField label="skillExamples (comma or newline)" size="small" multiline minRows={2} value={cardFields.skillExamples ?? ''} onChange={(e) => handleFieldChange('skillExamples', e.target.value)} />
							</Stack>
							{cardLoading && <Typography variant="body2">Building…</Typography>}
							{cardError && <Typography variant="body2" color="error">{cardError}</Typography>}
						</Grid>
						<Grid item xs={12} md={6}>
							<Box sx={{ maxHeight: 480, overflow: 'auto' }}>
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
												...obj,
												name: cardFields.name || obj.name,
												description: cardFields.description || obj.description,
												homepage: cardFields.homepage || obj.homepage,
												url: cardFields.url || obj.url,
												version: cardFields.version || obj.version,
												preferredTransport: cardFields.preferredTransport || obj.preferredTransport,
												protocolVersion: cardFields.protocolVersion || obj.protocolVersion,
												trustModels: Array.isArray(cardFields.trustModels)
													? cardFields.trustModels
													: String(cardFields.trustModels || '')
														.split(',')
														.map((x: string) => x.trim())
														.filter(Boolean),
												capabilities: { pushNotifications: !!cardFields.capPush, streaming: !!cardFields.capStream },
												defaultInputModes: String(cardFields.defaultInputModes || '')
													.split(',')
													.map((x: string) => x.trim())
													.filter(Boolean),
												defaultOutputModes: String(cardFields.defaultOutputModes || '')
													.split(',')
													.map((x: string) => x.trim())
													.filter(Boolean),
												skills: [
													{
														id: cardFields.skillId || undefined,
														name: cardFields.skillName || undefined,
														description: cardFields.skillDesc || undefined,
														tags: String(cardFields.skillTags || '')
															.split(',')
															.map((x: string) => x.trim())
															.filter(Boolean),
														examples: String(cardFields.skillExamples || '')
															.split(/\n|,/)
															.map((x: string) => x.trim())
															.filter(Boolean),
													},
												],
											};
											if (obj?.registrations?.[0]?.signature) {
												merged.registrations[0].signature = shortenSignature(obj.registrations[0].signature);
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
