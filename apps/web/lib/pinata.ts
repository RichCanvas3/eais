/**
 * Pinata IPFS client for decentralized storage
 */

const PINATA_UPLOAD_TIMEOUT = 60000; // 60 seconds
const PINATA_GATEWAY_TIMEOUT = 30000; // 30 seconds

// Common IPFS gateways for retrieving data
const IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://dweb.link/ipfs/',
];

/**
 * Verify Pinata JWT is configured
 */
function verifyPinataConfig(): void {
  if (!process.env.PINATA_JWT) {
    throw new Error('PINATA_JWT environment variable is required');
  }
}

/**
 * Upload data to Pinata using v3 API
 */
export async function uploadToPinata(data: string, filename: string = 'data.json'): Promise<string> {
  verifyPinataConfig();
  
  const url = 'https://uploads.pinata.cloud/v3/files';
  const headers = {
    Authorization: `Bearer ${process.env.PINATA_JWT}`,
  };

  // Create a Blob from the data
  const blob = new Blob([data], { type: 'application/json' });
  const formData = new FormData();
  formData.append('file', blob, filename);
  formData.append('network', 'public');

  try {
    // Add timeout to fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PINATA_UPLOAD_TIMEOUT);
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to pin to Pinata: HTTP ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    // Pinata v3 API returns CID in data.cid
    const cid = result?.data?.cid || result?.cid || result?.IpfsHash;
    if (!cid) {
      throw new Error(`No CID returned from Pinata. Response: ${JSON.stringify(result)}`);
    }

    return cid;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Pinata upload timed out after ${PINATA_UPLOAD_TIMEOUT / 1000} seconds`);
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to pin to Pinata: ${errorMessage}`);
  }
}

/**
 * Get data from IPFS by CID using multiple gateways
 */
export async function getFromPinata(cid: string): Promise<string> {
  // Extract CID from IPFS URL if needed
  if (cid.startsWith('ipfs://')) {
    cid = cid.slice(7); // Remove "ipfs://" prefix
  }

  // Try all gateways in parallel - use the first successful response
  const promises = IPFS_GATEWAYS.map(async (gateway) => {
    try {
      const url = `${gateway}${cid}`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(PINATA_GATEWAY_TIMEOUT),
      });
      
      if (response.ok) {
        return await response.text();
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      throw error;
    }
  });

  // Use Promise.allSettled to get the first successful result
  const results = await Promise.allSettled(promises);
  for (const result of results) {
    if (result.status === 'fulfilled') {
      return result.value;
    }
  }

  throw new Error('Failed to retrieve data from all IPFS gateways');
}

/**
 * Get JSON data from IPFS by CID
 */
export async function getJsonFromPinata<T = Record<string, unknown>>(cid: string): Promise<T> {
  const data = await getFromPinata(cid);
  return JSON.parse(data) as T;
}

/**
 * Upload JSON data to Pinata
 */
export async function uploadJsonToPinata(data: Record<string, unknown>, filename: string = 'data.json'): Promise<string> {
  const jsonStr = JSON.stringify(data, null, 2);
  return uploadToPinata(jsonStr, filename);
}

