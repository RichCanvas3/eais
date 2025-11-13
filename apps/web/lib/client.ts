type ClientConfig = {
  graphQLUrl: string;
  apiKey?: string;
  privateKey?: string;
  rpcUrl?: string;
};

type AdminClient = {
  agents: {
    getAgentFromGraphQL(chainId: number, agentId: string): Promise<any>;
    searchAgents(options?: unknown): Promise<{ agents: any[]; total: number } | any>;
  };
};

let clientPromise: Promise<AdminClient> | null = null;

function resolveGraphQLUrl(): string {
  const baseUrl =
    process.env.AGENTIC_TRUST_GRAPHQL_URL ||
    process.env.NEXT_PUBLIC_AGENTIC_TRUST_GRAPHQL_URL ||
    process.env.GRAPHQL_API_URL ||
    process.env.NEXT_PUBLIC_GRAPHQL_API_URL ||
    process.env.AGENTIC_TRUST_DISCOVERY_URL ||
    process.env.NEXT_PUBLIC_DISCOVERY_API_URL ||
    '';

  if (!baseUrl) {
    throw new Error(
      'Missing GraphQL URL. Set AGENTIC_TRUST_GRAPHQL_URL, GRAPHQL_API_URL, or DISCOVERY_URL in the environment.'
    );
  }

  return baseUrl;
}

function resolveApiKey(): string | undefined {
  return (
    process.env.AGENTIC_TRUST_API_KEY ||
    process.env.AGENTIC_TRUST_DISCOVERY_API_KEY ||
    process.env.GRAPHQL_SECRET_ACCESS_CODE ||
    process.env.NEXT_PUBLIC_GRAPHQL_SECRET ||
    undefined
  );
}

function buildClientConfig(): ClientConfig {
  const graphQLUrl = resolveGraphQLUrl();
  const apiKey = resolveApiKey();
  const privateKey = process.env.AGENTIC_TRUST_PRIVATE_KEY;
  const rpcUrl = process.env.AGENTIC_TRUST_RPC_URL || process.env.NEXT_PUBLIC_RPC_URL;

  const config: ClientConfig = {
    graphQLUrl,
  };

  if (apiKey) {
    config.apiKey = apiKey;
  }
  if (privateKey) {
    config.privateKey = privateKey;
  }
  if (rpcUrl) {
    config.rpcUrl = rpcUrl;
  }

  return config;
}

async function initializeClient(): Promise<AdminClient> {
  const core = (await import('@agentic-trust/core/server')) as any;
  return core.AgenticTrustClient.create(buildClientConfig()) as Promise<AdminClient>;
}

export async function getAdminClient(): Promise<AdminClient> {
  if (!clientPromise) {
    clientPromise = initializeClient();
  }

  return clientPromise;
}


