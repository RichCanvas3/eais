import { ethers, formatEther, keccak256, toUtf8Bytes } from "ethers";
import { createPublicClient, http, namehash, encodeFunctionData, hexToString } from 'viem';
import { createBundlerClient } from 'viem/account-abstraction';
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { type Chain } from 'viem';
import { type MetaMaskSmartAccount } from "@metamask/delegation-toolkit";

// Sepolia testnet chain ID
const SEPOLIA_CHAIN_ID = 11155111;

// Validate that we're using Sepolia testnet
// All ENS operations in this service are designed to work exclusively on Sepolia testnet
function validateSepoliaChain(chain: Chain): void {
  if (chain.id !== SEPOLIA_CHAIN_ID) {
    throw new Error(`This operation only supports Sepolia testnet (chain ID: ${SEPOLIA_CHAIN_ID}). Current chain: ${chain.name} (ID: ${chain.id})`);
  }
}

import BaseRegistrarABI from  '../abis/BaseRegistrarImplementation.json'
import ETHRegistrarControllerABI from '../abis/ETHRegistrarController.json';
import NameWrapperABI from '../abis/NameWrapper.json';
import PublicResolverABI from '../abis/PublicResolver.json';

import { createEnsPublicClient } from '@ensdomains/ensjs';

  // Helper Functions
  function getTokenId(ensName: string) {
    const label = getLabel(ensName)
    const bytes = toUtf8Bytes(label)

    return keccak256(bytes)
  }

  function getLabel(ensName: string) {
    return ensName.split('.')[0]
  }

class ensService {

    static async createEnsDomainName(smartAccountClient: MetaMaskSmartAccount, ensName: string, chain: Chain) : Promise<string> {
        if (!smartAccountClient) {
            throw new Error('Smart account client is required');
        }
        if (!chain) {
            throw new Error('Chain information is required');
        }
        if (!ensName) {
            throw new Error('ENS name is required');
        }

        // Validate that we're using Sepolia testnet
        validateSepoliaChain(chain);

        const provider = new ethers.BrowserProvider((window as any).ethereum)
        const name = ensName

        // Clean the ENS name by removing invalid characters, spaces, and prefixes
        let cleanEnsName = ensName.replace(/^ENS:\s*/, '');
        // Remove .eth suffix if present
        cleanEnsName = cleanEnsName.replace(/\.eth$/i, '');
        // Remove any other non-alphanumeric characters except hyphens
        cleanEnsName = cleanEnsName.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
        const ensFullName = cleanEnsName + ".eth"


        // Use Sepolia for ENS operations
        console.log("...................... process this stuff .............: ", ensFullName)
        const ensClient = createEnsPublicClient({
              chain: chain as any, // Use the chain passed in by the user
              transport: http(process.env.NEXT_PUBLIC_RPC_URL),
            });


        // Get the address for the name
        console.log("...................... process this stuff .............: ", ensFullName)
        const ensAddress = await ensClient.getAddressRecord({
            name: ensFullName,
        });
        console.log("Current ENS address:", ensAddress);


        const ENS_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_ENS_REGISTRY as `0x${string}`) || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
        const ENSRegistryABI = ['function resolver(bytes32 node) view returns (address)'];


        const node = namehash(ensFullName);
        const registry = new ethers.Contract(ENS_REGISTRY_ADDRESS, ENSRegistryABI, provider);
        const resolverAddress = await registry.resolver(node);
        console.log(".................. Resolver address:", resolverAddress);


        const registryABI = ['function owner(bytes32 node) view returns (address)'];
        const registry2 = new ethers.Contract(ENS_REGISTRY_ADDRESS, registryABI, provider);
        const owner = await registry2.owner(node);
        console.log(".................. Owner:", owner);

        // Update the manageEnsRecords function
        const manageEnsRecords = async () => {
            console.log("Managing ENS records for:", ensFullName);

            try {
                // Create public client for reading current ENS records
                const publicClient = createPublicClient({
                    chain: chain,
                    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
                });

                // Create bundler client for setting ENS records
                const bundlerClient = createBundlerClient({
                    transport: http(process.env.NEXT_PUBLIC_BUNDLER_URL),
                    chain: chain
                });

                // Create Pimlico client for gas prices
                const pimlicoClient = createPimlicoClient({
                    transport: http(process.env.NEXT_PUBLIC_BUNDLER_URL),
                });

                // Get gas prices from Pimlico
                console.log('Getting gas prices from Pimlico...');
                const { fast: gasFee } = await pimlicoClient.getUserOperationGasPrice();
                console.log('Current gas prices:', gasFee);

                const fee = {
                    maxFeePerGas: gasFee.maxFeePerGas,
                    maxPriorityFeePerGas: gasFee.maxPriorityFeePerGas,
                    callGasLimit: 500000n,
                    preVerificationGas: 100000n,
                    verificationGasLimit: 500000n
                };

                const smartAccountAddress = await smartAccountClient.getAddress();
                console.log("Smart Account Address for ENS records:", smartAccountAddress);

                // Get resolver address first
                const ENS_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_ENS_REGISTRY as `0x${string}`) || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
                const node = namehash(ensFullName);


                const resolverAddress = await publicClient.readContract({
                    address: ENS_REGISTRY_ADDRESS as `0x${string}`,
                    abi: [{
                        name: 'resolver',
                        type: 'function',
                        stateMutability: 'view',
                        inputs: [{ name: 'node', type: 'bytes32' }],
                        outputs: [{ name: '', type: 'address' }]
                    }],
                    functionName: 'resolver',
                    args: [node]
                });

                console.log("Current resolver address:", resolverAddress);

                // If no resolver is set, skip record management
                if (!resolverAddress || resolverAddress === '0x0000000000000000000000000000000000000000') {
                    console.log("No resolver set, skipping record management");
                    return;
                }

                // Check current address record
                let currentAddress;
                try {
                    currentAddress = await publicClient.readContract({
                        address: resolverAddress as `0x${string}`,
                        abi: PublicResolverABI.abi,
                        functionName: 'addr',
                        args: [node]
                    });
                    console.log("Current address record:", currentAddress);
                } catch (error) {
                    console.log("Could not read current address record:", error);
                    currentAddress = '0x0000000000000000000000000000000000000000';
                }

                // Set address record if different
                if (currentAddress !== smartAccountAddress) {
                    console.log("Setting ENS address record...");
                    const setAddressData = encodeFunctionData({
                        abi: PublicResolverABI.abi,
                        functionName: 'setAddr',
                        args: [node, smartAccountAddress]
                    });

                    const addressUserOperationHash = await bundlerClient.sendUserOperation({
                        account: smartAccountClient,
                        calls: [{
                            to: resolverAddress as `0x${string}`,
                            data: setAddressData,
                            value: 0n
                        }],
                        ...fee
                    });

                    const { receipt: addressReceipt } = await bundlerClient.waitForUserOperationReceipt({
                        hash: addressUserOperationHash,
                    });
                    console.log("✅ ENS address record set successfully");
                } else {
                    console.log("✅ ENS address record already set correctly");
                }

                // Set reverse record
                const reverseNode = namehash(smartAccountAddress.slice(2).toLowerCase() + '.addr.reverse');
                console.log("Reverse node:", reverseNode);

                let currentReverseName;
                try {
                    currentReverseName = await publicClient.readContract({
                        address: resolverAddress as `0x${string}`,
                        abi: PublicResolverABI.abi,
                        functionName: 'name',
                        args: [reverseNode]
                    });
                    console.log("Current reverse name record:", currentReverseName);

                    const reverseRegistrar = await publicClient.readContract({
                        address: ENS_REGISTRY_ADDRESS as `0x${string}`,
                        abi: [{
                          name: "owner",
                          type: "function",
                          stateMutability: "view",
                          inputs: [{ name: "node", type: "bytes32" }],
                          outputs: [{ name: "", type: "address" }],
                        }],
                        functionName: "owner",
                        args: [reverseNode],
                      });
                    console.log("*********** Reverse registrar:", reverseRegistrar);

                } catch (error) {
                    console.log("Could not read current reverse name:", error);
                    currentReverseName = '';
                }

                if (currentReverseName !== ensFullName) {
                    console.log("Setting reverse name record...");
                    const setNameData = encodeFunctionData({
                        abi: PublicResolverABI.abi,
                        functionName: 'setName',
                        args: [reverseNode, ensFullName]
                    });

                    const reverseUserOperationHash = await bundlerClient.sendUserOperation({
                        account: smartAccountClient,
                        calls: [{
                            to: resolverAddress as `0x${string}`,
                            data: setNameData,
                            value: 0n
                        }],
                        ...fee
                    });

                    const { receipt: reverseReceipt } = await bundlerClient.waitForUserOperationReceipt({
                        hash: reverseUserOperationHash,
                    });
                    console.log("✅ Reverse name record set successfully");
                } else {
                    console.log("✅ Reverse name record already set correctly");
                }

                console.log(`🎉 ENS records check and update completed for ${ensFullName}`);
                console.log(`📍 Address: ${smartAccountAddress}`);
                console.log(`🔄 Reverse resolution: ${smartAccountAddress} → ${ensFullName}`);

            } catch (error) {
                console.error("Error managing ENS records:", error);
            }
        };

        if (resolverAddress != "0x0000000000000000000000000000000000000000") {
            // ENS domain exists - update records
            console.log("ENS domain exists, updating records...");

            const resolverABI = ['function addr(bytes32 node) view returns (address)'];
            const resolver = new ethers.Contract(resolverAddress, resolverABI, provider);
            const address = await resolver.addr(node);
            console.log(".................. Current Address:", address);

            try {
                const nameResolver = await provider.getResolver(ensFullName);
                console.log(".................. Name resolver:", nameResolver);
                let ethAddress = null;
                if (nameResolver) {
                    ethAddress = await nameResolver.getAddress();
                    console.log(".................. Eth address:", ethAddress);
                }
            }
            catch (error) {
                console.log(".................. Error resolving name:", error);
            }

            console.log("ENS address found:", ensAddress);

            const ensNameResolver = await provider.getResolver(ensFullName);
            if (!ensNameResolver) {
                console.log("No resolver found for", name);
                return ensFullName;
            }

            // Fetch the avatar text record
            const avatar = await ensNameResolver.getText("avatar");
            console.log("Avatar URI:", avatar);

            // Update existing ENS records
            await manageEnsRecords();
        }
        else {


            console.log("ENS address not found:", ensFullName);
            console.log("Starting registration process...");

            try {
                // Use the smart account to register the ENS name
                const ensName = `${cleanEnsName}.eth`;
                const node = namehash(ensName);
                const duration = 365 * 24 * 60 * 60; // 1 year in seconds
                const randomBytes = ethers.randomBytes(32);
                const secret = `0x${Buffer.from(randomBytes).toString('hex')}` as `0x${string}`;

                console.log("Registration parameters:", {
                    ensName,
                    node,
                    duration,
                    secret: secret.slice(0, 10) + "..." // Don't log full secret
                });

                const ETHRegistrarControllerAddress = '0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968';
                const PublicResolverAddress = '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD';

                const owner = await smartAccountClient.getAddress();
                console.log("Smart Account (Owner) Address:", owner);

                const registrationObject = {
                    label: cleanEnsName,
                    owner,
                    duration,
                    secret,
                    resolver: PublicResolverAddress,
                    data: [],
                    reverseRecord: true,
                    referrer: '0x0000000000000000000000000000000000000000000000000000000000000000'
                };

                console.log('Registration object:', {
                    ...registrationObject,
                    secret: registrationObject.secret.slice(0, 10) + "..."
                });

                // Create a public client for reading contract data
                const publicClient = createPublicClient({
                    chain: chain,
                    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
                });

                // Check if the domain is available first
                console.log('Checking domain availability...');
                const available = await publicClient.readContract({
                    address: ETHRegistrarControllerAddress as `0x${string}`,
                    abi: ETHRegistrarControllerABI.abi,
                    functionName: 'available',
                    args: [cleanEnsName]
                });

                if (!available) {
                    throw new Error(`Domain ${ensName} is not available for registration`);
                }
                console.log('Domain is available ✅');

                // Get current price
                const rentPriceCheck = await publicClient.readContract({
                    address: ETHRegistrarControllerAddress as `0x${string}`,
                    abi: ETHRegistrarControllerABI.abi,
                    functionName: 'rentPrice',
                    args: [cleanEnsName, duration]
                }) as { base: bigint; premium: bigint };

                console.log('Current registration costs:', {
                    base: formatEther(rentPriceCheck.base),
                    premium: formatEther(rentPriceCheck.premium),
                    total: formatEther(rentPriceCheck.base + rentPriceCheck.premium)
                });

                // Step 1: makeCommitment
                console.log('Making commitment...');
                const commitment = await publicClient.readContract({
                    address: ETHRegistrarControllerAddress as `0x${string}`,
                    abi: ETHRegistrarControllerABI.abi,
                    functionName: 'makeCommitment',
                    args: [registrationObject]
                });
                console.log('Commitment created:', commitment);

                // Step 2: commit
                const bundlerClient = createBundlerClient({
                    transport: http(process.env.NEXT_PUBLIC_BUNDLER_URL),
                    paymaster: true,
                    chain: chain,
                    paymasterContext: {
                        mode: 'SPONSORED',
                    },
                });

                // Get current gas prices from the public client
                const feeData = await publicClient.estimateFeesPerGas();
                console.log('Current fee data:', feeData);

                // Use dynamic gas prices with a buffer
                const gasConfig = {
                    maxFeePerGas: feeData.maxFeePerGas * 2n, // Double the estimated gas price to ensure acceptance
                    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas * 2n
                };
                console.log('Using gas config:', gasConfig);

                console.log('Sending commitment transaction...');
                const userOperationHash = await bundlerClient.sendUserOperation({
                    account: smartAccountClient,
                    calls: [{
                        to: ETHRegistrarControllerAddress as `0x${string}`,
                        data: encodeFunctionData({
                            abi: ETHRegistrarControllerABI.abi,
                            functionName: 'commit',
                            args: [commitment]
                        })
                    }],
                    ...gasConfig
                });

                console.log('Commitment transaction sent:', userOperationHash);
                const { receipt } = await bundlerClient.waitForUserOperationReceipt({
                    hash: userOperationHash,
                });
                console.log('Commitment transaction mined:', receipt);

                // Wait for commitment to be ready
                console.log('Waiting for commitment to be ready (90 seconds)...');
                await new Promise((r) => setTimeout(r, 90000));

                // Verify commitment is still valid
                console.log('Verifying commitment...');
                const commitmentStatus = await publicClient.readContract({
                    address: ETHRegistrarControllerAddress as `0x${string}`,
                    abi: ETHRegistrarControllerABI.abi,
                    functionName: 'commitments',
                    args: [commitment]
                });
                console.log('Commitment status:', commitmentStatus);

                if (!commitmentStatus) {
                    throw new Error('Commitment not found or expired');
                }

                // Step 3: register
                console.log('Preparing registration transaction...');
                const registerData = encodeFunctionData({
                    abi: ETHRegistrarControllerABI.abi,
                    functionName: 'register',
                    args: [registrationObject]
                });

                // Get final price right before registration
                const finalPrice = await publicClient.readContract({
                    address: ETHRegistrarControllerAddress as `0x${string}`,
                    abi: ETHRegistrarControllerABI.abi,
                    functionName: 'rentPrice',
                    args: [cleanEnsName, duration]
                }) as { base: bigint; premium: bigint };

                const totalPrice = finalPrice.base + finalPrice.premium;
                console.log('Final registration price:', formatEther(totalPrice), 'ETH');

                // Check account balance
                const balance = await publicClient.getBalance({
                    address: smartAccountClient.address as `0x${string}`
                });
                console.log('Account balance:', formatEther(balance), 'ETH');

                if (balance < totalPrice) {
                    throw new Error(`Insufficient balance. Need ${formatEther(totalPrice)} ETH but have ${formatEther(balance)} ETH`);
                }

                // Use the same gas config for registration
                const registerUserOpHash = await bundlerClient.sendUserOperation({
                    account: smartAccountClient,
                    calls: [{
                        to: ETHRegistrarControllerAddress as `0x${string}`,
                        data: registerData,
                        value: totalPrice
                    }],
                    ...gasConfig
                });

                console.log('Registration transaction sent:', registerUserOpHash);
                const { receipt: registerReceipt } = await bundlerClient.waitForUserOperationReceipt({
                    hash: registerUserOpHash,
                });
                console.log('Registration transaction mined:', registerReceipt);

                console.log(`✅ ENS name "${ensName}" registered successfully`);
                console.log(`🔗 View: https://sepolia.app.ens.domains/${ensName}`);

                // Set up ENS records
                console.log("Setting up ENS records...");
                await manageEnsRecords();

                return ensName;

            } catch (err) {
                const error = err instanceof Error ? err : new Error('Unknown error occurred');
                console.error('Error registering ENS name:', error);
                throw new Error(`Failed to register ENS name: ${error.message}`);
            }
        }

        return ensName;
    }

    static async wrapEnsDomainName(signer: ethers.JsonRpcSigner, smartAccountClient: MetaMaskSmartAccount, ensName: string, chain: Chain) : Promise<string> {
      console.log("Wrapping ENS domain name:", ensName);

      validateSepoliaChain(chain);


      // Sepolia contract addresses
      const baseRegistrar = new ethers.Contract(
        '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85',
        BaseRegistrarABI.abi,
        signer
      )

      const nameWrapper = new ethers.Contract(
        (process.env.NEXT_PUBLIC_ENS_IDENTITY_WRAPPER as `0x${string}`) || '0x0635513f179D50A207757E05759CbD106d7dFcE8',
        NameWrapperABI.abi,
        signer
      )

      const publicResolver = new ethers.Contract(
        '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5',
        PublicResolverABI.abi,
        signer
      )

      const label = getLabel(ensName)
      const tokenId = getTokenId(ensName)
      const node = namehash(ensName + '.eth')

      try {
        // Get all relevant addresses
        const signerAddress = await signer.getAddress();
        const smartAccountAddress = await smartAccountClient.getAddress();

        console.log('Label:', label)
        console.log('Token ID:', tokenId)
        console.log('Node:', node)
        console.log('Signer address:', signerAddress)
        console.log('Smart Account address:', smartAccountAddress)

        // Check ownership in BaseRegistrar
        let baseRegistrarOwner;
        try {
          console.log('Checking ownership in BaseRegistrar...: ', baseRegistrar.target);
          baseRegistrarOwner = await baseRegistrar.ownerOf(tokenId);
          console.log('BaseRegistrar owner:', baseRegistrarOwner);
        } catch (error) {
          throw new Error(`ENS name "${ensName}" does not exist or is not registered`);
        }

        // Check ownership in NameWrapper
        let isWrapped = false;
        try {
          const nameWrapperOwner = await nameWrapper.ownerOf(tokenId);
          console.log('NameWrapper owner:', nameWrapperOwner);
          isWrapped = true;

          if (nameWrapperOwner.toLowerCase() === smartAccountAddress.toLowerCase()) {
            console.log('Name is already wrapped and owned by the smart account');
            return ensName;
          } else {
            throw new Error(`ENS name is already wrapped and owned by ${nameWrapperOwner}`);
          }
        } catch (error) {
          console.log('Name is not wrapped yet, proceeding with wrapping');
        }

        // Check ownership matches
        const isOwnerSigner = baseRegistrarOwner.toLowerCase() === signerAddress.toLowerCase();
        const isOwnerSmartAccount = baseRegistrarOwner.toLowerCase() === smartAccountAddress.toLowerCase();

        if (!isOwnerSigner && !isOwnerSmartAccount) {
          throw new Error(
            `You are not the owner of this ENS name. ` +
            `Current owner: ${baseRegistrarOwner}. ` +
            `Your addresses - Signer: ${signerAddress}, Smart Account: ${smartAccountAddress}`
          );
        }

        // If smart account is owner, we need to use it to approve and wrap
        if (isOwnerSmartAccount) {
          console.log('Smart account owns the name, using it for wrapping...');

          // Create clients
          const bundlerClient = createBundlerClient({
            transport: http(process.env.NEXT_PUBLIC_BUNDLER_URL),
            chain: chain
          });

          const publicClient = createPublicClient({
            chain: chain,
            transport: http(process.env.NEXT_PUBLIC_RPC_URL),
          });

          // Get gas estimate
          const feeData = await publicClient.estimateFeesPerGas();
          console.log('Current fee data:', feeData);

          const gasConfig = {
            maxFeePerGas: feeData.maxFeePerGas * 2n,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas * 2n,
            callGasLimit: 500000n,
            preVerificationGas: 100000n,
            verificationGasLimit: 500000n
          };

          // Check and set approval if needed
          const isApproved = await baseRegistrar.isApprovedForAll(smartAccountAddress, nameWrapper.target);
          console.log('Current approval status for NameWrapper:', isApproved);

          if (!isApproved) {
            console.log('Setting approval from smart account...');

            // Check smart account balance before approval operation
            const approvalBalance = await publicClient.getBalance({
              address: smartAccountClient.address as `0x${string}`
            });
            console.log('Smart Account Balance (before approval):', approvalBalance.toString(), 'wei');
            console.log('Smart Account Balance (ETH):', (Number(approvalBalance) / 1e18).toFixed(6), 'ETH');

            // Estimate gas cost for approval operation
            const approvalGasCost = gasConfig.maxFeePerGas * gasConfig.callGasLimit;
            console.log('Estimated approval gas cost:', approvalGasCost.toString(), 'wei');
            console.log('Estimated approval gas cost (ETH):', (Number(approvalGasCost) / 1e18).toFixed(6), 'ETH');

            if (approvalBalance < approvalGasCost) {
              console.error('Insufficient funds for approval operation!');
              console.error('Required:', approvalGasCost.toString(), 'wei');
              console.error('Available:', approvalBalance.toString(), 'wei');
              throw new Error(`Smart account has insufficient funds for approval. Required: ${(Number(approvalGasCost) / 1e18).toFixed(6)} ETH, Available: ${(Number(approvalBalance) / 1e18).toFixed(6)} ETH`);
            }

            const approvalData = encodeFunctionData({
              abi: BaseRegistrarABI.abi,
              functionName: 'setApprovalForAll',
              args: [nameWrapper.target, true]
            });

            const approvalOpHash = await bundlerClient.sendUserOperation({
              account: smartAccountClient,
              calls: [{
                to: baseRegistrar.target as `0x${string}`,
                data: approvalData,
                value: 0n
              }],
              ...gasConfig
            });

            console.log('Waiting for approval transaction...');
            await bundlerClient.waitForUserOperationReceipt({
              hash: approvalOpHash,
            });

            // Verify approval with retry logic
            let approvalVerified = false;
            let retries = 0;
            const maxRetries = 5;

            while (!approvalVerified && retries < maxRetries) {
              if (retries > 0) {
                console.log(`Approval verification attempt ${retries + 1}/${maxRetries}`);
                await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds between retries
              }

              approvalVerified = await baseRegistrar.isApprovedForAll(smartAccountAddress, nameWrapper.target);
              console.log('Approval verification:', approvalVerified);
              retries++;
            }

            if (!approvalVerified) {
              throw new Error('Approval failed to set correctly after multiple verification attempts');
            }
            console.log('Approval set and verified successfully');

            // Wait a bit to ensure nonce is updated
            await new Promise(resolve => setTimeout(resolve, 5000));
          }

          // Wrap using smart account
          console.log('Wrapping name using smart account...');
          console.log('Wrap parameters:', {
            label,
            owner: smartAccountAddress,
            fuses: 0,
            resolver: publicResolver.target
          });

          const wrapData = encodeFunctionData({
            abi: NameWrapperABI.abi,
            functionName: 'wrapETH2LD',
            args: [label, smartAccountAddress, 0, publicResolver.target]
          });

          // Get current nonce
          const nonce = await publicClient.readContract({
            address: smartAccountClient.address as `0x${string}`,
            abi: [{
              inputs: [],
              name: 'getNonce',
              outputs: [{ type: 'uint256', name: '' }],
              stateMutability: 'view',
              type: 'function'
            }],
            functionName: 'getNonce'
          });

          console.log('Current nonce:', nonce);

          // Check smart account balance before operation
          const smartAccountBalance = await publicClient.getBalance({
            address: smartAccountClient.address as `0x${string}`
          });
          console.log('Smart Account Balance:', smartAccountBalance.toString(), 'wei');
          console.log('Smart Account Balance (ETH):', (Number(smartAccountBalance) / 1e18).toFixed(6), 'ETH');

          // Estimate gas cost for the operation
          const estimatedGasCost = gasConfig.maxFeePerGas * gasConfig.callGasLimit;
          console.log('Estimated gas cost:', estimatedGasCost.toString(), 'wei');
          console.log('Estimated gas cost (ETH):', (Number(estimatedGasCost) / 1e18).toFixed(6), 'ETH');

          if (smartAccountBalance < estimatedGasCost) {
            console.error('Insufficient funds in smart account!');
            console.error('Required:', estimatedGasCost.toString(), 'wei');
            console.error('Available:', smartAccountBalance.toString(), 'wei');
            throw new Error(`Smart account has insufficient funds. Required: ${(Number(estimatedGasCost) / 1e18).toFixed(6)} ETH, Available: ${(Number(smartAccountBalance) / 1e18).toFixed(6)} ETH`);
          }

          const wrapOpHash = await bundlerClient.sendUserOperation({
            account: smartAccountClient,
            calls: [{
              to: nameWrapper.target as `0x${string}`,
              data: wrapData,
              value: 0n
            }],
            ...gasConfig,
            nonce: nonce as bigint
          });

          console.log('Waiting for wrapping transaction...');
          await bundlerClient.waitForUserOperationReceipt({
            hash: wrapOpHash,
          });
          console.log('Wrapping transaction confirmed');

        } else {
          // Regular signer owns the name, use normal transaction flow
          console.log('Signer owns the name, using normal transaction flow...');

          // Check and set approval if needed
          const isApproved = await baseRegistrar.isApprovedForAll(signerAddress, nameWrapper.target);
          console.log('Current approval status for NameWrapper:', isApproved);

          if (!isApproved) {
            console.log('Setting approval...');
            const approveTx = await baseRegistrar.setApprovalForAll(nameWrapper.target, true);
            await approveTx.wait();

            // Verify approval with retry logic
            let approvalVerified = false;
            let retries = 0;
            const maxRetries = 5;

            while (!approvalVerified && retries < maxRetries) {
              if (retries > 0) {
                console.log(`Approval verification attempt ${retries + 1}/${maxRetries}`);
                await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds between retries
              }

              approvalVerified = await baseRegistrar.isApprovedForAll(signerAddress, nameWrapper.target);
              console.log('Approval verification:', approvalVerified);
              retries++;
            }

            if (!approvalVerified) {
              throw new Error('Approval failed to set correctly after multiple verification attempts');
            }
            console.log('Approval set and verified successfully');
          }

          // Wrap the name
          console.log('Wrapping name...');
          console.log('Wrap parameters:', {
            label,
            owner: smartAccountAddress,
            fuses: 0,
            resolver: publicResolver.target
          });

          const tx = await nameWrapper.wrapETH2LD(
            label,
            smartAccountAddress, // Transfer to smart account
            0, // No fuses burned
            publicResolver.target,
            { gasLimit: 500000 }
          );

          console.log('Wrapping transaction sent:', tx.hash);
          await tx.wait();
          console.log('Wrapping transaction confirmed');
        }

        // Wait a bit for the wrapping to be reflected
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Verify the wrapping in multiple ways
        console.log('Verifying wrapping...');

        // Check NameWrapper ownership
        let nameWrapperOwner;
        try {
          nameWrapperOwner = await nameWrapper.ownerOf(tokenId);
          console.log('NameWrapper owner after wrapping:', nameWrapperOwner);
        } catch (error) {
          console.error('Error checking NameWrapper ownership:', error);
          nameWrapperOwner = ethers.ZeroAddress;
        }

        // Check BaseRegistrar ownership
        let newBaseRegistrarOwner;
        try {
          newBaseRegistrarOwner = await baseRegistrar.ownerOf(tokenId);
          console.log('BaseRegistrar owner after wrapping:', newBaseRegistrarOwner);
        } catch (error) {
          console.error('Error checking BaseRegistrar ownership:', error);
          newBaseRegistrarOwner = ethers.ZeroAddress;
        }

        // Check if wrapping was successful
        // After wrapping, the BaseRegistrar should show the smart account as owner
        // The NameWrapper ownership might take a moment to be reflected
        if (nameWrapperOwner.toLowerCase() === smartAccountAddress.toLowerCase()) {
          console.log(`✅ ${ensName}.eth has been wrapped successfully!`);
          return ensName;
        } else if (newBaseRegistrarOwner.toLowerCase() === smartAccountAddress.toLowerCase()) {
          // BaseRegistrar shows correct ownership, wrapping was successful
          console.log(`✅ ${ensName}.eth has been wrapped successfully! BaseRegistrar ownership confirmed.`);
          return ensName;
        } else if (nameWrapperOwner === ethers.ZeroAddress && newBaseRegistrarOwner === nameWrapper.target) {
          console.log(`✅ ${ensName}.eth has been wrapped successfully (owned by NameWrapper contract)!`);
          return ensName;
        } else {
          throw new Error(
            `Wrapping verification failed:\n` +
            `Expected owner: ${smartAccountAddress}\n` +
            `NameWrapper owner: ${nameWrapperOwner}\n` +
            `BaseRegistrar owner: ${newBaseRegistrarOwner}\n` +
            `NameWrapper contract: ${nameWrapper.target}`
          );
        }
      } catch (error) {
        console.error('Error wrapping ENS name:', error);
        throw error;
      }
    }

    // Add a new function to check ENS name status
    static async checkEnsNameStatus(ensName: string, chain: Chain): Promise<{
      exists: boolean;
      baseRegistrarOwner?: string;
      ensRegistryOwner?: string;
      nameWrapperOwner?: string;
      isWrapped: boolean;
      registrationMethod?: string;
    }> {
      console.log("Checking ENS name status for:", ensName + ".eth");

      validateSepoliaChain(chain);

      const provider = new ethers.BrowserProvider((window as any).ethereum);

      const baseRegistrar = new ethers.Contract(
        '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85',
        BaseRegistrarABI.abi,
        provider
      );

      const nameWrapper = new ethers.Contract(
        (process.env.NEXT_PUBLIC_ENS_IDENTITY_WRAPPER as `0x${string}`) || '0x0635513f179D50A207757E05759CbD106d7dFcE8',
        NameWrapperABI.abi,
        provider
      );

                const ENS_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_ENS_REGISTRY as `0x${string}`) || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
      const ensRegistry = new ethers.Contract(
        ENS_REGISTRY_ADDRESS,
        ['function owner(bytes32 node) view returns (address)'],
        provider
      );

      console.log('................ Checking ENS name status for:', ensName);



      const parentLabel = ensName.split('.')[0];
      const parentTokenId = keccak256(toUtf8Bytes(parentLabel));
      const parentNode = namehash(ensName + '.eth');

      let result: {
        exists: boolean;
        isWrapped: boolean;
        registrationMethod: string;
        baseRegistrarOwner?: string;
        ensRegistryOwner?: string;
        nameWrapperOwner?: string;
      } = {
        exists: false,
        isWrapped: false,
        registrationMethod: 'none'
      };

      // Check BaseRegistrar
      try {
        const baseOwner = await baseRegistrar.ownerOf(parentTokenId);
        result.baseRegistrarOwner = baseOwner;
        result.exists = true;
        result.registrationMethod = 'baseRegistrar';
        console.log('✅ Found in BaseRegistrar, owner:', baseOwner);
      } catch (error) {
        console.log('❌ Not found in BaseRegistrar');
      }

      // Check ENS Registry first (following the test logic)
      try {
        const ensOwner = await ensRegistry.owner(parentNode);
        result.ensRegistryOwner = ensOwner;
        console.log('🔍 ENS Registry owner:', ensOwner);
        
        if (ensOwner && ensOwner !== '0x0000000000000000000000000000000000000000') {
          result.exists = true;
          
          // Check if the owner is NameWrapper (meaning it's wrapped)
          if (ensOwner.toLowerCase() === ((process.env.NEXT_PUBLIC_ENS_IDENTITY_WRAPPER as `0x${string}`) || '0x0635513f179D50A207757E05759CbD106d7dFcE8').toLowerCase()) {
            console.log('✅ Domain is wrapped, checking NameWrapper owner...');
            
            try {
              const wrapperOwner = await nameWrapper.ownerOf(parentNode);
              result.nameWrapperOwner = wrapperOwner;
              result.isWrapped = true;
              result.registrationMethod = 'nameWrapper';
              console.log('✅ Found in NameWrapper, owner:', wrapperOwner);
            } catch (error) {
              console.log('❌ Error getting NameWrapper owner:', error);
              // Still mark as wrapped but with no owner
              result.isWrapped = true;
              result.registrationMethod = 'nameWrapper';
            }
          } else {
            // Direct owner (not wrapped)
            result.registrationMethod = 'ensRegistry';
            console.log('✅ Found in ENS Registry, direct owner:', ensOwner);
          }
        } else {
          console.log('❌ Not found in ENS Registry');
        }
      } catch (error) {
        console.log('❌ Error checking ENS Registry:', error);
      }

      return result;
    }

    // Update the createSubdomain function
    static async createSubdomain(signer: ethers.JsonRpcSigner, smartAccountClient: MetaMaskSmartAccount, parentName: string, label: string, chain: Chain): Promise<string> {
      console.log("Creating subdomain:", label + "." + parentName + ".eth");

      validateSepoliaChain(chain);

      try {
        const smartAccountAddress = await smartAccountClient.getAddress();
        console.log('Smart Account address:', smartAccountAddress);

        // First, check the status of the parent name
        const nameStatus = await this.checkEnsNameStatus(parentName, chain);
        console.log('Parent name status:', nameStatus);

        if (!nameStatus.exists) {
          throw new Error(
            `Parent name "${parentName}.eth" does not exist. ` +
            `Please register it first using the ENS registration feature.`
          );
        }

        // Determine the owner based on registration method
        let parentOwner: string;
        let isWrapped = nameStatus.isWrapped;

        if (nameStatus.isWrapped && nameStatus.nameWrapperOwner && nameStatus.nameWrapperOwner !== '0x0000000000000000000000000000000000000000') {
          parentOwner = nameStatus.nameWrapperOwner;
          console.log('Using NameWrapper owner:', parentOwner);
        } else if (nameStatus.baseRegistrarOwner) {
          parentOwner = nameStatus.baseRegistrarOwner;
          console.log('Using BaseRegistrar owner:', parentOwner);
          // If it's wrapped but owned by zero address, the name is improperly wrapped
          if (nameStatus.isWrapped && nameStatus.nameWrapperOwner === '0x0000000000000000000000000000000000000000') {
            throw new Error(
              `Parent name "${parentName}.eth" is wrapped but has no owner (zero address). ` +
              `This indicates the name was not properly wrapped. Please wrap the name first using the "Wrap ENS Name" button.`
            );
          }
        } else if (nameStatus.ensRegistryOwner && nameStatus.ensRegistryOwner !== '0x0000000000000000000000000000000000000000') {
          parentOwner = nameStatus.ensRegistryOwner;
          console.log('Using ENS Registry owner:', parentOwner);
        } else {
          throw new Error(
            `Cannot determine owner of "${parentName}.eth". ` +
            `Registration status: ${JSON.stringify(nameStatus)}`
          );
        }

        if (parentOwner.toLowerCase() !== smartAccountAddress.toLowerCase()) {
          throw new Error(
            `You don't own the parent name "${parentName}.eth". ` +
            `Current owner: ${parentOwner}, Your address: ${smartAccountAddress}`
          );
        }

        // Set up contracts
        const nameWrapper = new ethers.Contract(
          (process.env.NEXT_PUBLIC_ENS_IDENTITY_WRAPPER as `0x${string}`) || '0x0635513f179D50A207757E05759CbD106d7dFcE8',
          NameWrapperABI.abi,
          signer
        );

        const publicResolver = new ethers.Contract(
          '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5',
          PublicResolverABI.abi,
          signer
        );

        const ENS_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_ENS_REGISTRY as `0x${string}`) || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
        const ensRegistry = new ethers.Contract(
          ENS_REGISTRY_ADDRESS,
          ['function owner(bytes32 node) view returns (address)', 'function setSubnodeRecord(bytes32 node, bytes32 label, address owner, address resolver, uint64 ttl) external'],
          signer
        );

        const parentNode = namehash(parentName + '.eth');
        const subnode = namehash(label + '.' + parentName + '.eth');
        const labelHash = keccak256(toUtf8Bytes(label));

        console.log('Parent node:', parentNode);
        console.log('Subnode:', subnode);
        console.log('Label hash:', labelHash);

        // Check if subdomain already exists
        try {
          let subdomainOwner;
          if (isWrapped) {
            subdomainOwner = await nameWrapper.ownerOf(subnode);
          } else {
            subdomainOwner = await ensRegistry.owner(subnode);
          }

          if (subdomainOwner !== '0x0000000000000000000000000000000000000000') {
            console.log('Subdomain already exists, owner:', subdomainOwner);
            throw new Error(`Subdomain "${label}.${parentName}.eth" already exists and is owned by ${subdomainOwner}`);
          }
        } catch (error) {
          console.log('Subdomain does not exist yet, proceeding with creation');
        }

        // Create bundler client and get gas prices
        const bundlerClient = createBundlerClient({
          transport: http(process.env.NEXT_PUBLIC_BUNDLER_URL),
          chain: chain
        });

        const pimlicoClient = createPimlicoClient({
          transport: http(process.env.NEXT_PUBLIC_BUNDLER_URL),
        });

        const { fast: gasFee } = await pimlicoClient.getUserOperationGasPrice();
        const gasConfig = {
          maxFeePerGas: gasFee.maxFeePerGas,
          maxPriorityFeePerGas: gasFee.maxPriorityFeePerGas,
          callGasLimit: 500000n,
          preVerificationGas: 100000n,
          verificationGasLimit: 500000n
        };

        // Get current nonce
        const publicClient = createPublicClient({
          chain: chain,
          transport: http(process.env.NEXT_PUBLIC_RPC_URL),
        });

        const nonce = await publicClient.readContract({
          address: smartAccountClient.address as `0x${string}`,
          abi: [{
            inputs: [],
            name: 'getNonce',
            outputs: [{ type: 'uint256', name: '' }],
            stateMutability: 'view',
            type: 'function'
          }],
          functionName: 'getNonce'
        });

        // Create subdomain
        if (isWrapped) {
          console.log('Creating subdomain via NameWrapper...');
          const subdomainData = encodeFunctionData({
            abi: NameWrapperABI.abi,
            functionName: 'setSubnodeRecord',
            args: [
              parentNode,
              label,
              smartAccountAddress,
              publicResolver.target as `0x${string}`,
              0,
              0,
              0
            ]
          });

          const subdomainOpHash = await bundlerClient.sendUserOperation({
            account: smartAccountClient,
            calls: [{
              to: nameWrapper.target as `0x${string}`,
              data: subdomainData,
              value: 0n
            }],
            ...gasConfig,
            nonce: nonce as bigint
          });

          await bundlerClient.waitForUserOperationReceipt({
            hash: subdomainOpHash,
          });
        } else {
          console.log('Creating subdomain via ENS Registry...');
          const subdomainData = encodeFunctionData({
            abi: [{
              name: 'setSubnodeRecord',
              type: 'function',
              stateMutability: 'nonpayable',
              inputs: [
                { name: 'node', type: 'bytes32' },
                { name: 'label', type: 'bytes32' },
                { name: 'owner', type: 'address' },
                { name: 'resolver', type: 'address' },
                { name: 'ttl', type: 'uint64' }
              ],
              outputs: []
            }],
            functionName: 'setSubnodeRecord',
            args: [parentNode, labelHash as `0x${string}`, smartAccountAddress as `0x${string}`, publicResolver.target as `0x${string}`, 0n]
          });

          const subdomainOpHash = await bundlerClient.sendUserOperation({
            account: smartAccountClient,
            calls: [{
              to: ENS_REGISTRY_ADDRESS as `0x${string}`,
              data: subdomainData,
              value: 0n
            }],
            ...gasConfig,
            nonce: nonce as bigint
          });

          await bundlerClient.waitForUserOperationReceipt({
            hash: subdomainOpHash,
          });
        }

        console.log('Subdomain creation transaction confirmed');

        // Wait and verify
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Verify subdomain creation
        let subdomainOwner;
        if (isWrapped) {
          subdomainOwner = await nameWrapper.ownerOf(subnode);
        } else {
          subdomainOwner = await ensRegistry.owner(subnode);
        }

        console.log('New subdomain owner:', subdomainOwner);

        if (subdomainOwner.toLowerCase() === smartAccountAddress.toLowerCase()) {
          console.log(`✅ Subdomain "${label}.${parentName}.eth" created successfully!`);
          return label + '.' + parentName + '.eth';
        } else {
          throw new Error(
            `Subdomain creation verification failed. ` +
            `Expected owner: ${smartAccountAddress}, ` +
            `Actual owner: ${subdomainOwner}`
          );
        }
      } catch (error) {
        console.error('Error creating subdomain:', error);
        throw error;
      }
    }


    /**
     * Create subdomain owned by ORG AA (using logic from org-subdomain-ownership-test.ts)
     * This method creates a subdomain where the parent domain is owned by the ENS owner AA,
     * but the subdomain itself is owned by the ORG AA
     */
    static async createSubdomainForOrg(
      signer: ethers.JsonRpcSigner, 
      ensOwnerClient: MetaMaskSmartAccount,
      orgAccountClient: MetaMaskSmartAccount,
      orgAccountAddress: `0x${string}`, 
      parentName: string, 
      label: string, 
      chain: Chain
    ): Promise<string> {
      console.log("Creating subdomain for ORG AA:", label + "." + parentName + ".eth");
      console.log("ORG AA address:", orgAccountAddress);
      console.log("subdomain name:", label + "." + parentName + ".eth");

      validateSepoliaChain(chain);

      // Validate that the label is a single label (no dots)
      if (label.includes('.')) {
        throw new Error(`Invalid subdomain label: "${label}". ENS subdomain labels cannot contain dots. Please use a single label like "finder" instead of "finder.airbnb.org".`);
      }

      // Validate that the label is not empty and contains only valid characters
      if (!label || label.length === 0) {
        throw new Error('Subdomain label cannot be empty');
      }

      // Validate label format (alphanumeric and hyphens only)
      if (!/^[a-zA-Z0-9-]+$/.test(label)) {
        throw new Error(`Invalid subdomain label: "${label}". Only alphanumeric characters and hyphens are allowed.`);
      }

            try {
        const ensOwnerAddress = await ensOwnerClient.getAddress();
        console.log('ENS Owner AA address:', ensOwnerAddress);

        // Create public client for reading contract data
        const publicClient = createPublicClient({
          chain: chain,
          transport: http(process.env.NEXT_PUBLIC_RPC_URL),
        });

        // Check if the parent domain is wrapped by checking if ENS Registry owner is NameWrapper
        const ENS_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_ENS_REGISTRY as `0x${string}`) || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
        const parentNode = namehash(parentName + '.eth');
        
        const parentOwner = await publicClient.readContract({
          address: ENS_REGISTRY_ADDRESS as `0x${string}`,
          abi: [{ name: 'owner', type: 'function', inputs: [{ name: 'node', type: 'bytes32' }], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' }],
          functionName: 'owner',
          args: [parentNode]
        }) as `0x${string}`;
        
        console.log(`🔗 Parent domain: ${parentName}.eth`);
        console.log(`🔗 Parent node: ${parentNode}`);
        console.log(`👤 Parent owner: ${parentOwner}`);
        
        if (parentOwner === '0x0000000000000000000000000000000000000000') {
          throw new Error(`Parent domain ${parentName}.eth does not exist or has no owner`);
        }
        
        // For wrapped ENS records, we need to get the actual owner from NameWrapper
        let actualOwner: string;
        if (parentOwner.toLowerCase() === ((process.env.NEXT_PUBLIC_ENS_IDENTITY_WRAPPER as `0x${string}`) || '0x0635513f179D50A207757E05759CbD106d7dFcE8').toLowerCase()) {
          console.log('✅ Parent domain is wrapped, getting NameWrapper owner...');
          
          try {
            const tokenId = BigInt(parentNode);
            actualOwner = await publicClient.readContract({
              address: ((process.env.NEXT_PUBLIC_ENS_IDENTITY_WRAPPER as `0x${string}`) || '0x0635513f179D50A207757E05759CbD106d7dFcE8') as `0x${string}`,
              abi: NameWrapperABI.abi,
              functionName: 'ownerOf',
              args: [tokenId]
            }) as `0x${string}`;
            
            console.log(`🎯 NameWrapper owner: ${actualOwner}`);
          } catch (error) {
            console.error('❌ Error getting NameWrapper owner:', error);
            throw new Error(`Failed to get NameWrapper owner: ${error instanceof Error ? error.message : String(error)}`);
          }
        } else {
          actualOwner = parentOwner;
          console.log(`🎯 Direct owner: ${actualOwner}`);
        }
        
        // Check if the ENS owner AA matches the actual owner
        if (actualOwner.toLowerCase() !== ensOwnerAddress.toLowerCase()) {
          console.log('❌ Error: ENS Owner AA does not match NameWrapper owner');
          console.log(`Expected: ${actualOwner}`);
          console.log(`Actual: ${ensOwnerAddress}`);
          throw new Error(`ENS Owner AA (${ensOwnerAddress}) is not the owner of the parent domain. Actual owner: ${actualOwner}. Please ensure the ENS owner AA is properly set as the owner of the parent domain.`);
        }

                 // Set up contracts
         const nameWrapper = new ethers.Contract(
           (process.env.NEXT_PUBLIC_ENS_IDENTITY_WRAPPER as `0x${string}`) || '0x0635513f179D50A207757E05759CbD106d7dFcE8',
           NameWrapperABI.abi,
           signer
         );

         const publicResolver = new ethers.Contract(
           '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD',
           PublicResolverABI.abi,
           signer
         );

         const subnode = namehash(label + '.' + parentName + '.eth');

         console.log('Parent node:', parentNode);
         console.log('Subnode:', subnode);

        // Check if subdomain already exists
        let subdomainExists = false;
        let existingSubdomainOwner = null;
        try {
          let subdomainOwner;
          // Since we know the parent is wrapped (we checked above), check NameWrapper
          subdomainOwner = await nameWrapper.ownerOf(subnode);

          if (subdomainOwner !== '0x0000000000000000000000000000000000000000') {
            console.log('Subdomain already exists, owner:', subdomainOwner);
            subdomainExists = true;
            existingSubdomainOwner = subdomainOwner;
            console.log(`ℹ️ Subdomain "${label}.${parentName}.eth" already exists, skipping creation but will attempt reverse record setup`);
          }
        } catch (error) {
          console.log('Subdomain does not exist yet, proceeding with creation');
        }

        // Create bundler client and get gas prices (with paymaster like the test)
        const bundlerClient = createBundlerClient({
          transport: http(process.env.NEXT_PUBLIC_BUNDLER_URL),
          paymaster: true,
          chain: chain,
          paymasterContext: {
            mode: 'SPONSORED',
          },
        });

        const pimlicoClient = createPimlicoClient({
          transport: http(process.env.NEXT_PUBLIC_BUNDLER_URL),
        });

        const { fast: gasFee } = await pimlicoClient.getUserOperationGasPrice();
        const gasConfig = {
          maxFeePerGas: gasFee.maxFeePerGas,
          maxPriorityFeePerGas: gasFee.maxPriorityFeePerGas,
          callGasLimit: 500000n,
          preVerificationGas: 100000n,
          verificationGasLimit: 500000n
        };

        let subdomainOpHash = null;
        let receipt = null;

        if (!subdomainExists) {
          // Create subdomain using NameWrapper's setSubnodeRecord
          // This creates the subdomain and sets the ORG AA as the owner
          console.log('Creating subdomain via NameWrapper...');
          const subdomainData = encodeFunctionData({
            abi: NameWrapperABI.abi,
            functionName: 'setSubnodeRecord',
            args: [
              parentNode, // parent node
              label, // label (string, not hash)
              orgAccountAddress, // owner (ORG AA address)
              publicResolver.target as `0x${string}`, // resolver
              0n, // TTL (0 = no expiration) - uint64
              0, // fuses (0 = no restrictions) - uint32
              0n // expiry (0 = no expiration) - uint64
            ]
          });

          console.log('Create subdomain call details:', {
            to: nameWrapper.target,
            data: subdomainData,
            parentNode,
            label: label,
            owner: orgAccountAddress,
            resolver: publicResolver.target,
            ttl: 0n,
            fuses: 0,
            expiry: 0n
          });

          subdomainOpHash = await bundlerClient.sendUserOperation({
            account: ensOwnerClient,
            calls: [{
              to: nameWrapper.target as `0x${string}`,
              data: subdomainData,
              value: 0n
            }],
            ...gasConfig
          });

          console.log('Subdomain creation transaction sent:', subdomainOpHash);

          // Wait for confirmation
          receipt = await bundlerClient.waitForUserOperationReceipt({
            hash: subdomainOpHash,
          });

          console.log('Subdomain created successfully:', receipt);

          // Wait and verify
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          console.log('Skipping subdomain creation - already exists');
        }

        // Verify subdomain ownership
        let subdomainOwner;
        // Since we know the parent is wrapped, check NameWrapper
        subdomainOwner = await nameWrapper.ownerOf(subnode);

        console.log('Subdomain owner:', subdomainOwner);

        if (subdomainExists) {
          console.log(`ℹ️ Subdomain "${label}.${parentName}.eth" already exists and is owned by ${subdomainOwner}`);
        } else {
          console.log(`✅ Subdomain "${label}.${parentName}.eth" created successfully and owned by ${subdomainOwner}!`);
        }

        // Proceed with reverse record setup regardless of whether subdomain was created or already existed
        if (subdomainOwner.toLowerCase() === orgAccountAddress.toLowerCase()) {
          console.log(`✅ Subdomain ownership verified - proceeding with reverse record setup`);
          
          // Set reverse address record for the subdomain
          // Note: This needs to be done by the agent's account abstraction, not the ENS owner
          // because the agent owns the address that needs the reverse record
          try {
            console.log("Setting reverse address record for subdomain...");
            const ensFullName = label + '.' + parentName + '.eth';
            
            // Set reverse record
            const reverseNode = namehash(orgAccountAddress.slice(2).toLowerCase() + '.addr.reverse');
            console.log("Reverse node:", reverseNode);

            let currentReverseName;
            let reverseRegistrar;
            try {

                const ourReverseRegistrar = await publicClient.readContract({
                    address: ENS_REGISTRY_ADDRESS as `0x${string}`,
                    abi: [{
                      name: "owner",
                      type: "function",
                      stateMutability: "view",  
                      inputs: [{ name: "node", type: "bytes32" }],
                      outputs: [{ name: "", type: "address" }],
                    }],
                    functionName: "owner",
                    args: [reverseNode],
                  });
                console.log("*********** Reverse registrar for our reverse node:", ourReverseRegistrar);
                

                const resolverAbi = [
                    // reverse: get primary name
                    { name: "name", stateMutability: "view", type: "function",
                      inputs: [{ name: "node", type: "bytes32" }], outputs: [{ type: "string" }] },
                    // forward: get ETH addr (overload 1)
                    { name: "addr", stateMutability: "view", type: "function",
                      inputs: [{ name: "node", type: "bytes32" }], outputs: [{ type: "address" }] },
                    // forward: multi-coin (overload 2)
                    { name: "addr", stateMutability: "view", type: "function",
                      inputs: [{ name: "node", type: "bytes32" }, { name: "coinType", type: "uint256" }],
                      outputs: [{ type: "bytes" }] },
                  ];
                  currentReverseName = await publicClient.readContract({
                    address: ourReverseRegistrar, abi: resolverAbi, functionName: "name", args: [reverseNode],
                  });
                  console.log("*********** Current reverse name:", currentReverseName);


                const BASE_REVERSE_NODE = namehash("addr.reverse");
                reverseRegistrar = await publicClient.readContract({
                    address: ENS_REGISTRY_ADDRESS as `0x${string}`,
                    abi: [{
                      name: "owner",
                      type: "function",
                      stateMutability: "view",
                      inputs: [{ name: "node", type: "bytes32" }],
                      outputs: [{ name: "", type: "address" }],
                    }],
                    functionName: "owner",
                    args: [BASE_REVERSE_NODE],
                  });
                console.log("*********** Reverse registrar:", reverseRegistrar);
            } catch (error) {
                console.log("Could not read current reverse name:", error);
                reverseRegistrar = '';
            }

            console.log("Current reverse name:", currentReverseName);
            if (currentReverseName !== ensFullName) {
                console.log("Setting reverse name record using agent's account abstraction...");

                /*
                const setNameData = encodeFunctionData({
                    abi: PublicResolverABI.abi,
                    functionName: 'setName',
                    args: [reverseNode, ensFullName]
                });
                */

                const setNameData = encodeFunctionData({
                    abi: [{
                      name: "setName",
                      type: "function",
                      stateMutability: "nonpayable",
                      inputs: [{ name: "name", type: "string" }],
                      outputs: [{ name: "node", type: "bytes32" }],
                    }],
                    functionName: "setName",
                    args: [ensFullName], // e.g. "finder-airbnb-com.orgtrust.eth"
                  });


                // Now set the reverse record using the agent's AA

/*
                const resolverAddress = await publicClient.readContract({
                    address: ENS_REGISTRY_ADDRESS as `0x${string}`,
                    abi: [{
                        name: 'resolver',
                        type: 'function',
                        stateMutability: 'view',
                        inputs: [{ name: 'node', type: 'bytes32' }],
                        outputs: [{ name: '', type: 'address' }]
                    }],
                    functionName: 'resolver',
                    args: [subnode]
                });
                */

                console.log("Setting reverse name record using agent's AA...");
                console.log("reverseRegistrar:", reverseRegistrar);
                const reverseUserOperationHash = await bundlerClient.sendUserOperation({
                    account: orgAccountClient,
                    calls: [{
                        to: reverseRegistrar as `0x${string}`,
                        data: setNameData,
                        value: 0n
                    }],
                    ...gasConfig
                });

                const { receipt: reverseReceipt } = await bundlerClient.waitForUserOperationReceipt({
                    hash: reverseUserOperationHash,
                });
                console.log("✅ Reverse name record set successfully");
            } else {
                console.log("✅ Reverse name record already set correctly");
            }
          } catch (reverseError) {
            console.error("⚠️ Warning: Failed to set reverse address record:", reverseError);
            // Don't throw here - subdomain creation was successful, reverse record is optional
          }
          
          return label + '.' + parentName + '.eth';
        } else {
          throw new Error(
            `Subdomain creation verification failed. ` +
            `Expected owner: ${orgAccountAddress}, ` +
            `Actual owner: ${subdomainOwner}`
          );
        }
      } catch (error) {
        console.error('Error creating subdomain for ORG AA:', error);
        throw error;
      }
    }

    /**
     * Get ENS name for an address (reverse resolution)
     */
    static async getEnsName(address: string, chain: Chain): Promise<string | null> {
        try {
            const ensClient = createEnsPublicClient({
                chain: chain as any,
                transport: http(process.env.NEXT_PUBLIC_RPC_URL),
            });

            const name = await ensClient.getName({
                address: address as `0x${string}`,
            });

            return name?.name || null;
        } catch (error) {
            console.error("Error getting ENS name:", error);
            return null;
        }
    }

    static async forwardFromEnsName(name: string, chain: Chain, ensOwnerAA: any, agentAA: any, subdomainName: string): Promise<string | null> {
        try {
            console.log("inside Forwarding from ENS Name ...");
            console.log("subdomainName:", subdomainName);
            console.log("chain:", chain);
            console.log("ensOwnerAA:", ensOwnerAA);
            console.log("agentAA:", agentAA);
            const ensFullName = subdomainName + ".orgtrust.eth";

            const node = namehash(ensFullName);

            const publicClient = createPublicClient({
                chain: chain,
                transport: http(process.env.NEXT_PUBLIC_RPC_URL),
            });

            const ENS_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_ENS_REGISTRY as `0x${string}`) || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';


            // 1a) Get current resolver for the name
            const resolver = await publicClient.readContract({
            address: ENS_REGISTRY_ADDRESS,
            abi: [{ name: "resolver", stateMutability: "view", type: "function",
                    inputs: [{ name: "node", type: "bytes32"}], outputs: [{ type: "address"}]}],
            functionName: "resolver",
            args: [node],
            });
            console.log("........... resolver:", resolver);


            const owner = await publicClient.readContract({
                address: ENS_REGISTRY_ADDRESS,
                abi: [{ name: "owner", stateMutability: "view", type: "function",
                        inputs: [{ name: "node", type: "bytes32"}], outputs: [{ type: "address"}]}],
                functionName: "owner",
                args: [node],
                });
                console.log("........... owner:", owner);



            console.log("........... agent address:", agentAA.address);

            const tokenId = BigInt(node);
            const actualOwner = await publicClient.readContract({
                address: ((process.env.NEXT_PUBLIC_ENS_IDENTITY_WRAPPER as `0x${string}`) || '0x0635513f179D50A207757E05759CbD106d7dFcE8') as `0x${string}`,
                abi: NameWrapperABI.abi,
                functionName: 'ownerOf',
                args: [tokenId]
              }) as `0x${string}`;
            console.log("........... actual owner:", actualOwner);

            // (If resolver == 0x0, set one first: either via ENS Registry `setResolver` if you’re the name owner,
            // or NameWrapper.setResolver if the name is wrapped.)

            // 1b) Set the addr record on the resolver
            const setAddrData = encodeFunctionData({
            abi: [{ name: "setAddr", type: "function", stateMutability: "nonpayable",
                    inputs: [{ name: "node", type: "bytes32" }, { name: "a", type: "address" }]}],
            functionName: "setAddr",
            args: [node, agentAA.address],
            });

            const bundlerClient = createBundlerClient({
                transport: http(process.env.NEXT_PUBLIC_BUNDLER_URL),
                paymaster: true,
                chain: chain,
                paymasterContext: {
                    mode: 'SPONSORED',
                },
            });

            
            const fee = {maxFeePerGas: 412596685n, maxPriorityFeePerGas: 412596676n};

            console.info("sending user operation to set addr record");
            const avatarUserOperationHash = await bundlerClient.sendUserOperation({
                account: agentAA,
                calls: [{ to: resolver as `0x${string}`, data: setAddrData }],
                ...fee,
            });

            console.info("get address record receipt");
            const { receipt: avatarReceipt } = await bundlerClient.waitForUserOperationReceipt({
                hash: avatarUserOperationHash,
            });
            console.info("get address record");

            const ensClient = createEnsPublicClient({
                chain: chain as any,
                transport: http(process.env.NEXT_PUBLIC_RPC_URL),
            });

            const fullEnsName = name + ".orgtrust.eth";
            const address = await ensClient.getAddressRecord({
                name: fullEnsName
            });

            return address?.value || null;
        } catch (error) {
            console.error("Error getting ENS address:", error);
            return null;
        }
    }

    static async reverseFromEnsAddress(name: string, chain: Chain, ensOwnerAA: any, agentAA: any, subdomainName: string): Promise<string | null> {
        try {
            console.log("inside reverse from ENS address...");
            console.log("name:", subdomainName);
            console.log("chain:", chain);
            console.log("ensOwnerAA:", ensOwnerAA);
            console.log("agentAA:", agentAA);
            const ensFullName = subdomainName + ".orgtrust.eth";


            // Set reverse record
            const reverseNode = namehash(agentAA.address.slice(2).toLowerCase() + '.addr.reverse');
            console.log("Reverse node:", reverseNode);

            let currentReverseName;
            try {

                const publicClient = createPublicClient({
                    chain: chain,
                    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
                });


                const BASE_REVERSE_NODE = namehash("addr.reverse");
                const ENS_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_ENS_REGISTRY as `0x${string}`) || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
                const reverseRegistrar = await publicClient.readContract({
                    address: ENS_REGISTRY_ADDRESS as `0x${string}`,
                    abi: [{
                      name: "owner",
                      type: "function",
                      stateMutability: "view",
                      inputs: [{ name: "node", type: "bytes32" }],
                      outputs: [{ name: "", type: "address" }],
                    }],
                    functionName: "owner",
                    args: [BASE_REVERSE_NODE],
                  });
                console.log("*********** Reverse registrar:", reverseRegistrar);


                const ourReverseRegistrar = await publicClient.readContract({
                    address: ENS_REGISTRY_ADDRESS as `0x${string}`,
                    abi: [{
                      name: "owner",
                      type: "function",
                      stateMutability: "view",  
                      inputs: [{ name: "node", type: "bytes32" }],
                      outputs: [{ name: "", type: "address" }],
                    }],
                    functionName: "owner",
                    args: [reverseNode],
                  });
                console.log("*********** Reverse registrar for our reverse node:", ourReverseRegistrar);


                const setNameData = encodeFunctionData({
                    abi: [{
                      name: "setName",
                      type: "function",
                      stateMutability: "nonpayable",
                      inputs: [{ name: "name", type: "string" }],
                      outputs: [{ name: "node", type: "bytes32" }],
                    }],
                    functionName: "setName",
                    args: [ensFullName], // e.g. "finder-airbnb-com.orgtrust.eth"
                  });


                  const bundlerClient = createBundlerClient({
                    transport: http(process.env.NEXT_PUBLIC_BUNDLER_URL),
                    paymaster: true,
                    chain: chain,
                    paymasterContext: {
                        mode: 'SPONSORED',
                    },
                });
    

                console.log("Setting reverse name record using agent's AA...");
                console.log("reverseRegistrar:", reverseRegistrar);

                const fee = {maxFeePerGas: 412596685n, maxPriorityFeePerGas: 412596676n};
                const reverseUserOperationHash = await bundlerClient.sendUserOperation({
                    account: agentAA,
                    calls: [{
                        to: reverseRegistrar as `0x${string}`,
                        data: setNameData,
                        value: 0n
                    }],
                    ...fee
                });

                const { receipt: reverseReceipt } = await bundlerClient.waitForUserOperationReceipt({
                    hash: reverseUserOperationHash,
                });
                console.log("*********** Reverse name record set successfully xxxxxx");


                const ensClient = createEnsPublicClient({
                    chain: chain as any,
                    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
                });
    
                const name = await ensClient.getName({
                    address: agentAA.address as `0x${string}`,
                });

                console.log("*********** done reverse from ens address:  ", name);

                return name?.name || null;

            } catch (error) {
                console.log("Could not read current reverse name:", error);
                currentReverseName = '';
            }





























            const node = namehash(ensFullName);

            const publicClient = createPublicClient({
                chain: chain,
                transport: http(process.env.NEXT_PUBLIC_RPC_URL),
            });

            const ENS_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_ENS_REGISTRY as `0x${string}`) || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';


            // 1a) Get current resolver for the name
            const resolver = await publicClient.readContract({
            address: ENS_REGISTRY_ADDRESS,
            abi: [{ name: "resolver", stateMutability: "view", type: "function",
                    inputs: [{ name: "node", type: "bytes32"}], outputs: [{ type: "address"}]}],
            functionName: "resolver",
            args: [node],
            });
            console.log("........... resolver:", resolver);


            const owner = await publicClient.readContract({
                address: ENS_REGISTRY_ADDRESS,
                abi: [{ name: "owner", stateMutability: "view", type: "function",
                        inputs: [{ name: "node", type: "bytes32"}], outputs: [{ type: "address"}]}],
                functionName: "owner",
                args: [node],
                });
                console.log("........... owner:", owner);


            console.log("........... agent address:", agentAA.address);

            const tokenId = BigInt(node);
            const actualOwner = await publicClient.readContract({
                address: ((process.env.NEXT_PUBLIC_ENS_IDENTITY_WRAPPER as `0x${string}`) || '0x0635513f179D50A207757E05759CbD106d7dFcE8') as `0x${string}`,
                abi: NameWrapperABI.abi,
                functionName: 'ownerOf',
                args: [tokenId]
              }) as `0x${string}`;
            console.log("........... actual owner:", actualOwner);

            // (If resolver == 0x0, set one first: either via ENS Registry `setResolver` if you’re the name owner,
            // or NameWrapper.setResolver if the name is wrapped.)

            // 1b) Set the addr record on the resolver
            const setAddrData = encodeFunctionData({
            abi: [{ name: "setAddr", type: "function", stateMutability: "nonpayable",
                    inputs: [{ name: "node", type: "bytes32" }, { name: "a", type: "address" }]}],
            functionName: "setAddr",
            args: [node, agentAA.address],
            });

            const bundlerClient = createBundlerClient({
                transport: http(process.env.NEXT_PUBLIC_BUNDLER_URL),
                paymaster: true,
                chain: chain,
                paymasterContext: {
                    mode: 'SPONSORED',
                },
            });

            
            const fee = {maxFeePerGas: 412596685n, maxPriorityFeePerGas: 412596676n};

            console.info("sending user operation to set addr record");
            const avatarUserOperationHash = await bundlerClient.sendUserOperation({
                account: agentAA,
                calls: [{ to: resolver as `0x${string}`, data: setAddrData }],
                ...fee,
            });

            console.info("get address record receipt");
            const { receipt: avatarReceipt } = await bundlerClient.waitForUserOperationReceipt({
                hash: avatarUserOperationHash,
            });
            console.info("get address record");

            const ensClient = createEnsPublicClient({
                chain: chain as any,
                transport: http(process.env.NEXT_PUBLIC_RPC_URL),
            });

            const fullEnsName = name + ".orgtrust.eth";
            const address = await ensClient.getAddressRecord({
                name: fullEnsName
            });

            return address?.value || null;
        } catch (error) {
            console.error("Error getting ENS address:", error);
            return null;
        }
    }

    static async getEnsAddress(name: string, chain: Chain): Promise<string | null> {
        try {
            const ensClient = createEnsPublicClient({
                chain: chain as any,
                transport: http(process.env.NEXT_PUBLIC_RPC_URL),
            });

            const address = await ensClient.getAddressRecord({
                name: name
            });

            return address?.value || null;
        } catch (error) {
            console.error("Error getting ENS address:", error);
            return null;
        }
    }
    /**
     * Get ENS name and basic data for an address
     */
    static async getEnsData(address: string, chain: Chain): Promise<{ name: string | null; avatar: string | null }> {
        try {
            const ensClient = createEnsPublicClient({
                chain: chain as any,
                transport: http(process.env.NEXT_PUBLIC_RPC_URL),
            });

            const name = await ensClient.getName({
                address: address as `0x${string}`,
            });

            return {
                name: name?.name || null,
                avatar: null // Avatar will be handled separately if needed - updated
            };
        } catch (error) {
            console.error("Error getting ENS data:", error);
            return { name: null, avatar: null };
        }
    }

    /**
     * Get comprehensive ENS data including text records
     */
    static async getEnsComprehensiveData(address: string, chain: Chain): Promise<{
        name: string | null;
        avatar: string | null;
        website: string | null;
        email: string | null;
        twitter: string | null;
        github: string | null;
        discord: string | null;
    }> {
        try {
            const ensData = await this.getEnsData(address, chain);

            if (!ensData.name) {
                return {
                    name: null,
                    avatar: null,
                    website: null,
                    email: null,
                    twitter: null,
                    github: null,
                    discord: null
                };
            }

            // Fetch the avatar using the ENS name
            let avatar = null;
            console.log("About to fetch avatar for ENS name:", ensData.name, "on chain:", chain.name);
            try {
                avatar = await this.getEnsAvatar(ensData.name, chain);
                console.log("Fetched avatar for ENS name:", ensData.name, "Avatar:", avatar);
            } catch (avatarError) {
                console.error("Error fetching avatar for ENS name:", ensData.name, avatarError);
                console.error("Avatar error details:", avatarError);
            }

            // For now, return basic data with avatar
            // Text records can be added later when we have the correct ENS client methods
            return {
                name: ensData.name,
                avatar: avatar,
                website: null,
                email: null,
                twitter: null,
                github: null,
                discord: null
            };
        } catch (error) {
            console.error("Error getting comprehensive ENS data:", error);
            return {
                name: null,
                avatar: null,
                website: null,
                email: null,
                twitter: null,
                github: null,
                discord: null
            };
        }
    }

    /**
     * Get ENS avatar URL for a specific ENS name
     */
    static async getEnsAvatar(ensName: string, chain: Chain): Promise<string | null> {
        try {
            console.log("getEnsAvatar called with:", { ensName, chainName: chain.name });

            // Clean the ENS name
            let cleanEnsName = ensName.replace(/^ENS:\s*/, '');
            cleanEnsName = cleanEnsName.replace(/\.eth$/i, '');
            cleanEnsName = cleanEnsName.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
            const ensFullName = cleanEnsName + ".eth";

            console.log("ENS name cleaning:", { original: ensName, cleaned: cleanEnsName, fullName: ensFullName });

            // Validate the cleaned name
            if (!cleanEnsName || cleanEnsName.length < 3) {
                console.error("Invalid ENS name after cleaning:", { original: ensName, cleaned: cleanEnsName });
                return null;
            }

            // Create public client for reading ENS records
            const publicClient = createPublicClient({
                chain: chain,
                transport: http(process.env.NEXT_PUBLIC_RPC_URL),
            });

            const ENS_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_ENS_REGISTRY as `0x${string}`) || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
            const node = namehash(ensFullName);

            // Get resolver address
            const resolverAddress = await publicClient.readContract({
                address: ENS_REGISTRY_ADDRESS as `0x${string}`,
                abi: [{
                    name: 'resolver',
                    type: 'function',
                    stateMutability: 'view',
                    inputs: [{ name: 'node', type: 'bytes32' }],
                    outputs: [{ name: '', type: 'address' }]
                }],
                functionName: 'resolver',
                args: [node]
            });

            if (!resolverAddress || resolverAddress === '0x0000000000000000000000000000000000000000') {
                console.log("No resolver found for ENS name:", ensFullName);
                console.log("Resolver address returned:", resolverAddress);
                return null;
            }

            console.log("Resolver address found:", resolverAddress);

            // Get avatar text record
            console.log("Fetching avatar text record for node:", node);
            const avatar = await publicClient.readContract({
                address: resolverAddress as `0x${string}`,
                abi: PublicResolverABI.abi,
                functionName: 'text',
                args: [node, 'avatar']
            });

            console.log("Avatar text record result:", avatar);
            console.log("Avatar type:", typeof avatar);
            const result = typeof avatar === 'string' ? avatar : null;
            console.log("Returning avatar:", result);
            return result;
        } catch (error) {
            console.error("Error getting ENS avatar:", error);
            return null;
        }
    }

    /**
     * Find the correct ENS name for an organization
     */
    static async findCorrectEnsName(smartAccountClient: MetaMaskSmartAccount, chain: Chain): Promise<string | null> {
        try {
            const orgAddress = await smartAccountClient.getAddress();
            console.log("Looking for ENS name for address:", orgAddress);

            // Try to get the reverse resolution
            const ensName = await this.getEnsName(orgAddress, chain);

            if (ensName) {
                console.log("Found ENS name via reverse resolution:", ensName);
                return ensName;
            }

            console.log("No ENS name found via reverse resolution");
            return null;
        } catch (error) {
            console.error("Error finding ENS name:", error);
            return null;
        }
    }

    /**
     * Update ENS avatar (logo) for an existing ENS name
     */
    static async updateEnsAvatar(smartAccountClient: MetaMaskSmartAccount, ensName: string, avatarUrl: string, chain: Chain): Promise<boolean> {
        try {

            let cleanEnsName = ensName.replace(/^ENS:\s*/, '');
            cleanEnsName = cleanEnsName.replace(/\.eth$/i, '');
            cleanEnsName = cleanEnsName.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();

            const ensFullName = cleanEnsName + ".eth";


            // Create public client for reading current ENS records
            const publicClient = createPublicClient({
                chain: chain,
                transport: http(process.env.NEXT_PUBLIC_RPC_URL),
            });

            // Create bundler client for setting ENS records
            const ensBundlerClient = createBundlerClient({
                transport: http(process.env.NEXT_PUBLIC_BUNDLER_URL),
                paymaster: true,
                chain: chain,
                paymasterContext: {
                    mode: 'SPONSORED',
                },
            });

            // Use fixed gas fees like in your codebase
            const fee = {maxFeePerGas: 412596685n, maxPriorityFeePerGas: 412596676n};

            const ENS_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_ENS_REGISTRY as `0x${string}`) || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
            const node = namehash(ensFullName);

            // First check if the ENS name exists by getting its owner
            const owner = await publicClient.readContract({
                address: ENS_REGISTRY_ADDRESS as `0x${string}`,
                abi: [{
                    name: 'owner',
                    type: 'function',
                    stateMutability: 'view',
                    inputs: [{ name: 'node', type: 'bytes32' }],
                    outputs: [{ name: '', type: 'address' }]
                }],
                functionName: 'owner',
                args: [node]
            });

            if (!owner || owner === '0x0000000000000000000000000000000000000000') {
                console.error("ENS name does not exist:", ensFullName);
                console.error("Current network:", chain.name);
                console.error("Possible solutions:");
                console.error("1. Check if the ENS name is correct");
                console.error("2. The ENS name might not exist on Sepolia testnet");
                console.error("3. The ENS name might not be registered yet");

                // Try to suggest alternative names
                const suggestions = [
                    cleanEnsName.replace('eth', ''),
                    cleanEnsName.replace('canvas', ''),
                    cleanEnsName.replace('rich', ''),
                    'aarichcanvas',
                    'richcanvas'
                ];
                console.error("Suggested ENS names to try:", suggestions);

                return false;
            }

            console.log("ENS owner:", owner);

            // Check if the smart account is the owner
            const smartAccountAddress = await smartAccountClient.getAddress();
            if (owner.toLowerCase() !== smartAccountAddress.toLowerCase()) {
                console.error("Smart account is not the owner of the ENS name");
                console.error("Smart account address:", smartAccountAddress);
                console.error("ENS owner:", owner);
                console.error("You can only update ENS records if you own the ENS name");
                return false;
            }

            // Get resolver address
            const resolverAddress = await publicClient.readContract({
                address: ENS_REGISTRY_ADDRESS as `0x${string}`,
                abi: [{
                    name: 'resolver',
                    type: 'function',
                    stateMutability: 'view',
                    inputs: [{ name: 'node', type: 'bytes32' }],
                    outputs: [{ name: '', type: 'address' }]
                }],
                functionName: 'resolver',
                args: [node]
            });

            if (!resolverAddress || resolverAddress === '0x0000000000000000000000000000000000000000') {
                console.error("No resolver found for ENS name:", ensFullName);
                console.error("This could mean:");
                console.error("1. The ENS name doesn't exist");
                console.error("2. The ENS name is on a different network");
                console.error("3. The ENS name doesn't have a resolver set");
                console.error("Current network:", chain.name);
                return false;
            }

            console.log("Resolver address:", resolverAddress);

            // Check current avatar to see if it's already set
            try {
                const currentAvatar = await publicClient.readContract({
                    address: resolverAddress as `0x${string}`,
                    abi: PublicResolverABI.abi,
                    functionName: 'text',
                    args: [node, 'avatar']
                });
                console.log("Current avatar:", currentAvatar);

                if (currentAvatar === avatarUrl) {
                    console.log("Avatar is already set to the same value");
                    return true;
                }
            } catch (error) {
                console.log("Could not read current avatar, proceeding with update");
            }

            // Set avatar text record
            const setAvatarData = encodeFunctionData({
                abi: PublicResolverABI.abi,
                functionName: 'setText',
                args: [node, 'avatar', avatarUrl]
            });

            console.log("Setting avatar with data:", setAvatarData);
            console.log("Calling resolver at:", resolverAddress);

            try {
                const avatarUserOperationHash = await ensBundlerClient.sendUserOperation({
                    account: smartAccountClient,
                    calls: [{
                        to: resolverAddress as `0x${string}`,
                        data: setAvatarData,
                        value: 0n
                    }],
                    ...fee
                });

                const { receipt: avatarReceipt } = await ensBundlerClient.waitForUserOperationReceipt({
                    hash: avatarUserOperationHash,
                });

                console.log("✅ ENS avatar updated successfully");
                console.log(`🔗 View: https://sepolia.app.ens.domains/${ensFullName}?tab=more`);

                return true;
            } catch (resolverError) {
                console.error("Failed to update avatar with current resolver:", resolverError);
                console.log("Trying to set a new resolver first...");

                // Try to set a new resolver first, then update the avatar
                const PublicResolverAddress = '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD'; // default on Sepolia

                const setResolverData = encodeFunctionData({
                    abi: [{
                        name: 'setResolver',
                        type: 'function',
                        stateMutability: 'nonpayable',
                        inputs: [
                            { name: 'node', type: 'bytes32' },
                            { name: 'resolver', type: 'address' }
                        ],
                        outputs: []
                    }],
                    functionName: 'setResolver',
                    args: [node, PublicResolverAddress as `0x${string}`]
                });

                const resolverUserOperationHash = await ensBundlerClient.sendUserOperation({
                    account: smartAccountClient,
                    calls: [{
                        to: ENS_REGISTRY_ADDRESS as `0x${string}`,
                        data: setResolverData,
                        value: 0n
                    }],
                    ...fee
                });

                const { receipt: resolverReceipt } = await ensBundlerClient.waitForUserOperationReceipt({
                    hash: resolverUserOperationHash,
                });

                console.log("✅ New resolver set successfully");

                // Now try to set the avatar with the new resolver
                const newSetAvatarData = encodeFunctionData({
                    abi: PublicResolverABI.abi,
                    functionName: 'setText',
                    args: [node, 'avatar', avatarUrl]
                });

                const newAvatarUserOperationHash = await ensBundlerClient.sendUserOperation({
                    account: smartAccountClient,
                    calls: [{
                        to: PublicResolverAddress as `0x${string}`,
                        data: newSetAvatarData,
                        value: 0n
                    }],
                    ...fee
                });

                const { receipt: newAvatarReceipt } = await ensBundlerClient.waitForUserOperationReceipt({
                    hash: newAvatarUserOperationHash,
                });

                console.log("✅ ENS avatar updated successfully with new resolver");
                console.log(`🔗 View: https://sepolia.app.ens.domains/${ensFullName}?tab=more`);

                return true;
            }
        } catch (error) {
            console.error("Error updating ENS avatar:", error);

            // Provide more specific error information
            if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.includes('UserOperation reverted')) {
                console.error("The transaction was reverted. This could be because:");
                console.error("1. The smart account doesn't have permission to update this ENS record");
                console.error("2. The resolver contract doesn't support the setText function");
                console.error("3. The ENS name might be on a different network");
                console.error("4. The resolver might be outdated or incompatible");
            }

            return false;
        }
    }
}
export default ensService;