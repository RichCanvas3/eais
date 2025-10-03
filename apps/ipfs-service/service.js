import express from 'express';
import axios from 'axios';
import cors from 'cors';
import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';
import helmet from 'helmet';
import querystring from 'querystring';
import { generateKeyPairSync, createPrivateKey, createPublicKey } from 'crypto';
import * as jose from 'jose';
import { keccak256, toUtf8Bytes } from 'ethers';
import { createHash, publicDecrypt } from 'crypto';
import * as base64 from '@ethersproject/base64';
import { publicKeyToAddress } from 'viem/accounts';
import bodyParser from 'body-parser';
import { v4 as uuidv4 } from 'uuid';
import { Storage } from '@google-cloud/storage';
import { create } from '@web3-storage/w3up-client';

// Initialize application
console.log('Starting application...');

// Load environment variables
dotenv.config();

// Validate critical environment variables
const validateEnvVars = () => {
  const requiredVars = [
    'SENDGRID_API_KEY',
    'GCLOUD_BUCKET_NAME',
    'LINKEDIN_CLIENT_ID',
    'LINKEDIN_CLIENT_SECRET',
    'LINKEDIN_REDIRECT_URI',
    'X_CLIENT_ID',
    'X_CLIENT_SECRET',
    'X_REDIRECT_URI',
    'SHOPIFY_CLIENT_ID',
    'SHOPIFY_CLIENT_SECRET',
    'SHOPIFY_SHOP_NAME'
  ];
  
  // Optional Web3.Storage configuration
  if (process.env.WEB3_STORAGE_EMAIL && process.env.WEB3_STORAGE_SPACE_DID) {
    console.log('Web3.Storage configuration detected');
  } else {
    console.log('Web3.Storage not configured - will use fallback storage');
  }
  requiredVars.forEach((varName) => {
    if (!process.env[varName]) {
      console.error(`Missing environment variable: ${varName}`);
    } else {
      //console.log(`Environment variable ${varName}: ${varName.includes('SECRET') || varName.includes('KEY') ? '[REDACTED]' : process.env[varName]}`);
    }
  });
};
console.log('Validating environment variables...');
validateEnvVars();

const app = express();

// Set SendGrid API key
try {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  //console.log('SendGrid API key set successfully');
} catch (error) {
  console.error('Error setting SendGrid API key:', error.message, error.stack);
}

// Middleware
const allowedOrigins = [
  'http://localhost:5173',
  'https://wallet.myorgwallet.io',
];
app.use(cors({
  origin: (origin, callback) => {
    //console.log(`CORS check for origin: ${origin}`);
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      const error = new Error('Not allowed by CORS');
      console.error(error.message);
      callback(error);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(helmet());
app.use(express.json());
app.use(bodyParser.json());

const verificationCodes = new Map();

// Web3.Storage client initialization
let web3StorageClient = null;
let web3StorageInitialized = false;

const initializeWeb3Storage = async () => {
  if (web3StorageInitialized) return web3StorageClient;
  
  try {
    if (!process.env.WEB3_STORAGE_EMAIL || !process.env.WEB3_STORAGE_SPACE_DID) {
      console.log('Web3.Storage not configured, skipping initialization');
      return null;
    }

    console.log('Initializing Web3.Storage client...');
    web3StorageClient = await create();
    
    console.log('Logging in to Web3.Storage...');
    await web3StorageClient.login(process.env.WEB3_STORAGE_EMAIL);
    
    console.log('Getting available spaces...');
    const spaces = await web3StorageClient.spaces();
    console.log(`Found ${spaces.length} spaces`);
    
    // Check if the configured space is available
    const targetSpaceDid = process.env.WEB3_STORAGE_SPACE_DID;
    const spaceAvailable = spaces.find(s => s.did() === targetSpaceDid);
    
    if (spaceAvailable) {
      console.log(`✅ Target space ${targetSpaceDid} is available and ready to use`);
      
      // Store the target space for direct uploads
      web3StorageClient.targetSpace = spaceAvailable;
      console.log('✅ Target space stored for direct uploads');
      
      web3StorageInitialized = true;
      console.log('Web3.Storage client initialized successfully');
      return web3StorageClient;
    } else {
      console.log(`⚠️  Target space ${targetSpaceDid} is not available`);
      console.log('💡 This means your configured space needs to be activated.');
      console.log('📧 To activate your space:');
      console.log('1. Visit https://console.web3.storage/');
      console.log('2. Log in with your email');
      console.log('3. Look for authorization emails or pending invitations');
      console.log('4. Accept the space invitation');
      console.log('5. Restart the server');
      return null;
    }
  } catch (error) {
    console.error('Failed to initialize Web3.Storage client:', error);
    console.error('Error details:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    return null;
  }
};

const generateCode = () => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  console.log('Generated verification code:', code);
  return code;
};

// LinkedIn OAuth callback
app.get('/linkedin-callback', async (req, res) => {
  console.log('Handling /linkedin-callback');
  const { code } = req.query;

  if (!code) {
    console.error('No authorization code received in /linkedin-callback');
    return res.status(400).send('No authorization code received.');
  }

  try {
    console.log('LinkedIn OAuth environment variables:', {
      LINKEDIN_REDIRECT_URI: process.env.LINKEDIN_REDIRECT_URI,
      LINKEDIN_CLIENT_ID: process.env.LINKEDIN_CLIENT_ID ? '[REDACTED]' : undefined,
      LINKEDIN_CLIENT_SECRET: process.env.LINKEDIN_CLIENT_SECRET ? '[REDACTED]' : undefined,
    });

    const response = await axios.post(
      'https://www.linkedin.com/oauth/v2/accessToken',
      querystring.stringify({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    console.log('LinkedIn access token received');

    const accessToken = response.data.access_token;
    const response2 = await axios.get('https://api.linkedin.com/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    console.log('LinkedIn userinfo retrieved:', response2.data);

    const key = `{
      kty: 'RSA',
      n: 'xNmk3vLuyFV_xnlPUpG9hKEFhCFAl56_-trCl-KTE6MSafUwbefDg6NL0xZ62mQV5-lsG_RLdL9aa4uj8I8ifZzZBSiHE1BpcRM6P35-i0LVoJpHzi0a0MihUbKPqcHobVHwA4BIpiB-4A8NIHUspC0HcIhV4JWpCBXiDAy4uAV9MNqa-RL_Z_Jc0Rrme1q78w5mFtD6ToycgLW5k_87tZzCoLpNQ1NeiHPgZG4ERAMgHFPes1uTD15oiKsvC2hSoBFlyKWSLpHJS5WpKtxQFxdCoIODdDsTy9xCVIjRhbDRtx44428hJUEuPE97nDM69uk82J_syd1Hc5IdGg-iCQ',
      e: 'AQAB',
      d: 'BghniZ-nWsNoCZShLjYiOUTYDu8X9C2c05rNuOrsN_9Y6p9ljxC5yLiB8-Ot-zBzDWr1cbvgbiEJK9-ZNB-m3nOmoQZXcWuW96yvrc96IFl5g5UG21Y9iqWDcCYJShoTvfnzYaAWWeUIDmTXsaV1q0hoAHZlL19W0VUeWuEu7hDLOMPpIrpCHmh_jcFeWuEwN6Q_AvFFz56HFsTQfWsWfbHlf6XnSk8zVJXCuqatXWIKJT8yLAA38LX5unzfrxl23BgX4uDA5PNowCzUMYqr2Ylaup3B0xM1eCFi22lkLwFx2ts0FJs01capUJmKp2Z2kzimyqDtjALxpdxAYPEZQQ',
      p: '7FWtZKGE1cp-Xjia-gnomUsCEn3TYzB8TRj5hFcFtzaJ6MlDQCluPrCViMWWsBzK9me8dbzfWTOKy0HBH3mzFfel62Kkb1Ylu-03fWTrKBpFIGYSgIFkODdNzaJ8KZfQ9mQq0QVKnSLMnlRRlX93pz-FSyb9hD6wkK44layXfHE',
      q: '1Trhg8Fb9qybELnnV4pLcH3M5YNp9hZv0Eqfj4NCDYqvyop-Igp5Rt9w0MflB0nF1EWYcKYjA0B3Nv8UGaRMR71D56JGP165dRvjYbReuG9hPEwYoHHY5DRHt9P8Q_OHrGGJj0bQJU9wymBUqmfKbdZ2GvRlA8urc28jEuf1qxk',
      dp: 'JOBRh-wz_-_yu9z1QaKeKp0rm5sKiuWb36PP-zhg6e-WoT4WQkK0sw92pbq_Aofbm4sgOvbXmuGR_Jkr-y9QJFNaDlp78ettQ9-F0wkWMFG5C48hv-9wpdzrRPTfjtXjgy6qB6ddtxsg9muNt1gGYZBlyg4xbJsjjc_BgIlHseE',
      dq: 'CO8wp86gRdOxo5_Ge7qFsq7yuOMqu27xPG8EBIVhbSPUfc4TvuVlc3zFQ1o81HNY4K4R1xZ-_RHkbN9_PhvOPmtFvxzjiKA1cRy8CEoAdgXksxwVJBPhHJ68Ko2tUkOP-b8UfnZfHlEXzsL-iS1UJAoKZNK8sM4F3w5XD-G8P3E',
      qi: 'Vql1nGgMjgiwj9Vo5nZUdAX4fzs4DHiIOjO0jwDdkFGVQuRiusU4t1uIxH-nAU9yevlEdC7x_OP3B1sQJ5RpS7NOv3o-oUA7Rc8FZe_Z-nyqo40sZe749vwSva3qA4vrnisG0RG1x6qj57ibDiLCqYhj9A3f1Y7fZ51SnnnJfIs'
    }`;
    let j = "hello world";
    const hash = base64.encode(
      createHash("sha256")
        .update(key, "utf-8")
        .update(j)
        .digest()
    );
    console.log('Generated hash:', hash);

    res.send(JSON.stringify(response2.data));
  } catch (error) {
    console.error('Error in /linkedin-callback:', {
      message: error.message,
      stack: error.stack,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data,
      } : 'No response data',
    });
    res.status(500).send('Failed to get access token.');
  }
});

// X OAuth callback
app.get('/x-callback', async (req, res) => {
  console.log('Handling /x-callback');
  const { code, verifier } = req.query;

  if (!code) {
    console.error('No authorization code received in /x-callback');
    return res.status(400).send('No authorization code received.');
  }

  console.log(`Attempting X OAuth with code: ${code}, verifier: ${verifier}`);
  try {
    console.log('X OAuth environment variables:', {
      X_REDIRECT_URI: process.env.X_REDIRECT_URI,
      X_CLIENT_ID: process.env.X_CLIENT_ID ? '[REDACTED]' : undefined,
      X_CLIENT_SECRET: process.env.X_CLIENT_SECRET ? '[REDACTED]' : undefined,
    });

    const credentials = `${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`;
    const encodedCredentials = btoa(credentials);
    const authorizationHeader = `Basic ${encodedCredentials}`;

    const response = await axios.post(
      'https://api.x.com/2/oauth2/token',
      querystring.stringify({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: process.env.X_REDIRECT_URI,
        client_id: process.env.X_CLIENT_ID,
        code_verifier: verifier,
      }),
      {
        headers: {
          'Authorization': authorizationHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    console.log('X access token received:', response.data.access_token);

    const response2 = await axios.get(
      'https://api.x.com/2/users/me?user.fields=id,name,username,created_at,description,entities,location,pinned_tweet_id,profile_image_url,protected,public_metrics,url,verified,verified_type,withheld',
      {
        headers: {
          'Authorization': `Bearer ${response.data.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log('X userinfo retrieved:', response2.data);

    res.send(JSON.stringify(response2.data));
  } catch (error) {
    console.error('Error in /x-callback:', {
      message: error.message,
      stack: error.stack,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data,
      } : 'No response data',
    });
    res.status(500).send('Failed to get access token.');
  }
});

// Shopify OAuth callback
app.get('/shopify-callback', async (req, res) => {
  console.log('Handling /shopify-callback');
  const { code } = req.query;

  if (!code) {
    console.error('No authorization code received in /shopify-callback');
    return res.status(400).send('No authorization code received.');
  }

  console.log(`Attempting Shopify OAuth with code: ${code}`);
  try {
    console.log('Shopify OAuth environment variables:', {
      SHOPIFY_SHOP_NAME: process.env.SHOPIFY_SHOP_NAME,
      SHOPIFY_CLIENT_ID: process.env.SHOPIFY_CLIENT_ID ? '[REDACTED]' : undefined,
      SHOPIFY_CLIENT_SECRET: process.env.SHOPIFY_CLIENT_SECRET ? '[REDACTED]' : undefined,
    });

    const tokenUrl = `https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/oauth/access_token`;
    const response = await axios.post(
      tokenUrl,
      {
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
        code,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    console.log('Shopify access token received:', response.data.access_token);

    const requestUrl = `https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2025-01/shop.json`;
    const response2 = await axios.get(requestUrl, {
      headers: {
        'X-Shopify-Access-Token': `${response.data.access_token}`,
        'Content-Type': 'application/json',
      },
    });
    console.log('Shopify shop info retrieved:', response2.data);

    res.send(JSON.stringify(response2.data));
  } catch (error) {
    console.error('Error in /shopify-callback:', {
      message: error.message,
      stack: error.stack,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data,
      } : 'No response data',
    });
    res.status(500).send('Failed to get access token.');
  }
});

// Send verification email
app.post('/send-verification-email', async (req, res) => {
  console.log('Handling /send-verification-email');
  const { email } = req.body;
  if (!email) {
    console.error('Email is required in /send-verification-email');
    return res.status(400).json({ error: 'Email is required' });
  }

  const code = generateCode();
  verificationCodes.set(email, code);
  console.log(`Stored verification code for ${email}: ${code}`);

  const msg = {
    to: email,
    from: 'r.pedersen@richcanvas.io',
    subject: 'Your Verification Code',
    text: `Your verification code is: ${code}`,
    html: `<p>Your verification code is: <strong>${code}</strong></p>`,
  };
 
  try {
    console.log('Sending verification email to:', email);
    //await sgMail.send(msg);
    console.log('Verification email sent successfully');
    res.json({ message: 'Verification email sent' });
  } catch (error) {
    console.error('Error sending email:', {
      message: error.message,
      stack: error.stack,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data,
      } : 'No response data',
    });
    return res.status(500).json({ error: 'Failed to send email' });
  }
});

app.post('/request-early-access', async (req, res) => {
  console.log('Handling /request-early-access');
  const { email, name } = req.body;
  if (!email || !name) {
    console.error('Email is required in /request-early-access');
    return res.status(400).json({ error: 'Email is required' });
  }


  const msg = {
    to: 'r.pedersen@richcanvas.io',
    from: 'r.pedersen@richcanvas.io',
    subject: 'Requesting early access to myorgwallet.io',
    text: `name: ${name} email: ${email}`,
    html: `name: ${name} email: ${email}`,
  };

  try {
    console.log('Sending request for early access email:');
    await sgMail.send(msg);
    console.log('early access request email sent successfully');
    res.json({ message: 'early access request email sent' });
  } catch (error) {
    console.error('Error sending email:', {
      message: error.message,
      stack: error.stack,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data,
      } : 'No response data',
    });
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// Verify code
app.post('/verify-code', (req, res) => {
  console.log('Handling /verify-code');
  const { email, code } = req.body;
  const storedCode = verificationCodes.get(email);
  console.log(`Verifying code for ${email}: provided=${code}, stored=${storedCode}`);

  if (code === storedCode) {
    console.log('Code verified successfully');
    // verificationCodes.delete(email); // Uncomment to delete after verification
    res.json({ message: 'Code verified' });
  } else {
    console.error('Invalid verification code');
    res.status(400).json({ error: 'Invalid verification code' });
  }
});

// Health check
app.get('/', (req, res) => {
  console.log('Health check endpoint called');
  res.status(200).send('🚀 Server is up and running');
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });
  res.status(500).json({ error: 'Internal Server Error' });
});

// Global uncaught exception and promise rejection handlers
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', {
    message: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', {
    reason: reason instanceof Error ? {
      message: reason.message,
      stack: reason.stack,
    } : reason,
    promise,
  });
  process.exit(1);
});

const driversLicenseStore = []
app.get('/driverslicenses', (req, res) => {
  res.json(driversLicenseStore)
})

const sessions = {}
app.get('/startsession', (req, res) => {
  const sessionId = uuidv4()
  const url = process.env.API_URL + '/session/' + sessionId

  // Expected data fields (simulate mDL data request)
  const session = {
    sessionId,
    callbackUrl: `${url}`,
    request: {
      docType: 'mDL',
      requestedItems: ['given_name', 'family_name', 'height', 'eye_colour'],
      nonce: uuidv4()
    }
  }

  sessions[sessionId] = { status: 'pending', session }
  res.json(session)
})

app.post('/session/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId
  const data = req.body


  if (!sessions[sessionId]) {
    return res.status(404).json({ error: 'Invalid session' })
  }

  sessions[sessionId].status = 'received'
  sessions[sessionId].data = data

  driversLicenseStore.push(data)

  console.log('✅ Received mDL data:', data)
  res.json({ received: true })
})

// Web3.Storage API endpoints
app.post('/api/web3storage/upload', async (req, res) => {
  console.log('Handling Web3.Storage upload request');
  
  try {
    const client = await initializeWeb3Storage();
    if (!client) {
      return res.status(500).json({ error: 'Web3.Storage not available' });
    }

    const { data, filename = 'registration.json' } = req.body;
    if (!data) {
      return res.status(400).json({ error: 'Data is required' });
    }

    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const file = new File([blob], filename);

    await client.setCurrentSpace(client.targetSpace.did());
    
    console.log('📤 Uploading test file...');
    const cid = await client.uploadFile(file);

    console.log('Successfully uploaded to Web3.Storage:', cid.toString());
    res.json({ 
      success: true, 
      cid: cid.toString(),
      url: `https://${cid.toString()}.ipfs.w3s.link`
    });
  } catch (error) {
    console.error('Error uploading to Web3.Storage:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/web3storage/download/:cid', async (req, res) => {
  console.log('Handling Web3.Storage download request');
  
  try {
    const { cid } = req.params;
    if (!cid) {
      return res.status(400).json({ error: 'CID is required' });
    }

    console.log('Downloading from Web3.Storage:', cid);
    const url = `https://${cid}.ipfs.w3s.link`;
    const response = await fetch(url);
    
    if (!response.ok) {
      return res.status(404).json({ error: 'File not found' });
    }

    const data = await response.json();
    console.log('Successfully downloaded from Web3.Storage:', cid);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error downloading from Web3.Storage:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/web3storage/credentials/save', async (req, res) => {
  console.log('Handling Web3.Storage credentials save request');
  
  try {
    const { credentials, did } = req.body;
    if (!credentials || !did) {
      return res.status(400).json({ error: 'Credentials and DID are required' });
    }

    const client = await initializeWeb3Storage();
    if (!client) {
      return res.status(500).json({ error: 'Web3.Storage not available' });
    }

    const filename = `credentials_${did}.json`;
    const blob = new Blob([JSON.stringify(credentials)], { type: 'application/json' });
    const file = new File([blob], filename);

    await client.setCurrentSpace(client.targetSpace.did());
    const cid = await client.uploadFile(file);

    console.log('Successfully saved credentials to Web3.Storage:', cid.toString());
    res.json({ 
      success: true, 
      cid: cid.toString(),
      url: `https://${cid.toString()}.ipfs.w3s.link`
    });
  } catch (error) {
    console.error('Error saving credentials to Web3.Storage:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/web3storage/credentials/:did', async (req, res) => {
  console.log('Handling Web3.Storage credentials retrieval request');
  
  try {
    const { did } = req.params;
    if (!did) {
      return res.status(400).json({ error: 'DID is required' });
    }

    // For now, we'll return empty data since we need to implement hash tracking
    // In a real implementation, you'd store the hash mapping in a database
    res.json({ success: true, data: [] });
  } catch (error) {
    console.error('Error retrieving credentials from Web3.Storage:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/web3storage/credentials/:did', async (req, res) => {
  console.log('Handling Web3.Storage credentials deletion request');
  
  try {
    const { did } = req.params;
    if (!did) {
      return res.status(400).json({ error: 'DID is required' });
    }

    // For now, we'll return success since deletion is handled client-side
    // In a real implementation, you'd track and delete the actual files
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting credentials from Web3.Storage:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper endpoint to check Web3.Storage status and available spaces
app.get('/api/web3storage/status', async (req, res) => {
  console.log('Handling Web3.Storage status request');
  
  try {
    if (!process.env.WEB3_STORAGE_EMAIL) {
      return res.json({ 
        configured: false, 
        error: 'WEB3_STORAGE_EMAIL not configured' 
      });
    }
    
    const client = await create();
    await client.login(process.env.WEB3_STORAGE_EMAIL);
    const spaces = await client.spaces();
    
    res.json({
      configured: true,
      email: process.env.WEB3_STORAGE_EMAIL,
      spaceDid: process.env.WEB3_STORAGE_SPACE_DID,
      availableSpaces: spaces.map(s => s.did()),
      targetSpaceExists: spaces.find(s => s.did() === process.env.WEB3_STORAGE_SPACE_DID) !== undefined
    });
  } catch (error) {
    console.error('Error checking Web3.Storage status:', error);
    res.status(500).json({ 
      configured: false, 
      error: error.message 
    });
  }
});

// Start the server
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log('Application startup completed');
});


