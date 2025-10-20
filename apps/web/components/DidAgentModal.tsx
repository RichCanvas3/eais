import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  Divider,
  Grid,
  Card,
  CardContent
} from '@mui/material';
import { createPublicClient, createWalletClient, http, custom, keccak256, stringToHex, toHex } from 'viem';
import { sepolia } from 'viem/chains';
import { toMetaMaskSmartAccount, Implementation } from '@metamask/delegation-toolkit';
import { useWeb3Auth } from '@/components/Web3AuthProvider';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';

interface DidAgentDocument {
  "@context": string[];
  id: string;
  alsoKnownAs?: string[];
  verificationMethod: Array<{
    id: string;
    type: string;
    controller: string;
    blockchainAccountId: string;
    ethereumAddress: string;
    accept: string[];
    erc8004: {
      agentId: string;
      registry: string;
      chainId: number;
    };
  }>;
  authentication: string[];
  assertionMethod: string[];
  capabilityInvocation: string[];
  capabilityDelegation: string[];
  service: Array<{
    id: string;
    type: string;
    serviceEndpoint: any;
  }>;
  agent: {
    standard: string;
    domain: string;
    address: string;
  };
}

interface Agent {
  agentId: string;
  agentAddress: string;
  agentName: string;
  agentENSDomain: string;
  agentDNSDomain: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  agent: Agent;
  ensName?: string | null;
}

export const DidAgentModal: React.FC<Props> = ({ open, onClose, agent, ensName }) => {
  const { provider, address: eoa } = useWeb3Auth();
  const [didDocument, setDidDocument] = useState<DidAgentDocument | null>(null);
  const [mcpEndpoint, setMcpEndpoint] = useState('');
  const [a2aEndpoint, setA2aEndpoint] = useState('');
  const [agentCardUrl, setAgentCardUrl] = useState('');
  const [eip1271Result, setEip1271Result] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Auto-generate DID document when modal opens
  useEffect(() => {
    console.log('🔍 DidAgentModal useEffect triggered:', { open, agent: !!agent, provider: !!provider, eoa: !!eoa, ensName });
    if (open && agent && provider && eoa) {
      console.log('🔍 All conditions met, calling generateDidDocumentAuto...');
      generateDidDocumentAuto();
    } else {
      console.log('🔍 Conditions not met:', { open, hasAgent: !!agent, hasProvider: !!provider, hasEoa: !!eoa });
    }
  }, [open, agent, provider, eoa, ensName]);

  // Set service endpoints based on agent data when agent changes
  useEffect(() => {
    if (agent?.agentDNSDomain && agent?.agentENSDomain) {
      console.log('🔍 Setting service endpoints from agent data:', {
        agentENSDomain: agent.agentENSDomain,
        agentDNSDomain: agent.agentDNSDomain,
      });
      
      // Set the A2A service endpoint to the actual agent card URL
      const a2aUrl = `https://${agent.agentDNSDomain}/.well-known/agent-card.json`;
      setA2aEndpoint(a2aUrl);
      setAgentCardUrl(a2aUrl);
      
      // Set MCP endpoint based on agent domain (assuming MCP service runs on same domain)
      const mcpUrl = `wss://${agent.agentDNSDomain}/.well-known/mcp`;
      setMcpEndpoint(mcpUrl);
      
      console.log('✅ Service endpoints set:', {
        a2a: a2aUrl,
        mcp: mcpUrl,
        ens: ensName || 'none'
      });
    }
  }, [agent, ensName]);

  const generateDidDocumentAuto = async () => {
    console.log('🔍 generateDidDocumentAuto called with:', { agent: !!agent, provider: !!provider, eoa: !!eoa });
    
    if (!agent || !provider || !eoa) {
      console.log('🔍 Missing required props, returning early');
      return;
    }

    console.log('🔍 Setting isGenerating to true');
    setIsGenerating(true);
    try {
      console.log('🔍 Auto-generating DID:Agent document...');

      // For DID:Agent, we use the account abstraction address for verification
      // No need to generate JWK since we're using EcdsaSecp256k1RecoveryMethod2020
      console.log('✅ Using account abstraction address for verification:', agent.agentAddress);

      // Create verification methods using account abstraction address
      const verificationMethods = [
        {
          id: `did:agent:eip155:11155111:${agent.agentId}#aa-eth`,
          type: "EcdsaSecp256k1RecoveryMethod2020",
          controller: `did:agent:eip155:11155111:${agent.agentId}`,
          blockchainAccountId: `eip155:11155111:${agent.agentAddress}`,
          ethereumAddress: agent.agentAddress,
          accept: ["EIP-1271", "EIP-712"],
          erc8004: {
            agentId: agent.agentId,
            registry: process.env.NEXT_PUBLIC_ETH_SEPOLIA_IDENTITY_REGISTRY || "0xREG1STRYADDRE55",
            chainId: 11155111
          }
        }
      ];

      // Create alsoKnownAs array
      const alsoKnownAs = [
        `https://${agent.agentDNSDomain}`,
        ...(ensName ? [`ens:${ensName}`] : [])
      ];

      // Create DID:Agent document
      const didAgentDocument: DidAgentDocument = {
        "@context": [
          "https://www.w3.org/ns/did/v1",
          "https://w3id.org/security/multikey/v1"
        ],
        id: `did:agent:eip155:11155111:${agent.agentId}`,
        alsoKnownAs: alsoKnownAs,
        verificationMethod: verificationMethods,
        authentication: [`did:agent:eip155:11155111:${agent.agentId}#aa-eth`],
        assertionMethod: [`did:agent:eip155:11155111:${agent.agentId}#aa-eth`],
        capabilityInvocation: [`did:agent:eip155:11155111:${agent.agentId}#aa-eth`],
        capabilityDelegation: [`did:agent:eip155:11155111:${agent.agentId}#aa-eth`],
        service: [
          {
            id: "#mcp-ws",
            type: "MCP",
            serviceEndpoint: {
              uri: mcpEndpoint || `wss://${agent.agentDNSDomain}/.well-known/mcp`,
              protocol: "model-context-protocol",
              version: "0.1",
              transport: "websocket",
              accept: ["application/json"],
              auth: ["did-jws", "eip-1271"]
            }
          },
          ...(ensName ? [{
            id: "#ens",
            type: "ENSService",
            serviceEndpoint: {
              name: ensName,
              network: "eip155:1",
              records: {
                addr: agent.agentAddress,
                contenthash: `ipfs://bafy.../${agent.agentDNSDomain}/agent-card.json`,
                url: `https://${agent.agentDNSDomain}`,
                "org.did": `did:agent:eip155:11155111:${agent.agentId}`
              },
              auth: ["eip-1271", "eip-712"]
            }
          }] : []),
          {
            id: "#linked-domains",
            type: "LinkedDomains",
            serviceEndpoint: {
              origins: [`https://${agent.agentDNSDomain}`]
            }
          },
          {
            id: "#agent-card",
            type: "AgentCard",
            serviceEndpoint: a2aEndpoint || `https://${agent.agentDNSDomain}/.well-known/agent-card.json`
          },
          {
            id: "#agent-interface",
            type: "AgentInterface",
            serviceEndpoint: `https://${agent.agentDNSDomain}/.well-known/a2a`
          },
          {
            id: "#reputation",
            type: "ReputationRegistry",
            serviceEndpoint: {
              chainId: 11155111,
              contract: "0xREPUT4TI0NADDRE55",
              methods: ["acceptFeedback"]
            }
          }
        ],
        agent: {
          standard: "ERC-8004",
          domain: agent.agentENSDomain,
          address: agent.agentAddress
        }
      };

      setDidDocument(didAgentDocument);
      console.log('✅ Generated DID:Agent document:', didAgentDocument);
      console.log('✅ Setting isGenerating to false');

    } catch (error) {
      console.error('❌ Error generating DID:Agent document:', error);
      
      // Fallback DID:Agent document
      const fallbackDocument: DidAgentDocument = {
        "@context": [
          "https://www.w3.org/ns/did/v1",
          "https://w3id.org/security/multikey/v1"
        ],
        id: `did:agent:eip155:11155111:${agent.agentId}`,
        alsoKnownAs: [
          `https://${agent.agentDNSDomain}`,
          ...(ensName ? [`ens:${ensName}`] : [])
        ],
        verificationMethod: [
          {
            id: `did:agent:eip155:11155111:${agent.agentId}#aa-eth`,
            type: "EcdsaSecp256k1RecoveryMethod2020",
            controller: `did:agent:eip155:11155111:${agent.agentId}`,
            blockchainAccountId: `eip155:11155111:${agent.agentAddress}`,
            ethereumAddress: agent.agentAddress,
            accept: ["EIP-1271", "EIP-712"],
            erc8004: {
              agentId: agent.agentId,
              registry: process.env.NEXT_PUBLIC_ETH_SEPOLIA_IDENTITY_REGISTRY || "0xREG1STRYADDRE55",
              chainId: 11155111
            }
          }
        ],
        authentication: [`did:agent:eip155:11155111:${agent.agentId}#aa-eth`],
        assertionMethod: [`did:agent:eip155:11155111:${agent.agentId}#aa-eth`],
        capabilityInvocation: [`did:agent:eip155:11155111:${agent.agentId}#aa-eth`],
        capabilityDelegation: [`did:agent:eip155:11155111:${agent.agentId}#aa-eth`],
        service: [
          {
            id: "#agent-card",
            type: "AgentCard",
            serviceEndpoint: a2aEndpoint || `https://${agent.agentDNSDomain}/.well-known/agent-card.json`
          }
        ],
        agent: {
          standard: "ERC-8004",
          domain: agent.agentENSDomain,
          address: agent.agentAddress
        }
      };
      
      setDidDocument(fallbackDocument);
    } finally {
      console.log('🔍 Finally block: setting isGenerating to false');
      setIsGenerating(false);
    }
  };

  const generateDidDocument = async () => {
    if (!agent || !provider || !eoa) return;

    setIsGenerating(true);
    try {
      await generateDidDocumentAuto();
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const validateSignature = async () => {
    if (!provider || !eoa || !agent) return;

    try {
      console.log('🔍 Starting EIP-1271 signature validation for DID:Agent...');
      
      const testMessage = `DID:Agent Validation for ${agent.agentId}`;
      const messageHash = keccak256(stringToHex(testMessage));
      
      console.log('🔍 Test message:', testMessage);
      console.log('🔍 Message hash:', messageHash);
      console.log('🔍 EOA address:', eoa);
      console.log('🔍 Agent address:', agent.agentAddress);

      // Get signature using personal_sign
      const signature = await provider.request({
        method: 'personal_sign',
        params: [testMessage, eoa]
      }) as string;

      console.log('🔍 Signature:', signature);
      console.log('🔍 Signature length:', signature.length);

      // Create public client for contract calls
      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http()
      });

      // Check if smart account is deployed
      try {
        const code = await publicClient.getBytecode({
          address: agent.agentAddress as `0x${string}`
        });
        console.log('🔍 Smart account code length:', code?.length || 0);
        
        if (code && code.length > 2) {
          console.log('✅ Smart account is deployed');
          
          // Try to read owner if it's a standard ERC-4337 account
          try {
            const owner = await publicClient.readContract({
              address: agent.agentAddress as `0x${string}`,
              abi: [{
                name: 'owner',
                type: 'function',
                inputs: [],
                outputs: [{ name: '', type: 'address' }],
                stateMutability: 'view'
              }],
              functionName: 'owner'
            });
            console.log('🔍 Smart account owner:', owner);
            console.log('🔍 EOA matches owner:', owner.toLowerCase() === eoa.toLowerCase());
          } catch (ownerError) {
            console.log('⚠️ Could not read owner (might not be standard ERC-4337):', ownerError);
          }
        } else {
          console.log('⚠️ Smart account is not deployed yet');
        }
      } catch (ownerError) {
        console.log('⚠️ Could not read code or owner:', ownerError);
      }

      // Use MetaMask delegation toolkit approach for signature validation
      console.log('🔍 Using MetaMask delegation toolkit approach for signature validation...');
      
      let isValid;
      try {
        // For MetaMask delegation toolkit AAs, try standard EIP-1271 validation
        isValid = await publicClient.readContract({
          address: agent.agentAddress as `0x${string}`,
          abi: [{
            name: 'isValidSignature',
            type: 'function',
            inputs: [
              { name: 'hash', type: 'bytes32' },
              { name: 'signature', type: 'bytes' }
            ],
            outputs: [{ name: '', type: 'bytes4' }],
            stateMutability: 'view'
          }],
          functionName: 'isValidSignature',
          args: [messageHash, signature as `0x${string}`]
        });
        
        console.log('🔍 Standard EIP-1271 validation result:', isValid);
        
        // If standard validation fails, try with EIP-191 prefixed message
        if (isValid !== '0x1626ba7e') {
          console.log('🔍 Standard validation failed, trying EIP-191 prefixed message...');
          
          const prefixedMessage = `\x19Ethereum Signed Message:\n${testMessage.length}${testMessage}`;
          const prefixedHash = keccak256(stringToHex(prefixedMessage));
          
          isValid = await publicClient.readContract({
            address: agent.agentAddress as `0x${string}`,
            abi: [{
              name: 'isValidSignature',
              type: 'function',
              inputs: [
                { name: 'hash', type: 'bytes32' },
                { name: 'signature', type: 'bytes' }
              ],
              outputs: [{ name: '', type: 'bytes4' }],
              stateMutability: 'view'
            }],
            functionName: 'isValidSignature',
            args: [prefixedHash, signature as `0x${string}`]
          });
          
          console.log('🔍 EIP-191 prefixed validation result:', isValid);
        }
        
      } catch (validationError) {
        console.log('❌ All validation attempts failed:', validationError);
        throw validationError;
      }

      console.log('🔍 Smart account validation result:', isValid);
      console.log('🔍 Expected magic value: 0x1626ba7e');
      console.log('🔍 Magic value match:', isValid === '0x1626ba7e');

      if (isValid === '0x1626ba7e') {
        setEip1271Result('success');
        console.log('✅ EIP-1271 signature validation successful!');
      } else {
        setEip1271Result('failure');
        console.log('❌ EIP-1271 signature validation failed. Result:', isValid);
      }

    } catch (error) {
      console.error('❌ Error validating EIP-1271 signature:', error);
      setEip1271Result('error');
    }
  };


  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="lg" 
      fullWidth
      PaperProps={{
        sx: { height: '90vh' }
      }}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">DID:Agent Document Generator</Typography>
          <Box display="flex" gap={1}>
            <Chip 
              label="Account Abstraction" 
              color="primary" 
              size="small"
              icon={<CheckCircleIcon />}
            />
            <Button 
              variant="outlined" 
              size="small"
              onClick={generateDidDocument}
              disabled={isGenerating}
            >
              {isGenerating ? 'Generating...' : 'Regenerate DID Document'}
            </Button>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ height: '80vh', overflow: 'hidden' }}>
        <Box display="flex" height="100%" gap={2}>
          {/* Left Panel - Configuration */}
          <Box flex={1} overflow="auto" p={3}>
            <Typography variant="h6" gutterBottom>
              DID:Agent Configuration
            </Typography>
            
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="MCP Service Endpoint"
                  value={mcpEndpoint}
                  onChange={(e) => setMcpEndpoint(e.target.value)}
                  placeholder={`wss://${agent?.agentDNSDomain || 'example.com'}/.well-known/mcp`}
                  helperText="WebSocket endpoint for MCP (Model Context Protocol) service - derived from agent domain"
                />
              </Grid>
              
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Agent Card Endpoint"
                  value={a2aEndpoint}
                  onChange={(e) => setA2aEndpoint(e.target.value)}
                  placeholder={`https://${agent?.agentDNSDomain || 'example.com'}/.well-known/agent-card.json`}
                  helperText="HTTP endpoint for Agent Card service - derived from agent domain"
                />
              </Grid>
            </Grid>

            <Divider sx={{ my: 3 }} />

            <Typography variant="h6" gutterBottom>
              Agent Information
            </Typography>
            
            <Card variant="outlined">
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  <strong>Agent ID:</strong> {agent.agentId}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Agent Address:</strong> {agent.agentAddress}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Agent ENSDomain:</strong> {agent.agentENSDomain}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Agent DNSDomain:</strong> {agent.agentDNSDomain}
                </Typography>
                {ensName && (
                  <Typography variant="body2" color="text.secondary">
                    <strong>ENS Name:</strong> {ensName}
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Box>

          {/* Right Panel - Generated DID Document */}
          <Box flex={1} overflow="auto" p={3}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">Generated DID:Agent Document</Typography>
              {didDocument && (
                <Tooltip title="Copy to clipboard">
                  <IconButton onClick={() => copyToClipboard(JSON.stringify(didDocument, null, 2))}>
                    <ContentCopyIcon />
                  </IconButton>
                </Tooltip>
              )}
            </Box>

            <Box 
              sx={{ 
                height: '400px',
                overflow: 'auto',
                border: '1px solid #ddd',
                borderRadius: 1,
                p: 2,
                backgroundColor: '#f5f5f5'
              }}
            >
              <pre style={{ 
                margin: 0, 
                fontSize: '12px',
                lineHeight: '1.4',
                minHeight: '350px'
              }}>
                {didDocument ? JSON.stringify(didDocument, null, 2) : 'Generating DID:Agent document...'}
              </pre>
            </Box>

            {/* Verification Button */}
            <Box mt={2} display="flex" gap={2}>
              <Button
                variant="contained"
                color="primary"
                onClick={validateSignature}
                disabled={!provider || !eoa}
                startIcon={eip1271Result === 'success' ? <CheckCircleIcon /> : eip1271Result === 'failure' ? <ErrorIcon /> : undefined}
              >
                EIP-1271 (Smart Account)
              </Button>
            </Box>

            {/* Verification Results */}
            {eip1271Result && (
              <Alert 
                severity={eip1271Result === 'success' ? 'success' : eip1271Result === 'failure' ? 'error' : 'warning'}
                sx={{ mt: 2 }}
              >
                {eip1271Result === 'success' && 'EIP-1271 signature validation successful!'}
                {eip1271Result === 'failure' && 'EIP-1271 signature validation failed. Check console for details.'}
                {eip1271Result === 'error' && 'Error during EIP-1271 validation. Check console for details.'}
              </Alert>
            )}

          </Box>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};
