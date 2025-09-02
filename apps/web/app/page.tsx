import { AgentTable } from "@/components/AgentTable";
import { Container, Typography, Box, Paper } from '@mui/material';

export default function Page() {
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>ERC‑8004 Identity Registry — Index</Typography>
        <Typography variant="body1" color="text.secondary">Search and explore registered agents, domains and addresses.</Typography>
      </Box>
      <Paper elevation={0} sx={{ p: { xs: 1, sm: 2 }, bgcolor: 'transparent' }}>
        <AgentTable />
      </Paper>
    </Container>
  );
}
