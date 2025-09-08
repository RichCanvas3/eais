# MetaMask Troubleshooting Guide

## Common Issues and Solutions

### 1. "nativeCurrency.symbol does not match" Error

**Error Message:**
```
nativeCurrency.symbol does not match currency symbol for a network the user already has added with the same chainId. Received: ETH
```

**Cause:**
This error occurs when MetaMask has a conflicting network configuration for Sepolia testnet. The network might have been added with different currency settings.

**Solutions:**

#### Option A: Automatic Fix (Recommended)
The application now automatically detects and resolves this issue. If you encounter this error:
1. The app will automatically attempt to switch to the correct Sepolia network
2. If that fails, it will fall back to OpenLogin authentication
3. Check the browser console for detailed logs

#### Option B: Manual Fix
If the automatic fix doesn't work:

1. **Open MetaMask**
2. **Go to Settings > Networks**
3. **Find Sepolia Testnet** in your networks list
4. **Click the three dots** next to Sepolia Testnet
5. **Select "Delete"** to remove the conflicting network
6. **Refresh the page** and try connecting again

#### Option C: Reset MetaMask Networks
If you have multiple conflicting networks:

1. **Open MetaMask**
2. **Go to Settings > Advanced**
3. **Click "Reset Account"** (this will clear all custom networks)
4. **Refresh the page** and try connecting again

### 2. Network Not Found Error

**Error Message:**
```
Unrecognized chain ID
```

**Solution:**
The app will automatically add Sepolia testnet to MetaMask. If this fails:

1. **Manually add Sepolia testnet:**
   - Network Name: `Sepolia Testnet`
   - RPC URL: `https://rpc.ankr.com/eth_sepolia`
   - Chain ID: `11155111`
   - Currency Symbol: `ETH`
   - Block Explorer: `https://sepolia.etherscan.io`

### 3. Connection Timeout

**Error Message:**
```
Failed to connect with wallet
```

**Solutions:**
1. **Check MetaMask is unlocked**
2. **Refresh the page**
3. **Try using OpenLogin instead** (the app will offer this as a fallback)
4. **Clear browser cache** and try again

### 4. Account Not Found

**Error Message:**
```
No accounts found
```

**Solutions:**
1. **Make sure MetaMask is connected** and has an account
2. **Check that the account is unlocked**
3. **Try disconnecting and reconnecting** MetaMask

## Alternative Authentication Methods

If MetaMask continues to have issues, the application supports:

1. **OpenLogin**: Social login (Google, Twitter, etc.)
2. **Email/Password**: Traditional authentication
3. **External Wallet**: Other wallet providers

The app will automatically offer these alternatives if MetaMask fails.

## Getting Help

If you continue to experience issues:

1. **Check the browser console** for detailed error messages
2. **Try a different browser** (Chrome, Firefox, Safari)
3. **Update MetaMask** to the latest version
4. **Clear browser cache** and cookies
5. **Disable browser extensions** temporarily

## Network Configuration

The application is configured for:
- **Network**: Sepolia Testnet
- **Chain ID**: 11155111 (0xaa36a7)
- **Currency**: ETH
- **RPC URL**: https://rpc.ankr.com/eth_sepolia
- **Block Explorer**: https://sepolia.etherscan.io

Make sure your MetaMask is configured for the same network.
