# DID:Web Functionality

This document describes the DID:Web implementation that allows users to generate and validate DID documents for their agent identities.

## Overview

The DID:Web functionality provides a way to create decentralized identifiers (DIDs) that are anchored to web domains and bound to Ethereum smart accounts. This enables agents to have verifiable identities that can be used across different systems.

## Features

### 1. **DID Document Generation**
- Creates W3C-compliant DID documents
- Supports `did:web` method for domain anchoring
- Includes Ethereum smart account binding via `blockchainAccountId`
- Optional server JWK for additional verification methods

### 2. **Verification Methods**
- **Ethereum Smart Account**: Uses EIP-1271 signature validation
- **Server JWK**: Automatically generated from EOA address for JSON-LD proofs
- **Dual Authentication**: Supports both on-chain and off-chain verification
- **JWK Verification**: Test signature validation with generated public key

### 3. **Signature Validation**
- Tests EIP-1271 signature validation with smart accounts
- Validates that the smart account can verify signatures
- **JWK Signature Testing**: Verifies signatures with generated public key
- Provides real-time validation feedback for both methods

### 4. **User Interface**
- Similar to Agent Card dialog with editing fields
- Form-based configuration for DID parameters
- JSON preview and download functionality
- Copy-to-clipboard support

## How to Use

### 1. **Access DID:Web Dialog**
- Navigate to the agent table
- Find an agent you own (marked with "Mine" chip)
- Click the "DID:Web" button in the Actions column

### 2. **Configure DID Document**
Fill in the required and optional fields:

**Required Fields:**
- **Domain**: The domain for the DID identifier (e.g., `example.com`)

**Optional Fields:**
- **ENS Name**: ENS name to include in `alsoKnownAs`
- **Agent Card URL**: URL to the agent card service
- **Server JWK**: Include additional verification method
  - **X Coordinate**: secp256k1 public key X coordinate (manual entry)
  - **Y Coordinate**: secp256k1 public key Y coordinate (manual entry)
  - **Auto-generated JWK**: Automatically generated from EOA address

### 3. **Generate DID Document**
- Click "Generate DID Document" button
- The system will create a W3C-compliant DID document
- JSON will be displayed in the preview area

### 4. **Validate Signatures**
- **EIP-1271 Validation**: Click "Validate Signature" to test smart account validation
- **JWK Validation**: Click "Verify JWK" to test public key signature validation
- The system will sign test messages and verify them with both methods
- Results will show whether each validation was successful

### 5. **Export and Use**
- Copy the JSON to clipboard
- Download as `did.json` file
- Deploy to `https://yourdomain.com/.well-known/did.json`

## Generated DID Document Structure

```json
{
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/v2",
    "https://w3id.org/security/suites/secp256k1recovery-2020/v2",
    "https://w3id.org/security/suites/eip712sig-2021/v1"
  ],
  "id": "did:web:example.com",
  "alsoKnownAs": [
    "did:pkh:eip155:11155111:0x...",
    "https://app.ens.domains/name/example.eth"
  ],
  "verificationMethod": [
    {
      "id": "did:web:example.com#aa-eth",
      "type": "EcdsaSecp256k1RecoveryMethod2020",
      "controller": "did:web:example.com",
      "blockchainAccountId": "eip155:11155111:0x...",
      "ethereumAddress": "0x...",
      "accept": ["EIP-1271", "EIP-712"]
    }
  ],
  "authentication": [
    "did:web:example.com#aa-eth"
  ],
  "assertionMethod": [
    "did:web:example.com#aa-eth"
  ],
  "capabilityInvocation": [
    "did:web:example.com#aa-eth"
  ],
  "service": [
    {
      "id": "did:web:example.com#agent-card",
      "type": "AgentCard",
      "serviceEndpoint": "https://example.com/.well-known/agent-card.json"
    }
  ]
}
```

## Technical Details

### **DID:Web Method**
- Uses domain name as the identifier
- Requires control of the domain to prove ownership
- Resolves via HTTP(S) to `/.well-known/did.json`

### **JWK Generation**
- **Automatic Generation**: Creates secp256k1 public key JWK from EOA address
- **Deterministic Approach**: Uses address hash to generate consistent JWK
- **Base64URL Encoding**: Proper encoding for JWK format
- **Verification Testing**: Tests signature validation with generated public key

**Note**: The current implementation uses a deterministic approach for demonstration purposes. In production, you would need access to the actual EOA private key to generate a cryptographically valid JWK.

### **Ethereum Integration**
- **CAIP-10 Format**: `eip155:11155111:0x...` for blockchain account ID
- **EIP-1271 Support**: Smart account signature validation
- **EIP-712 Support**: Structured data signing

### **Security Features**
- **DNS Anchoring**: Proves control of domain
- **On-chain Binding**: Links to Ethereum smart account
- **Dual Verification**: Both domain and blockchain proof
- **Signature Validation**: Real-time testing of verification methods

### **Verification Process**
1. **Domain Control**: Must be able to serve content at `/.well-known/did.json`
2. **Smart Account Binding**: DID document references the smart account
3. **Signature Validation**: Smart account can verify EIP-1271 signatures
4. **Optional JWK**: Additional verification method for JSON-LD proofs

## Use Cases

### **Agent Identity**
- Unique, verifiable identity for AI agents
- Cross-platform identity that works with different systems
- Cryptographic proof of ownership

### **Trust and Verification**
- Other systems can verify agent identity
- Cryptographic signatures for agent actions
- Tamper-proof identity records

### **Interoperability**
- Works with W3C DID standards
- Compatible with Verifiable Credentials
- Supports multiple verification methods

## Deployment

### **Web Server Setup**
1. Generate the DID document using the dialog
2. Save as `did.json` in your web server's `/.well-known/` directory
3. Ensure the file is accessible at `https://yourdomain.com/.well-known/did.json`
4. Set proper CORS headers if needed

### **DNS Configuration**
- Ensure your domain points to the correct server
- Consider using HTTPS for security
- Test accessibility from different locations

### **Validation**
- Use the built-in signature validation
- Test with external DID resolvers
- Verify all verification methods work correctly

## Troubleshooting

### **Common Issues**
1. **Domain Not Accessible**: Ensure `/.well-known/did.json` is publicly accessible
2. **Signature Validation Fails**: Check that the smart account is properly deployed
3. **JSON Format Errors**: Validate the generated JSON against W3C DID specification

### **Validation Tips**
- Test the signature validation before deploying
- Verify all URLs in the document are accessible
- Check that the smart account address is correct
- Ensure proper CORS headers for web access

## Standards Compliance

The implementation follows:
- **W3C DID Core Specification**: https://www.w3.org/TR/did-core/
- **DID:Web Method**: https://w3c-ccg.github.io/did-method-web/
- **EIP-1271**: Smart Contract Signature Verification
- **EIP-712**: Typed Structured Data Hashing and Signing
- **CAIP-10**: Chain Agnostic Account Identifiers
