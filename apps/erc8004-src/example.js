/**
 * ERC-8004 SDK Usage Example
 * 
 * This example demonstrates how to use the ERC-8004 SDK in your projects.
 */

const { ERC8004Client, EthersAdapter } = require('./dist/index.js');
const { ethers } = require('ethers');

async function example() {
  // 1. Set up your provider (replace with your RPC URL)
  const provider = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY');
  
  // 2. Create an adapter
  const adapter = new EthersAdapter(provider);
  
  // 3. Define contract addresses for your network
  const addresses = {
    identityRegistry: '0x1234567890123456789012345678901234567890', // Replace with actual address
    reputationRegistry: '0x0987654321098765432109876543210987654321', // Replace with actual address
  };
  
  // 4. Initialize the SDK client
  const client = new ERC8004Client({
    adapter,
    addresses
  });
  
  try {
    // 5. Use the SDK
    console.log('ERC-8004 SDK initialized successfully!');
    
    // Example: Get identity information
    // const tokenURI = await client.identity.getTokenURI(1);
    // console.log('Token URI:', tokenURI);
    
    // Example: Get reputation score
    // const score = await client.reputation.getReputationScore('0x...');
    // console.log('Reputation score:', score);
    
    // Example: Validate agent metadata
    // const isValid = await client.validation.validateAgentMetadata({...});
    // console.log('Metadata valid:', isValid);
    
  } catch (error) {
    console.error('Error using SDK:', error);
  }
}

// Run the example
if (require.main === module) {
  example().catch(console.error);
}

module.exports = { example };
