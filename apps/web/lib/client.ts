/**
 * AgenticTrust Client setup for admin app
 *
 * Initializes AgenticTrustClient with admin configuration for agent management
 */

import { AgenticTrustClient, type ApiClientConfig, getChainRpcUrl, getChainEnvVar, DEFAULT_CHAIN_ID } from '@agentic-trust/core/server';

// Singleton instance
let agenticTrustClientInstance: AgenticTrustClient | null = null;
let initializationPromise: Promise<AgenticTrustClient> | null = null;

/**
 * Get or create the server-side AgenticTrustClient singleton for the admin app
 * Uses admin configuration from environment variables or session
 */
export async function getAdminClient(): Promise<AgenticTrustClient> {
  // Always create a new instance per request to support session-based auth
  // This ensures each request uses the correct private key from the session
  try {
    // Get configuration from environment variables (server-side only)
    const discoveryUrl =
      process.env.AGENTIC_TRUST_GRAPHQL_URL ||
      process.env.NEXT_PUBLIC_AGENTIC_TRUST_GRAPHQL_URL ||
      process.env.GRAPHQL_API_URL ||
      process.env.NEXT_PUBLIC_GRAPHQL_API_URL ||
      process.env.AGENTIC_TRUST_DISCOVERY_URL ||
      process.env.NEXT_PUBLIC_DISCOVERY_API_URL ||
      undefined;

    const apiKey =
      process.env.AGENTIC_TRUST_API_KEY ||
      process.env.AGENTIC_TRUST_DISCOVERY_API_KEY ||
      process.env.GRAPHQL_SECRET_ACCESS_CODE ||
      process.env.NEXT_PUBLIC_GRAPHQL_SECRET ||
      undefined;

    // Try to get private key from session first, then fall back to environment variable
    let privateKey: string | undefined;
    try {
      // Fetch private key from session API (server-side)
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      privateKey = cookieStore.get('admin_private_key')?.value;
    } catch (error) {
      // If cookies() fails, fall back to environment variable
      console.warn('Could not access cookies, using environment variable for private key');
    }

    // Fall back to environment variable if no session key
    if (!privateKey) {
      privateKey = process.env.AGENTIC_TRUST_ADMIN_PRIVATE_KEY || process.env.AGENTIC_TRUST_PRIVATE_KEY;
    }

    const rpcUrl = getChainRpcUrl(DEFAULT_CHAIN_ID) || process.env.AGENTIC_TRUST_RPC_URL || process.env.NEXT_PUBLIC_RPC_URL;

    // Get identity registry from environment (chain-specific)
    // Use getChainEnvVar to support chain-specific variables
    const identityRegistry = getChainEnvVar('AGENTIC_TRUST_IDENTITY_REGISTRY', DEFAULT_CHAIN_ID);

    const config: ApiClientConfig = {
      timeout: 30000,
      headers: {
        Accept: 'application/json',
      },
    };

    // Set discovery URL if provided
    if (discoveryUrl) {
      config.graphQLUrl = discoveryUrl;
    }

    // Set apiKey if provided
    if (apiKey) {
      config.apiKey = apiKey;
    }

    // Set private key if provided
    if (privateKey) {
      config.privateKey = privateKey;
    }

    // Set RPC URLs if provided
    if (rpcUrl) {
      config.rpcUrl = rpcUrl;
    }

    // Set identity registry if provided
    if (identityRegistry) {
      config.identityRegistry = identityRegistry as `0x${string}`;
    }

    // Create the client
    console.info('Creating Admin AgenticTrustClient instance');
    const client = await AgenticTrustClient.create(config);
    console.log('✅ Admin AgenticTrustClient initialized');
    return client;
  } catch (error) {
    console.error('❌ Failed to initialize admin AgenticTrustClient:', error);
    throw error;
  }
}

/**
 * Reset the client instance (useful for testing)
 */
export function resetAdminClient(): void {
  agenticTrustClientInstance = null;
  initializationPromise = null;
}
