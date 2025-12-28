const express = require('express');
const cors = require('cors');
const { SiweMessage } = require('siwe');
const crypto = require('crypto');

const app = express();
const PORT = 3001;

// In-memory storage (replace with database in production)
const nonces = new Map(); // Map<nonce, { timestamp, used }>
const sessions = new Map(); // Map<token, { address, accountMode, expiresAt }>

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', /^chrome-extension:\/\//, /^moz-extension:\/\//],
  credentials: true
}));
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Helper function to generate nonce
function generateNonce() {
  return crypto.randomBytes(16).toString('base64');
}

// Helper function to generate session token
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Clean up expired nonces (run every minute)
setInterval(() => {
  const now = Date.now();
  const FIVE_MINUTES = 5 * 60 * 1000;

  for (const [nonce, data] of nonces.entries()) {
    if (now - data.timestamp > FIVE_MINUTES) {
      nonces.delete(nonce);
    }
  }

  console.log(`[Cleanup] Removed expired nonces. Active nonces: ${nonces.size}`);
}, 60 * 1000);

// Clean up expired sessions (run every hour)
setInterval(() => {
  const now = Date.now();

  for (const [token, data] of sessions.entries()) {
    if (now > data.expiresAt) {
      sessions.delete(token);
    }
  }

  console.log(`[Cleanup] Removed expired sessions. Active sessions: ${sessions.size}`);
}, 60 * 60 * 1000);

// ========================================
// ROUTES
// ========================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    nonces: nonces.size,
    sessions: sessions.size
  });
});

// POST /api/auth/siwe/challenge
// Generate SIWE challenge message
app.post('/api/auth/siwe/challenge', (req, res) => {
  try {
    const { address } = req.body;

    // Validate address
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({
        error: 'Invalid Ethereum address'
      });
    }

    // Generate nonce
    const nonce = generateNonce();
    nonces.set(nonce, {
      timestamp: Date.now(),
      used: false
    });

    // Create SIWE message
    const message = new SiweMessage({
      domain: 'localhost',
      address,
      statement: 'Sign in to Crypto Trading Journal',
      uri: 'http://localhost:3001',
      version: '1',
      chainId: 1,
      nonce,
      issuedAt: new Date().toISOString()
    });

    const messageString = message.prepareMessage();

    console.log(`[Challenge] Generated for ${address}, nonce: ${nonce.substring(0, 8)}...`);

    res.json({
      message: messageString,
      nonce
    });
  } catch (error) {
    console.error('[Challenge Error]', error);
    res.status(500).json({
      error: 'Failed to generate challenge',
      details: error.message
    });
  }
});

// POST /api/auth/siwe/verify
// Verify SIWE signature and create session
app.post('/api/auth/siwe/verify', async (req, res) => {
  try {
    const { message, signature, accountMode = 'live' } = req.body;

    if (!message || !signature) {
      return res.status(400).json({
        error: 'Missing message or signature'
      });
    }

    // Parse SIWE message
    const siweMessage = new SiweMessage(message);

    // Verify signature
    const result = await siweMessage.verify({ signature });

    if (!result.success) {
      console.log(`[Verify] Signature verification failed for ${siweMessage.address}`);
      return res.status(401).json({
        error: 'Invalid signature'
      });
    }

    // Check nonce
    const nonceData = nonces.get(siweMessage.nonce);
    if (!nonceData) {
      console.log(`[Verify] Unknown nonce: ${siweMessage.nonce}`);
      return res.status(401).json({
        error: 'Invalid or expired nonce'
      });
    }

    if (nonceData.used) {
      console.log(`[Verify] Nonce already used: ${siweMessage.nonce}`);
      return res.status(401).json({
        error: 'Nonce already used'
      });
    }

    // Mark nonce as used
    nonceData.used = true;

    // Generate session token
    const token = generateSessionToken();
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

    sessions.set(token, {
      address: siweMessage.address,
      accountMode,
      expiresAt,
      createdAt: Date.now()
    });

    console.log(`[Verify] Session created for ${siweMessage.address} (${accountMode} mode)`);

    res.json({
      token,
      user: {
        id: crypto.createHash('sha256').update(siweMessage.address).digest('hex').substring(0, 16),
        address: siweMessage.address,
        accountMode
      }
    });
  } catch (error) {
    console.error('[Verify Error]', error);
    res.status(500).json({
      error: 'Verification failed',
      details: error.message
    });
  }
});

// GET /api/auth/session
// Validate session token
app.get('/api/auth/session', (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Missing or invalid authorization header'
      });
    }

    const token = authHeader.substring(7);
    const session = sessions.get(token);

    if (!session) {
      console.log(`[Session] Invalid token`);
      return res.status(401).json({
        error: 'Invalid session token'
      });
    }

    if (Date.now() > session.expiresAt) {
      sessions.delete(token);
      console.log(`[Session] Expired session for ${session.address}`);
      return res.status(401).json({
        error: 'Session expired'
      });
    }

    console.log(`[Session] Valid session for ${session.address}`);

    res.json({
      valid: true,
      user: {
        id: crypto.createHash('sha256').update(session.address).digest('hex').substring(0, 16),
        address: session.address,
        accountMode: session.accountMode
      }
    });
  } catch (error) {
    console.error('[Session Error]', error);
    res.status(500).json({
      error: 'Session validation failed',
      details: error.message
    });
  }
});

// POST /api/auth/disconnect
// End session
app.post('/api/auth/disconnect', (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Missing or invalid authorization header'
      });
    }

    const token = authHeader.substring(7);
    const session = sessions.get(token);

    if (session) {
      sessions.delete(token);
      console.log(`[Disconnect] Session ended for ${session.address}`);
    }

    res.json({
      success: true
    });
  } catch (error) {
    console.error('[Disconnect Error]', error);
    res.status(500).json({
      error: 'Disconnect failed',
      details: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({
    error: 'Internal server error',
    details: err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 Mock API Server for Web3 Extension Testing');
  console.log('='.repeat(60));
  console.log(`Server running on: http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log('');
  console.log('Available endpoints:');
  console.log('  POST /api/auth/siwe/challenge - Generate SIWE challenge');
  console.log('  POST /api/auth/siwe/verify    - Verify SIWE signature');
  console.log('  GET  /api/auth/session        - Validate session');
  console.log('  POST /api/auth/disconnect     - End session');
  console.log('='.repeat(60));
});
