'use client';
import * as React from 'react';
import {
  Box,
  Paper,
  TextField,
  Button,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Stack,
} from '@mui/material';

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

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		fetchData(1);
	}

	function clearFilters() {
		setDomain("");
		setAddress("");
		setAgentId("");
		fetchData(1);
	}

	async function copy(text: string) {
		try { await navigator.clipboard.writeText(text); } catch {}
	}

	return (
		<Stack spacing={3}>
			<Paper variant="outlined" sx={{ p: 2.5 }}>
				<Box component="form" onSubmit={handleSubmit}>
					<Grid container spacing={2}>
						<Grid item xs={12} md={3}>
							<TextField fullWidth label="Domain" placeholder="Filter by domain" value={domain} onChange={(e) => setDomain(e.target.value)} size="small" />
						</Grid>
						<Grid item xs={12} md={4}>
							<TextField fullWidth label="Agent address" placeholder="0x…" value={address} onChange={(e) => setAddress(e.target.value)} size="small" />
						</Grid>
						<Grid item xs={12} md={3}>
							<TextField fullWidth label="AgentId" placeholder="Filter by id" value={agentId} onChange={(e) => setAgentId(e.target.value)} size="small" />
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
						</TableRow>
					</TableHead>
					<TableBody>
						{!isLoading && data?.rows?.length === 0 && (
							<TableRow>
								<TableCell colSpan={3} align="center">
									<Typography variant="body2" color="text.secondary">No agents found.</Typography>
								</TableCell>
							</TableRow>
						)}
						{isLoading && (
							<TableRow>
								<TableCell colSpan={3} align="center">
									<Typography variant="body2" color="text.secondary">Loading…</Typography>
								</TableCell>
							</TableRow>
						)}
						{data?.rows?.map((row) => (
							<TableRow key={row.agentId} hover>
								<TableCell sx={{ fontWeight: 600 }}>{row.agentDomain}</TableCell>
								<TableCell>
									<Stack direction="row" spacing={1} alignItems="center">
										<Typography component="span" variant="body2" sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }} noWrap title={row.agentAddress}>{row.agentAddress}</Typography>
										<Button size="small" onClick={() => copy(row.agentAddress)}>Copy</Button>
									</Stack>
								</TableCell>
								<TableCell>
									<Chip label={row.agentId} size="small" sx={{ fontFamily: 'ui-monospace, monospace' }} />
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</TableContainer>

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
