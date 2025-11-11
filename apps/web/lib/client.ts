import { AgenticTrustClient, type ApiClientConfig } from '@agentic-trust/core/server';

let clientPromise: Promise<AgenticTrustClient> | null = null;

function resolveGraphQLUrl(): string {
  const baseUrl =
    process.env.AGENTIC_TRUST_GRAPHQL_URL ||
    process.env.NEXT_PUBLIC_AGENTIC_TRUST_GRAPHQL_URL ||
    process.env.GRAPHQL_API_URL ||
    process.env.NEXT_PUBLIC_GRAPHQL_API_URL ||
    process.env.AGENTIC_TRUST_DISCOVERY_URL ||
    process.env.NEXT_PUBLIC_DISCOVERY_API_URL ||
    process.env.DISCOVERY_API_URL ||
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

function buildClientConfig(): ApiClientConfig {
  const graphQLUrl = resolveGraphQLUrl();
  const apiKey = resolveApiKey();
  const privateKey = process.env.AGENTIC_TRUST_PRIVATE_KEY;
  const rpcUrl = process.env.AGENTIC_TRUST_RPC_URL || process.env.NEXT_PUBLIC_RPC_URL;

  const config: ApiClientConfig = {
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

export async function getAdminClient(): Promise<AgenticTrustClient> {
  if (!clientPromise) {
    const config = buildClientConfig();
    clientPromise = AgenticTrustClient.create(config);
  }

  return clientPromise;
}


