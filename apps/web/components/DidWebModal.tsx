'use client';
import * as React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Alert,
  CircularProgress,
  Chip,
  Stack,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import { createPublicClient, createWalletClient, http, custom, keccak256, stringToHex, toHex } from 'viem';
import { sepolia } from 'viem/chains';
import { toMetaMaskSmartAccount, Implementation } from '@metamask/delegation-toolkit';
import { useWeb3Auth } from '@/components/Web3AuthProvider';
import { generatePublicKeyJwkFromPrivateKey, generateDeterministicJwkFromAddress, generateJwkFromConnectedWallet, signMessageWithEoa, verifyJwkSignature } from '@/lib/jwk-utils';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import VpnKeyIcon from '@mui/icons-material/VpnKey';

type Props = {
  open: boolean;
  onClose: () => void;
  agent: {
    agentId: string;
    agentAddress: string;
    agentDomain: string;
  };
  ensName?: string | null;
};

interface DidWebDocument {
  '@context': string[];
  id: string;
  alsoKnownAs: string[];
  verificationMethod: VerificationMethod[];
  authentication: string[];
  assertionMethod: string[];
  capabilityInvocation: string[];
  service: Service[];
}

interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  blockchainAccountId?: string;
  ethereumAddress?: string;
  accept?: string[];
  publicKeyJwk?: {
    kty: string;
    crv: string;
    x: string;
    y: string;
  };
}

interface Service {
  id: string;
  type: string;
  serviceEndpoint: string;
}

export function DidWebModal({ open, onClose, agent, ensName }: Props) {
  const { provider, address: eoa } = useWeb3Auth();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [didDocument, setDidDocument] = React.useState<DidWebDocument | null>(null);
  const [didJson, setDidJson] = React.useState<string>('');
  const [validationResult, setValidationResult] = React.useState<{
    isValid: boolean;
    message: string;
  } | null>(null);
  const [generatedJwk, setGeneratedJwk] = React.useState<{
    x: string;
    y: string;
    jwk: any;
  } | null>(null);
  const [jwkVerificationResult, setJwkVerificationResult] = React.useState<{
    isValid: boolean;
    message: string;
  } | null>(null);

  // Form fields
  const [domain, setDomain] = React.useState('');
  const [ensNameField, setEnsNameField] = React.useState('');
  const [agentCardUrl, setAgentCardUrl] = React.useState('');

  // Initialize form with agent data and auto-generate DID document
  React.useEffect(() => {
    if (agent && open) {
      setDomain(agent.agentDomain);
      setEnsNameField(ensName || '');
      setAgentCardUrl(`https://${agent.agentDomain}/.well-known/did.json`);
      setError(null);
      setSuccess(null);
      setValidationResult(null);
      setJwkVerificationResult(null);
      
      // Auto-generate DID document
      generateDidDocumentAuto();
    }
  }, [agent, open, ensName]);

  // Re-generate DID document when provider/EOA becomes available
  React.useEffect(() => {
    if (agent && open && provider && eoa && !didDocument) {
      console.log('🔄 Provider/EOA became available, regenerating DID document...');
      generateDidDocumentAuto();
    }
  }, [provider, eoa, agent, open, didDocument]);

  const generateDidDocumentAuto = async () => {
    if (!agent) return;

    setLoading(false); // Don't show loading for auto-generation
    setError(null);
    setSuccess(null);

    try {
      const rpcUrl = (process.env.NEXT_PUBLIC_RPC_URL as string) || 'https://rpc.ankr.com/eth_sepolia';
      const publicClient = createPublicClient({ 
        chain: sepolia, 
        transport: http(rpcUrl) 
      });

      // Get the agent's smart account address and domain
      const agentAddress = agent.agentAddress.toLowerCase();
      const agentDomain = agent.agentDomain;
      const didId = `did:web:${agentDomain}`;
      
      // Build verification methods
      const verificationMethods: VerificationMethod[] = [
        {
          id: `${didId}#aa-eth`,
          type: 'EcdsaSecp256k1RecoveryMethod2020',
          controller: didId,
          blockchainAccountId: `eip155:${sepolia.id}:${agentAddress}`,
          ethereumAddress: agentAddress,
          accept: ['EIP-1271', 'EIP-712']
        }
      ];

      // Generate JWK from connected wallet's private key
      let eoaJwk: any = null;
      console.log('🔍 JWK Generation Debug:', { provider: !!provider, eoa, agentAddress });
      
      // Always generate JWK first, before creating the DID document
      if (provider && eoa) {
        try {
          console.log('🚀 Attempting to generate JWK from connected wallet...');
          eoaJwk = await generateJwkFromConnectedWallet(provider, eoa);
          console.log('✅ JWK generated successfully:', eoaJwk);
        } catch (error) {
          console.error('❌ Could not generate JWK from wallet:', error);
        }
      }
      
      // If no JWK from wallet, generate fallback
      if (!eoaJwk) {
        try {
          console.log('🔄 Generating fallback JWK...');
          eoaJwk = generateDeterministicJwkFromAddress(agentAddress);
          console.log('✅ Fallback JWK generated:', eoaJwk);
        } catch (fallbackError) {
          console.warn('❌ Fallback JWK generation failed:', fallbackError);
        }
      }
      
      // Set the JWK and add to verification methods
      if (eoaJwk) {
        setGeneratedJwk(eoaJwk);
        verificationMethods.push({
          id: `${didId}#server-jwk`,
          type: 'JsonWebKey2020',
          controller: didId,
          publicKeyJwk: eoaJwk.jwk
        });
        console.log('✅ Server-jwk verification method added to DID document');
      } else {
        console.warn('⚠️ No JWK available for server-jwk verification method');
      }

      // Build alsoKnownAs array
      const alsoKnownAs: string[] = [
        `did:pkh:eip155:${sepolia.id}:${agentAddress}`,
        `https://sepolia.app.ens.domains/`
      ];
      
      if (ensName && ensName.trim()) {
        alsoKnownAs.push(`https://sepolia.app.ens.domains/name/${ensName.trim()}`);
      }

      // Build services
      const services: Service[] = [];
      const didDocumentUrl = `https://${agentDomain}/.well-known/did.json`;
      services.push({
        id: `${didId}#did-document`,
        type: 'DIDDocument',
        serviceEndpoint: didDocumentUrl
      });

      // Create DID document
      const document: DidWebDocument = {
        '@context': [
          'https://www.w3.org/ns/did/v1',
          'https://w3id.org/security/v2',
          'https://w3id.org/security/suites/secp256k1recovery-2020/v2',
          'https://w3id.org/security/suites/eip712sig-2021/v1'
        ],
        id: didId,
        alsoKnownAs,
        verificationMethod: verificationMethods,
        authentication: verificationMethods.map(vm => vm.id),
        assertionMethod: [`${didId}#aa-eth`],
        capabilityInvocation: [`${didId}#aa-eth`],
        service: services
      };

      setDidDocument(document);
      setDidJson(JSON.stringify(document, null, 2));
      setSuccess('DID document generated successfully!');
    } catch (err) {
      console.error('Error generating DID document:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate DID document');
      
      // Generate a basic fallback DID document
      try {
        const agentAddress = agent.agentAddress.toLowerCase();
        const basicDidDocument = {
          '@context': ['https://www.w3.org/ns/did/v1'],
          id: `did:web:${domain.trim()}`,
          verificationMethod: [{
            id: `did:web:${domain.trim()}#aa-eth`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: `did:web:${domain.trim()}`,
            blockchainAccountId: `eip155:${sepolia.id}:${agentAddress}`,
            ethereumAddress: agentAddress,
            accept: ['EIP-1271', 'EIP-712']
          }],
          authentication: [`did:web:${domain.trim()}#aa-eth`],
          assertionMethod: [`did:web:${domain.trim()}#aa-eth`],
          capabilityInvocation: [`did:web:${domain.trim()}#aa-eth`],
          alsoKnownAs: [
            `did:pkh:eip155:${sepolia.id}:${agentAddress}`,
            `https://sepolia.app.ens.domains/`
          ],
          service: agentCardUrl ? [{
            id: `did:web:${domain.trim()}#did-document`,
            type: 'DIDDocument',
            serviceEndpoint: agentCardUrl
          }] : []
        };
        
        setDidDocument(basicDidDocument as any);
        setDidJson(JSON.stringify(basicDidDocument, null, 2));
        setSuccess('Generated basic DID document (fallback)');
      } catch (fallbackError) {
        console.error('Fallback DID generation also failed:', fallbackError);
      }
    } finally {
      setLoading(false);
    }
  };

  const generateDidDocument = async () => {
    if (!domain.trim()) {
      setError('Domain is required');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const rpcUrl = (process.env.NEXT_PUBLIC_RPC_URL as string) || 'https://rpc.ankr.com/eth_sepolia';
      const publicClient = createPublicClient({ 
        chain: sepolia, 
        transport: http(rpcUrl) 
      });

      // Get the agent's smart account address
      const agentAddress = agent.agentAddress.toLowerCase();
      const didId = `did:web:${domain.trim()}`;
      
      // Build verification methods
      const verificationMethods: VerificationMethod[] = [
        {
          id: `${didId}#aa-eth`,
          type: 'EcdsaSecp256k1RecoveryMethod2020',
          controller: didId,
          blockchainAccountId: `eip155:${sepolia.id}:${agentAddress}`,
          ethereumAddress: agentAddress,
          accept: ['EIP-1271', 'EIP-712']
        }
      ];

      // Generate JWK from connected wallet's private key
      let eoaJwk: any = null;
      if (provider && eoa) {
        try {
          // Try to get the real private key from the connected wallet
          eoaJwk = await generateJwkFromConnectedWallet(provider, eoa);
          
          if (eoaJwk) {
            setGeneratedJwk(eoaJwk);
            console.log('Generated JWK from wallet private key');
          } else {
            // Fallback to deterministic approach if private key not available
            console.warn('Could not extract private key, using deterministic approach');
            eoaJwk = generateDeterministicJwkFromAddress(eoa);
            setGeneratedJwk(eoaJwk);
          }
        } catch (error) {
          console.warn('Could not generate JWK from wallet:', error);
          // Fallback to deterministic approach
          try {
            eoaJwk = generateDeterministicJwkFromAddress(eoa);
            setGeneratedJwk(eoaJwk);
          } catch (fallbackError) {
            console.error('Fallback JWK generation also failed:', fallbackError);
          }
        }
      }

      // Add generated JWK from EOA if available
      if (eoaJwk) {
        verificationMethods.push({
          id: `${didId}#server-jwk`,
          type: 'JsonWebKey2020',
          controller: didId,
          publicKeyJwk: eoaJwk.jwk
        });
      }

      // Build alsoKnownAs array
      const alsoKnownAs: string[] = [
        `did:pkh:eip155:${sepolia.id}:${agentAddress}`,
        `https://sepolia.app.ens.domains/`
      ];
      
      if (ensNameField.trim()) {
        alsoKnownAs.push(`https://sepolia.app.ens.domains/name/${ensNameField.trim()}`);
      }

      // Build services
      const services: Service[] = [];
      if (agentCardUrl.trim()) {
        services.push({
          id: `${didId}#did-document`,
          type: 'DIDDocument',
          serviceEndpoint: agentCardUrl.trim()
        });
      }

      // Create DID document
      const document: DidWebDocument = {
        '@context': [
          'https://www.w3.org/ns/did/v1',
          'https://w3id.org/security/v2',
          'https://w3id.org/security/suites/secp256k1recovery-2020/v2',
          'https://w3id.org/security/suites/eip712sig-2021/v1'
        ],
        id: didId,
        alsoKnownAs,
        verificationMethod: verificationMethods,
        authentication: verificationMethods.map(vm => vm.id),
        assertionMethod: [`${didId}#aa-eth`],
        capabilityInvocation: [`${didId}#aa-eth`],
        service: services
      };

      setDidDocument(document);
      setDidJson(JSON.stringify(document, null, 2));
      setSuccess('DID document generated successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate DID document');
    } finally {
      setLoading(false);
    }
  };

  const validateSignature = async () => {
    if (!didDocument || !provider || !eoa) {
      setError('Missing required data for validation');
      return;
    }

    setLoading(true);
    setError(null);
    setValidationResult(null);

    try {
      const rpcUrl = (process.env.NEXT_PUBLIC_RPC_URL as string) || 'https://rpc.ankr.com/eth_sepolia';
      const publicClient = createPublicClient({ 
        chain: sepolia, 
        transport: http(rpcUrl) 
      });

      const walletClient = createWalletClient({ 
        chain: sepolia as any, 
        transport: custom(provider as any), 
        account: eoa as `0x${string}` 
      });

      // Create a test message to sign
      const testMessage = `DID:Web validation for ${didDocument.id} at ${new Date().toISOString()}`;
      const messageHash = keccak256(stringToHex(testMessage));

      console.log('🔍 EIP-1271 Validation Debug:', {
        testMessage,
        messageHash,
        eoa,
        agentAddress: agent.agentAddress,
        smartAccountAddress: agent.agentAddress
      });

      // Sign the message using personal_sign (raw signature for EIP-1271)
      const signature = await provider.request({
        method: 'personal_sign',
        params: [testMessage, eoa]
      });

      console.log('✅ EOA signature created:', signature);

      // Verify the signature using the smart account
      console.log('🔍 Calling isValidSignature on smart account:', agent.agentAddress);
      
      // First, let's check if the smart account is deployed and get its owner
      try {
        const code = await publicClient.getBytecode({ address: agent.agentAddress as `0x${string}` });
        console.log('🔍 Smart account code length:', code?.length || 0);
        console.log('🔍 Smart account is deployed:', (code?.length || 0) > 2);
        
        if (code && code.length > 2) {
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
        }
      } catch (ownerError) {
        console.log('⚠️ Could not read owner or code (might not be a standard ERC-4337 account):', ownerError);
      }
      
      // Use MetaMask delegation toolkit approach for signature validation
      console.log('🔍 Using MetaMask delegation toolkit approach for signature validation...');
      
      let isValid;
      try {
        // Since we can't access the private key directly, let's try a different approach
        // The issue might be that the smart account expects a different signature format
        // Let's try using the delegation toolkit's signature format expectations
        
        console.log('🔍 Attempting EIP-1271 validation with delegation toolkit considerations...');
        
        // For MetaMask delegation toolkit AAs, we might need to use a different approach
        // Let's try the standard EIP-1271 validation but with the correct smart account address
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
      
      // Additional debugging - let's see what the signature looks like
      console.log('🔍 Signature analysis:', {
        signature,
        signatureLength: signature.length,
        expectedLength: 132, // 0x + 130 hex chars = 132
        messageHash,
        messageHashLength: messageHash.length
      });
      
      // Check if the signature is the right length
      if (signature.length !== 132) {
        console.warn('⚠️ Signature length is not 132 characters (0x + 130 hex chars)');
      }

      const isValidSignature = isValid === '0x1626ba7e'; // EIP-1271 magic value

      setValidationResult({
        isValid: isValidSignature,
        message: isValidSignature 
          ? 'Signature validation successful! The DID document is valid.'
          : 'Signature validation failed. The smart account could not verify the signature.'
      });

    } catch (err) {
      setValidationResult({
        isValid: false,
        message: `Validation error: ${err instanceof Error ? err.message : 'Unknown error'}`
      });
    } finally {
      setLoading(false);
    }
  };

  const verifyJwkSignatureLocal = async () => {
    if (!generatedJwk || !provider || !eoa) {
      setError('Missing required data for JWK verification');
      return;
    }

    setLoading(true);
    setError(null);
    setJwkVerificationResult(null);

    try {

      // Create a test message to sign - use the same message format as JWK generation
      const testMessage = `DID:Web JWK Generation for ${eoa}`;
      
      console.log('🔍 Signing test message for JWK verification:', {
        message: testMessage,
        eoa,
        messageLength: testMessage.length,
        timestamp: new Date().toISOString(),
        provider: !!provider,
        providerType: provider?.constructor?.name,
        providerKeys: provider ? Object.keys(provider) : 'no provider'
      });
      
      // Sign the message using personal_sign (same method as JWK generation)
      // This ensures consistent message format
      const signature = await provider.request({
        method: 'personal_sign',
        params: [testMessage, eoa]
      });

      console.log('✅ Test message signed:', {
        signature,
        eoa,
        testMessage,
        signatureLength: signature.length
      });

      // Now verify the signature using the JWK public key
      console.log('🔍 Verifying signature against JWK public key...');
      const isValid = await verifyJwkSignature(testMessage, signature, generatedJwk.jwk);

      console.log('✅ JWK verification result:', isValid);

      setJwkVerificationResult({
        isValid,
        message: isValid 
          ? 'JWK signature verification successful! The JsonWebKey2020 verification method is valid and can verify signatures.'
          : 'JWK signature verification failed. The JsonWebKey2020 verification method could not verify the signature.'
      });

    } catch (err) {
      console.error('❌ JWK verification error:', err);
      setJwkVerificationResult({
        isValid: false,
        message: `JWK verification error: ${err instanceof Error ? err.message : 'Unknown error'}`
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const downloadDidJson = () => {
    const blob = new Blob([didJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'did.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Typography variant="h6" component="div">
          Generate DID:Web Document
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Create a DID document for {agent?.agentDomain}
        </Typography>
      </DialogTitle>
      
      <DialogContent sx={{ height: '80vh', display: 'flex', flexDirection: 'column', p: 0 }}>
        <Box sx={{ display: 'flex', gap: 3, flex: 1, overflow: 'hidden' }}>
          {/* Left side - Configuration Form */}
          <Box sx={{ 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column', 
            gap: 3, 
            overflow: 'auto',
            p: 3,
            borderRight: '1px solid',
            borderColor: 'divider'
          }}>
          {/* Configuration Section */}
          <Box>
            <Typography variant="h6" gutterBottom>
              Configuration
            </Typography>
            <Stack spacing={2}>
              <TextField
                fullWidth
                label="Domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="example.com"
                helperText="The domain for the DID:Web identifier"
              />
              
              <TextField
                fullWidth
                label="ENS Name (optional)"
                value={ensNameField}
                onChange={(e) => setEnsNameField(e.target.value)}
                placeholder="example.eth"
                helperText="ENS name to include in alsoKnownAs"
              />
              
              <TextField
                fullWidth
                label="DID Document URL (optional)"
                value={agentCardUrl}
                onChange={(e) => setAgentCardUrl(e.target.value)}
                placeholder="https://example.com/.well-known/did.json"
                helperText="URL to the DID document service"
              />
            </Stack>
          </Box>

          <Divider />

          {/* Actions */}
          <Box>
            <Button
              variant="outlined"
              onClick={generateDidDocument}
              disabled={loading || !domain.trim()}
              startIcon={loading ? <CircularProgress size={20} /> : null}
            >
              Regenerate DID Document
            </Button>
          </Box>

          {/* Results */}
          {error && (
            <Alert severity="error" icon={<ErrorIcon />}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" icon={<CheckCircleIcon />}>
              {success}
            </Alert>
          )}

          {validationResult && (
            <Alert 
              severity={validationResult.isValid ? "success" : "error"}
              icon={validationResult.isValid ? <CheckCircleIcon /> : <ErrorIcon />}
            >
              {validationResult.message}
            </Alert>
          )}

          {jwkVerificationResult && (
            <Alert 
              severity={jwkVerificationResult.isValid ? "success" : "error"}
              icon={jwkVerificationResult.isValid ? <CheckCircleIcon /> : <ErrorIcon />}
            >
              {jwkVerificationResult.message}
            </Alert>
          )}

          </Box>

          {/* Right side - DID Document Display */}
          <Box sx={{ 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column',
            overflow: 'hidden',
            p: 3
          }}>
            <Typography variant="h6" gutterBottom>
              Generated DID Document
            </Typography>
            
            {didJson ? (
              <>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Chip
                    label={`DID: ${didDocument?.id}`}
                    color="primary"
                    variant="outlined"
                  />
                  <Box>
                    <Tooltip title="Copy to clipboard">
                      <IconButton onClick={() => copyToClipboard(didJson)}>
                        <ContentCopyIcon />
                      </IconButton>
                    </Tooltip>
                    <Button
                      size="small"
                      onClick={downloadDidJson}
                      sx={{ ml: 1 }}
                    >
                      Download
                    </Button>
                  </Box>
                </Box>
                
                <Box sx={{ 
                  height: '400px',
                  overflow: 'auto', 
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 1,
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <pre style={{
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    margin: 0,
                    padding: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    flex: 1,
                    minHeight: '350px'
                  }}>
                    {didJson}
                  </pre>
                </Box>
                
                {/* Verification Buttons */}
                <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Verification Methods
                  </Typography>
                  
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button
                      variant="outlined"
                      onClick={validateSignature}
                      disabled={loading || !provider || !eoa}
                      startIcon={loading ? <CircularProgress size={16} /> : null}
                      size="small"
                    >
                      EIP-1271 (Smart Account)
                    </Button>
                    
                    {generatedJwk && (
                      <Button
                        variant="outlined"
                        onClick={verifyJwkSignatureLocal}
                        disabled={loading || !provider || !eoa}
                        startIcon={<VpnKeyIcon />}
                        size="small"
                      >
                        JWK Signature
                      </Button>
                    )}
                  </Box>
                </Box>
              </>
            ) : (
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                flex: 1,
                border: '1px dashed',
                borderColor: 'divider',
                borderRadius: 1,
                minHeight: '400px'
              }}>
                <Typography variant="body2" color="text.secondary">
                  {loading ? 'Generating DID document...' : 'Configure settings to generate DID document'}
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
