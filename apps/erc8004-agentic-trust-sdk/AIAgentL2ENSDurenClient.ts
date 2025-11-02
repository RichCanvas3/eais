
import { createPublicClient, http, custom, encodeFunctionData, keccak256, stringToHex, zeroAddress, createWalletClient, namehash, hexToString, type Address } from 'viem';

import { AIAgentENSClient } from './AIAgentENSClient';
import { sepolia, baseSepolia, optimismSepolia } from 'viem/chains';

export class AIAgentL2ENSDurenClient extends AIAgentENSClient {

  constructor(
    chain: any,
    rpcUrl: string,
    adapter: any,
    ensRegistryAddress: `0x${string}`,
    ensResolverAddress: `0x${string}`,
    identityRegistryAddress: `0x${string}`,
  ) {
    super(chain, rpcUrl, adapter, 
      '0x119bFf40969bFBe0438c3f72f3855958E8E0d30c', 
      '0x119bFf40969bFBe0438c3f72f3855958E8E0d30c', 
      identityRegistryAddress);

    
    //ensRegistryAddress = '0xf584057f3e9ecd550b52a86f84dfeb9f928e003f' as `0x${string}`;
    //ensResolverAddress = '0xf584057f3e9ecd550b52a86f84dfeb9f928e003f' as `0x${string}`;
  }


  /**
   * Override to ensure L2 client always returns true for isL2()
   */
  isL2(): boolean {
    return true; // This is always an L2 client
  }

  /**
   * Override to ensure L2 client always returns false for isL1()
   */
  isL1(): boolean {
    return false; // This is never an L1 client
  }

  /**
   * Override to ensure L2 client always returns 'L2'
   */
  getChainType(): 'L1' | 'L2' {
    return 'L2';
  }


  async getAgentUrlByName(name: string): Promise<string | null> {

    console.info("AIAgentL2ENSDurenClient.getAgentUrlByName: ", name);
    
    try {
      // Calculate namehash for the subdomain
      const node = namehash(name);
      console.info("AIAgentL2ENSDurenClient.getAgentUrlByName: node", node);

      // Use direct resolver call to get URL text record (equivalent to cast call)
      const resolverAddress = this.getEnsResolverAddress()
      
      // ENS Resolver ABI for text function
      const resolverAbi = [
        {
          "inputs": [
            {
              "internalType": "bytes32",
              "name": "node",
              "type": "bytes32"
            },
            {
              "internalType": "string",
              "name": "key",
              "type": "string"
            }
          ],
          "name": "text",
          "outputs": [
            {
              "internalType": "string",
              "name": "",
              "type": "string"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        }
      ] as const;

      // Create public client for reading
      const publicClient = // @ts-ignore - viem version compatibility issue
    createPublicClient({
        chain: (this as any).chain,
        transport: http((this as any).rpcUrl)
      });

      // Call the resolver directly to get URL text record
      const url = await // @ts-ignore - viem version compatibility issue
    publicClient.readContract({
        address: resolverAddress,
        abi: resolverAbi,
        functionName: 'text',
        args: [node, 'url']
      });

      console.info("AIAgentL2ENSDurenClient.getAgentUrlByName: resolved url", url);
      
      // Return null if URL is empty
      if (!url || url.trim() === '') {
        return null;
      }

      return url as string;

    } catch (error) {
      console.error('Error resolving URL for name:', name, error);
      return null;
    }
  }


  async getAgentAccountByName(name: string): Promise<`0x${string}` | null> {

    console.info("AIAgentL2ENSDurenClient.getAgentAccountByName: ", name);
    
    try {
      // Calculate namehash for the subdomain
      const node = namehash(name);
      console.info(".....node from hash: ", name, " is: ", node);
      //const node = '0x6ea6fadc0faff80d2349984bfc18c82b246ba9e8ba697f0356956a4f1e6b2b29' as `0x${string}`;
      console.info("AIAgentL2ENSDurenClient.getAgentAccountByName: node", node);

      // TEST: Check if NFT exists but may not have address set
      console.info("********************* TEST: Checking if NFT exists for name:", name);
      
      // First check if the name exists in the ENS registry (has an owner)
      const ensRegistryAddress = this.getEnsRegistryAddress()

      const ensRegistryAbi = [
        {
          "inputs": [
            {
              "internalType": "bytes32",
              "name": "node",
              "type": "bytes32"
            }
          ],
          "name": "owner",
          "outputs": [
            {
              "internalType": "address",
              "name": "",
              "type": "address"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        }
      ] as const;

      console.info("********************* TEST: Public client chain", (this as any).chain);
      console.info("********************* TEST: Public client rpcUrl", (this as any).rpcUrl);

      const publicClient = // @ts-ignore - viem version compatibility issue
    createPublicClient({
        chain: (this as any).chain,
        transport: http((this as any).rpcUrl)
      });

      try {
        const owner = await // @ts-ignore - viem version compatibility issue
    publicClient.readContract({
          address: ensRegistryAddress,
          abi: ensRegistryAbi,
          functionName: 'owner',
          args: [node]
        });

        console.info("********************* TEST: ENS Registry owner for", name, ":", owner);
        
        if (owner && owner !== '0x0000000000000000000000000000000000000000') {
          console.info("********************* TEST: NFT EXISTS - Name has owner:", owner);
        } else {
          console.info("********************* TEST: NFT DOES NOT EXIST - No owner found");
        }
      } catch (registryError) {
        console.error("********************* TEST: Error checking ENS registry:", registryError);
      }

      // Use direct resolver call to get address (equivalent to cast call)
      const resolverAddress = this.getEnsResolverAddress()

      // ENS Resolver ABI for addr function
      const resolverAbi = [
        {
          "inputs": [
            {
              "internalType": "bytes32",
              "name": "node",
              "type": "bytes32"
            }
          ],
          "name": "addr",
          "outputs": [
            {
              "internalType": "address",
              "name": "",
              "type": "address"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        }
      ] as const;

      /*
      // TEST: Check resolver status
      console.info("********************* TEST: Checking resolver for name:", name);
      
      // Check if resolver is set for this node
      const registryResolverAbi = [
        {
          "inputs": [
            {
              "internalType": "bytes32",
              "name": "node",
              "type": "bytes32"
            }
          ],
          "name": "resolver",
          "outputs": [
            {
              "internalType": "address",
              "name": "",
              "type": "address"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        }
      ] as const;

      try {
        const resolver = await // @ts-ignore - viem version compatibility issue
    publicClient.readContract({
          address: ensRegistryAddress,
          abi: registryResolverAbi,
          functionName: 'resolver',
          args: [node]
        });

        console.info("********************* TEST: Resolver for", name, ":", resolver);
        
        if (resolver && resolver !== '0x0000000000000000000000000000000000000000') {
          console.info("********************* TEST: RESOLVER EXISTS - Name has resolver:", resolver);
        } else {
          console.info("********************* TEST: NO RESOLVER - Name has no resolver set");
        }
      } catch (resolverError) {
        console.error("********************* TEST: Error checking resolver:", resolverError);
      }
      */

      // Call the resolver directly to get address
      const addressResolverAbi = [
        {
          "inputs": [
            {
              "internalType": "bytes32",
              "name": "node",
              "type": "bytes32"
            }
          ],
          "name": "addr",
          "outputs": [
            {
              "internalType": "address",
              "name": "",
              "type": "address"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        }
      ] as const;

      const address = await // @ts-ignore - viem version compatibility issue
    publicClient.readContract({
        address: resolverAddress,
        abi: addressResolverAbi,
        functionName: 'addr',
        args: [node]
      });

      console.info("AIAgentL2ENSDurenClient.getAgentAccountByName: resolved address", address);
      console.info("********************* TEST: Address resolution result:", address);
      
      // Return null if address is zero address
      if (!address || address === '0x0000000000000000000000000000000000000000') {
        return null;
      }

      return address as `0x${string}`;

    } catch (error) {
      console.error('Error resolving address for name:', name, error);
      return null;
    }
  }


  /**
   * Note: getAgentEoaByAgentAccount is not a method of AIAgentENSClient
   * This method is actually in AIAgentIdentityClient, so we don't need to override it here.
   * The ownership detection logic is handled in the UI layer (AddAgentModal.tsx)
   */

  /**
   * Override hasAgentNameOwner to use L2Registrar available() function
   */
  async hasAgentNameOwner(orgName: string, agentName: string): Promise<boolean> {
    console.info("AIAgentL2ENSDurenClient.hasAgentNameOwner");
    
    const clean = (s: string) => (s || '').trim().toLowerCase();
    const parent = clean(orgName);
    const label = clean(agentName).replace(/\s+/g, '-');
    console.info("AIAgentL2ENSDurenClient.hasAgentNameOwner: label", label);
    console.info("AIAgentL2ENSDurenClient.hasAgentNameOwner: parent", parent);
    const fullSubname = `${label}.${parent}`;
    console.info("AIAgentL2ENSDurenClient.hasAgentNameOwner: fullSubname", fullSubname);

    // Use L2Registrar contract address (same as registerSubdomain)
    const l2RegistrarAddress = "0x68CAd072571E8bea1DA9e5C071367Aa6ddC8F37F" as `0x${string}`;
    const l2RegistrarAbi = [
      {
        "inputs": [
          {
            "internalType": "string",
            "name": "label",
            "type": "string"
          }
        ],
        "name": "available",
        "outputs": [
          {
            "internalType": "bool",
            "name": "available",
            "type": "bool"
          }
        ],
        "stateMutability": "view",
        "type": "function"
      }
    ] as const;

    const publicClient = // @ts-ignore - viem version compatibility issue
    createPublicClient({
      chain: (this as any).chain,
      transport: http((this as any).rpcUrl)
    });

    try {
      // Call registrar.available(label) - returns true if available, false if taken
      const isAvailable = await // @ts-ignore - viem version compatibility issue
    publicClient.readContract({
        address: l2RegistrarAddress,
        abi: l2RegistrarAbi,
        functionName: 'available',
        args: [label]
      });

      // If not available, then it has an owner
      const hasOwner = !isAvailable;
      console.info(`AIAgentL2ENSDurenClient.hasAgentNameOwner: "${fullSubname}" (label: "${label}") ${hasOwner ? 'HAS owner' : 'has NO owner'} (available: ${isAvailable})`);
      return hasOwner;
    } catch (error) {
      console.error('Error checking agent name owner via registrar:', error);
      return false;
    }
  }


  async prepareAddAgentNameToOrgCalls(params: {
    orgName: string;            // e.g., 'airbnb.eth'
    agentName: string;          // e.g., 'my-agent'
    agentAddress: `0x${string}`; // AA address for the agent name
    agentUrl: string    //  URL
  }): Promise<{ calls: { to: `0x${string}`; data: `0x${string}`; value?: bigint }[] }> {

    console.log("AIAgentL2ENSDurenClient.prepareAddAgentNameToOrgCalls");
    console.log("orgName: ", params.orgName);
    console.log("agentName: ", params.agentName);
    console.log("agentAddress: ", params.agentAddress);
    console.log("agentUrl: ", params.agentUrl);
    
    const clean = (s: string) => (s || '').trim().toLowerCase();
    const parent = clean(params.orgName) + ".eth";
    const label = clean(params.agentName).replace(/\s+/g, '-');
    const fullSubname = `${label}.${parent}`;
    const agentAddress = params.agentAddress;
    const agentUrl = params.agentUrl;

    const chainName = (this as any).chain.name.toLowerCase().replace(/\s+/g, '-');

    console.info("parent: ", parent);
    console.info("label: ", label);
    console.info("fullSubname: ", fullSubname);
    console.info("agentAddress: ", agentAddress);
    console.info("chainName: ", chainName);
    console.info("agentUrl: ", agentUrl);

    const calls: { to: `0x${string}`; data: `0x${string}`; value?: bigint }[] = [];

    try {
      // Step 1: Register the subdomain with L2Registrar
      const registrationCall = await this.registerSubdomain(
        label,
        agentAddress
      );
      
      // Add registration call
      calls.push(...registrationCall.calls);

      /*

      // Step 2: Set address records for the subdomain
      const chainId = (this as any).chain.id;

      // Set Base Sepolia address record (coinType 2147568164)
      if (chainId === 84532) { // Base Sepolia
        const baseAddrCall = await this.setResolverAddrRecordDirect(
          fullSubname,
          2147568164, // Base Sepolia coin type
          agentAddress
        );
        calls.push(baseAddrCall);
      }

      
      // Set Ethereum address record (coinType 60) for cross-chain compatibility
      const ethAddrCall = await this.setResolverAddrRecordDirect(
        fullSubname,
        60, // Ethereum coin type
        agentAddress
      );
      calls.push(ethAddrCall);


      // Step 3: Set resolver records for the subdomain
      const textRecords = [
        { key: 'name', value: label },
        { key: 'url', value: agentUrl },
        { key: 'description', value: `Agent: ${label}` },
        { key: 'chain', value: chainName },
        { key: 'agent-account', value: agentAddress },
      ];

      for (const record of textRecords) {
        const recordCall = await this.setResolverTextRecordDirect(
          fullSubname,
          record.key,
          record.value,
        );
        calls.push(recordCall);
      }




      console.info("Generated calls count: ", calls.length);
      console.info("Calls: ", calls);

      */

    } catch (error) {
      console.error("Error preparing agent name calls:", error);
      throw error;
    }

    return { calls };
  }

  async prepareAddAgentInfoCalls(params: {
    orgName: string;            // e.g., 'airbnb.eth'
    agentName: string;          // e.g., 'my-agent'
    agentAddress: `0x${string}`; // AA address for the agent name
    agentUrl: string    //  URL
    agentDescription?: string | null    // optional description
  }): Promise<{ calls: { to: `0x${string}`; data: `0x${string}`; value?: bigint }[] }> {

    console.log("AIAgentL2ENSDurenClient.prepareAddAgentNameToOrgCalls");
    console.log("orgName: ", params.orgName);
    console.log("agentName: ", params.agentName);
    console.log("agentAddress: ", params.agentAddress);
    console.log("agentUrl: ", params.agentUrl);
    
    const clean = (s: string) => (s || '').trim().toLowerCase();
    const parent = clean(params.orgName) + ".eth";
    const label = clean(params.agentName).replace(/\s+/g, '-');
    const fullSubname = `${label}.${parent}`;
    const agentAddress = params.agentAddress;
    const agentUrl = params.agentUrl;

    const chainName = (this as any).chain.name.toLowerCase().replace(/\s+/g, '-');

    console.info("parent: ", parent);
    console.info("label: ", label);
    console.info("fullSubname: ", fullSubname);
    console.info("agentAddress: ", agentAddress);
    console.info("chainName: ", chainName);
    console.info("agentUrl: ", agentUrl);

    const calls: { to: `0x${string}`; data: `0x${string}`; value?: bigint }[] = [];

    try {


      // Step 2: Set address records for the subdomain
      const chainId = (this as any).chain.id;

      // Set Base Sepolia address record (coinType 2147568164)
      if (chainId === 84532) { // Base Sepolia
        const baseAddrCall = await this.setResolverAddrRecordDirect(
          fullSubname,
          2147568164, // Base Sepolia coin type
          agentAddress
        );
        calls.push(baseAddrCall);
      }

      /*
      // Set Ethereum address record (coinType 60) for cross-chain compatibility
      const ethAddrCall = await this.setResolverAddrRecordDirect(
        fullSubname,
        60, // Ethereum coin type
        agentAddress
      );
      calls.push(ethAddrCall);
      */


      // Step 3: Set resolver records for the subdomain
      const textRecords = [
        //{ key: 'name', value: label },
        { key: 'url', value: agentUrl },
        //{ key: 'description', value: `Agent: ${label}` },
        //{ key: 'chain', value: chainName },
        //{ key: 'agent-account', value: agentAddress },
      ];
      
      // Add description if provided
      if (params.agentDescription && params.agentDescription.trim() !== '') {
        textRecords.push({ key: 'description', value: params.agentDescription.trim() });
      }

      for (const record of textRecords) {
        const recordCall = await this.setResolverTextRecordDirect(
          fullSubname,
          record.key,
          record.value,
        );
        calls.push(recordCall);
      }




      console.info("Generated calls count: ", calls.length);
      console.info("Calls: ", calls);


    } catch (error) {
      console.error("Error preparing agent name calls:", error);
      throw error;
    }

    return { calls };
  }

  async prepareSetNameUriCalls(
    name: string,
    uri: string
  ): Promise<{ calls: { to: `0x${string}`; data: `0x${string}` }[] }> {

    const calls: { to: `0x${string}`; data: `0x${string}` }[] = [];

    return { calls };
  }


  /**
   * Register subdomain using L2Registrar contract (Base Sepolia specific)
   */
  async registerSubdomain(
    subdomain: string,
    owner: `0x${string}`
  ): Promise<{ calls: { to: `0x${string}`; data: `0x${string}`; value?: bigint }[] }> {
    
    console.log("AIAgentL2ENSDurenClient.registerSubdomain");
    console.log("subdomain:", subdomain);
    console.log("owner:", owner);


    const calls: { to: `0x${string}`; data: `0x${string}`; value?: bigint }[] = [];

    // L2Registrar ABI - 2-parameter register function
    const l2RegistrarAbi = [
      {
        "inputs": [
          {
            "internalType": "string",
            "name": "name",
            "type": "string"
          },
          {
            "internalType": "address",
            "name": "owner",
            "type": "address"
          }
        ],
        "name": "register",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
      }
    ] as const;

    // Use L2Registrar contract address for Base Sepolia
    const l2RegistrarAddress = "0x68CAd072571E8bea1DA9e5C071367Aa6ddC8F37F" as `0x${string}`;

    // Register subdomain using L2Registrar (equivalent to your cast command)
    const registerData = encodeFunctionData({
      abi: l2RegistrarAbi,
      functionName: 'register',
      args: [subdomain, owner]
    });

    calls.push({
      to: l2RegistrarAddress,
      data: registerData,
      value: 0n
    });

    return { calls };
  }

  /**
   * Direct chain call for setting resolver records
   */
  async setResolverTextRecordDirect(
    name: string,
    key: string,
    value: string
  ): Promise<{ to: `0x${string}`; data: `0x${string}` }> {
    
    console.log("AIAgentL2ENSDurenClient.setResolverTextRecordDirect");
    console.log("name:", name);
    console.log("key:", key);
    console.log("value:", value);

    const resolverAddress = this.getEnsResolverAddress()


    // ENS Resolver ABI for setText
    const resolverAbi = [
      {
        "inputs": [
          {
            "internalType": "bytes32",
            "name": "node",
            "type": "bytes32"
          },
          {
            "internalType": "string",
            "name": "key",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "value",
            "type": "string"
          }
        ],
        "name": "setText",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
      }
    ] as const;

    // Calculate namehash for the subdomain
    const node = namehash(name);

    // Encode the setText function call
    const data = encodeFunctionData({
      abi: resolverAbi,
      functionName: 'setText',
      args: [node, key, value]
    });

    return {
      to: resolverAddress,
      data
    };
  }

  /**
   * Direct chain call for setting resolver address records
   * Equivalent to: cast send resolver "setAddr(bytes32,uint256,bytes)" $NODE coinType encodedAddress
   */
  async setResolverAddrRecordDirect(
    name: string,
    coinType: number,
    address: `0x${string}`
  ): Promise<{ to: `0x${string}`; data: `0x${string}` }> {
    
    console.log("AIAgentL2ENSDurenClient.setResolverAddrRecordDirect");
    console.log("name:", name);
    console.log("coinType:", coinType);
    console.log("address:", address);

    const resolverAddress = this.getEnsResolverAddress()

    // ENS Resolver ABI for setAddr
    const resolverAbi = [
      {
        "inputs": [
          {
            "internalType": "bytes32",
            "name": "node",
            "type": "bytes32"
          },
          {
            "internalType": "uint256",
            "name": "coinType",
            "type": "uint256"
          },
          {
            "internalType": "bytes",
            "name": "a",
            "type": "bytes"
          }
        ],
        "name": "setAddr",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
      }
    ] as const;

    // Calculate namehash for the subdomain
    const node = namehash(name);

    // Encode the address according to the coin type
    // For Base Sepolia (coinType 2147568164), we need to encode as bytes
    let encodedAddress: `0x${string}`;
    
    if (coinType === 2147568164) {
      // Base Sepolia coin type - encode as bytes
      // Equivalent to: $(cast abi-encode "f(address)" 0xYourBaseAddress)
      encodedAddress = encodeFunctionData({
        abi: [{ "inputs": [{ "internalType": "address", "name": "addr", "type": "address" }], "name": "f", "outputs": [], "stateMutability": "nonpayable", "type": "function" }],
        functionName: 'f',
        args: [address]
      }) as `0x${string}`;
    } else if (coinType === 60) {
      // Ethereum coin type - encode as 20-byte address
      encodedAddress = address.padEnd(66, '0') as `0x${string}`;
    } else {
      // Generic encoding for other coin types
      encodedAddress = address.padEnd(66, '0') as `0x${string}`;
    }

    console.log("node:", node);
    console.log("encodedAddress:", encodedAddress);

    // Encode the setAddr function call
    const data = encodeFunctionData({
      abi: resolverAbi,
      functionName: 'setAddr',
      args: [node, BigInt(coinType), encodedAddress]
    });

    return {
      to: resolverAddress,
      data
    };
  }
}
