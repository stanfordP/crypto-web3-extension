# Web3 Extension Test Ground

Manual testing environment for the Crypto Trading Journal browser extension.

## Overview

The test ground provides a simple web interface to test all extension functionality without needing the full crypto-futures-jn application running. It includes:

- **Test dApp** (`index.html` + `app.js`) - Interactive UI for testing wallet connections
- **Mock API Server** (`mock-api-server.js`) - Implements SIWE authentication endpoints

## Setup

### 1. Install Dependencies

```bash
cd test-ground
npm install
```

### 2. Start Mock API Server

```bash
npm start
```

The server will start on `http://localhost:3001`

For development with auto-restart:
```bash
npm run dev
```

### 3. Load Extension

1. Build the extension:
   ```bash
   cd ..
   npm run build
   ```

2. Load in Chrome/Brave:
   - Open `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `crypto-web3-extension/dist` folder

### 4. Open Test Page

Simply open `index.html` in your browser:
```bash
# From test-ground directory
open index.html  # macOS
start index.html # Windows
xdg-open index.html # Linux
```

Or drag the file into your browser window.

## Testing Workflows

### Basic Connection Flow

1. **Select Account Mode**
   - Choose "Demo" or "Live" mode
   - This simulates the trading account type selection

2. **Connect Wallet**
   - Click "Connect Wallet"
   - Extension popup should appear
   - Approve the connection request
   - Your address and network should display

3. **Sign Message**
   - Enter a custom message or use the default
   - Click "Sign Message"
   - Approve in wallet
   - Signature will be logged

4. **Send Transaction** (Optional - will fail unless on testnet)
   - Enter recipient address and amount
   - Click "Send Transaction"
   - Approve in wallet
   - Transaction hash will be logged

5. **Switch Network**
   - Select a different network from dropdown
   - Click "Switch Network"
   - Approve in wallet
   - Check Event Log for `chainChanged` event

6. **Disconnect**
   - Click "Disconnect"
   - Session should clear
   - Status should change to "Not Connected"

### Event Monitoring

The Event Log panel shows all provider events in real-time:

- `connect` - Initial provider connection
- `disconnect` - Provider disconnected
- `accountsChanged` - User switched accounts in wallet
- `chainChanged` - User switched networks

### Testing with MetaMask/Brave Wallet

The extension should coexist peacefully with other wallets via EIP-6963:

1. Install both the extension and MetaMask/Brave Wallet
2. Open the test page
3. Click "Connect Wallet"
4. You should see a choice of providers
5. Select "Crypto Trading Journal"

## Mock API Endpoints

The mock server implements these endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/siwe/challenge` | Generate SIWE message to sign |
| POST | `/api/auth/siwe/verify` | Verify signature and create session |
| GET | `/api/auth/session` | Validate existing session token |
| POST | `/api/auth/disconnect` | End session |
| GET | `/health` | Server health check |

### Example API Usage

**Generate Challenge:**
```bash
curl -X POST http://localhost:3001/api/auth/siwe/challenge \
  -H "Content-Type: application/json" \
  -d '{"address":"0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"}'
```

**Verify Signature:**
```bash
curl -X POST http://localhost:3001/api/auth/siwe/verify \
  -H "Content-Type: application/json" \
  -d '{
    "message":"...",
    "signature":"0x...",
    "accountMode":"demo"
  }'
```

**Validate Session:**
```bash
curl http://localhost:3001/api/auth/session \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Troubleshooting

### Extension not detected

- Make sure the extension is built (`npm run build`)
- Check that it's loaded in `chrome://extensions`
- Reload the extension if you made changes
- Refresh the test page

### Connection fails

- Check that the mock API server is running
- Verify console logs for errors
- Make sure wallet (MetaMask/Brave Wallet) is installed
- Check that you approved the connection request

### Provider events not firing

- Open browser console (`F12`)
- Check for JavaScript errors
- Verify extension background script is running (check `chrome://extensions` → Service Worker → Inspect)

### CORS errors

- Mock server is configured to allow all origins
- If you see CORS errors, check browser console
- May need to add specific extension ID to CORS config

## Development Tips

### Debugging Extension

1. Open extension popup → Right-click → Inspect
2. Go to `chrome://extensions` → Extension → Service Worker → Inspect
3. Check Network tab for API calls
4. Use `chrome.storage.local` inspection:
   ```javascript
   chrome.storage.local.get(null, (items) => console.log(items))
   ```

### Testing Different Scenarios

**Test Account Mode Switching:**
1. Connect with "Demo" mode
2. Disconnect
3. Connect with "Live" mode
4. Verify API receives correct `accountMode`

**Test Session Persistence:**
1. Connect wallet
2. Close extension popup
3. Open popup again
4. Should still show connected

**Test Multi-Wallet:**
1. Install MetaMask
2. Connect with MetaMask
3. Try connecting with extension
4. Should see provider selection

## Architecture

```
Test dApp (index.html)
       ↓
Provider (window.ethereum or window.cryptoJournal)
       ↓
Extension Content Script
       ↓
Extension Background Worker
       ↓
Mock API Server (localhost:3001)
```

## Next Steps

After successful testing here:

1. Implement real API endpoints in `crypto-futures-jn`
2. Update extension manifest with production domain
3. Add proper error handling for edge cases
4. Implement session refresh logic
5. Add rate limiting to real API
6. Security audit SIWE implementation

## Files

- `index.html` - Test dApp UI
- `app.js` - Test dApp logic and event handling
- `mock-api-server.js` - Express server with SIWE endpoints
- `package.json` - Dependencies
- `README.md` - This file
