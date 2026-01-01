# Crypto Trading Journal - Web3 Extension

A Manifest V3 Chrome browser extension providing secure Web3 wallet authentication for the Crypto Trading Journal application.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🔐 **SIWE Authentication** - Sign-In With Ethereum (EIP-4361)
- 🛡️ **Anti-Phishing Protection** - Only verified origins can trigger auth
- 🦊 **Multi-Wallet Support** - MetaMask, Rabby, Brave Wallet, Phantom
- 🔒 **Security Extension Compatible** - Works with Pocket Universe, Wallet Guard
- ⚡ **Service Worker Keep-Alive** - Handles MV3 inactivity timeout
- 🌐 **Multi-Network** - Ethereum, Polygon, Arbitrum, Optimism, Base, BNB

## Quick Start

### Prerequisites

- Node.js 20.x or higher
- Chrome/Brave browser
- MetaMask, Rabby, or other Web3 wallet

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/crypto-web3-extension.git
cd crypto-web3-extension

# Install dependencies
npm install

# Build for development
npm run build:dev
```

### Load in Browser

1. Open Chrome/Brave and go to `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `dist/` folder
5. Extension icon appears in toolbar

## Architecture

### How It Works

```
Main App                    Extension                     Wallet
────────                    ─────────                     ──────
    │                           │                            │
    │  1. Click "Connect"       │                            │
    │──────────────────────────►│                            │
    │                           │                            │
    │                           │  2. eth_requestAccounts    │
    │                           │───────────────────────────►│
    │                           │                            │
    │                           │  3. User approves          │
    │                           │◄───────────────────────────│
    │                           │                            │
    │                           │  4. Get SIWE challenge (API)
    │                           │                            │
    │                           │  5. personal_sign          │
    │                           │───────────────────────────►│
    │                           │                            │
    │                           │  6. User signs message     │
    │                           │◄───────────────────────────│
    │                           │                            │
    │                           │  7. Verify signature (API) │
    │                           │                            │
    │  8. Session established   │                            │
    │◄──────────────────────────│                            │
```

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| Content Script | `content.ts` | Message bridge, SIWE flow orchestration |
| Injected Script | `injected-auth.ts` | Direct wallet access (`window.ethereum`) |
| Background | `background.ts` | Session management, keep-alive |
| Popup | `popup.ts` | Status display, disconnect |

## Development

```bash
# Watch mode
npm run dev

# Production build
npm run build

# Type check
npm run type-check

# Lint
npm run lint

# Test
npm run test:unit
npm run test:coverage
```

## API Integration

The extension communicates with the main app's API:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/siwe/challenge` | POST | Get SIWE message |
| `/api/auth/siwe/verify` | POST | Verify signature |
| `/api/auth/disconnect` | POST | End session |

## Message Protocol

### Main App → Extension

```javascript
// Detect extension
window.postMessage({ type: 'CJ_CHECK_EXTENSION' }, '*')

// Connect wallet
window.postMessage({ type: 'CJ_OPEN_AUTH' }, '*')

// Get session
window.postMessage({ type: 'CJ_GET_SESSION' }, '*')

// Disconnect
window.postMessage({ type: 'CJ_DISCONNECT' }, '*')
```

### Extension → Main App

```javascript
// Extension present
{ type: 'CJ_EXTENSION_PRESENT' }

// Auth result
{ type: 'CJ_AUTH_OPENED', success: true/false, error?: string }

// Session state
{ type: 'CJ_SESSION_STATE', session: { address, chainId } | null }

// Session changed
{ type: 'CJ_SESSION_CHANGED', session: { address, chainId } | null }
```

## Security

### Anti-Phishing

- ✅ Content script only runs on allowed origins
- ✅ Origin validation before processing messages
- ✅ SIWE message shows domain (user verification in wallet)

### Allowed Origins

```json
[
  "http://localhost:3000/*",
  "http://localhost:3001/*",
  "https://cryptotradingjournal.xyz/*"
]
```

## Wallet Compatibility

| Wallet | Status | Notes |
|--------|--------|-------|
| MetaMask | ✅ Works | Full support |
| Rabby | ✅ Works | Full support |
| Brave Wallet | ✅ Works | Full support |
| Phantom | ✅ Works | EVM mode |
| Coinbase Wallet | 🔄 Untested | Should work |

## Security Extensions

The extension works seamlessly with security tools:

| Extension | Status |
|-----------|--------|
| Pocket Universe | ✅ Compatible |
| Wallet Guard | ✅ Compatible |
| Fire | ✅ Compatible |

These extensions will intercept and display our SIWE signature request, showing it's a safe "sign-in" signature.

## Extension Scope

### What This Extension Does ✅

| Feature | Purpose |
|---------|---------|
| Wallet Connection | Access `window.ethereum`, trigger connection popups |
| Message Signing | Sign SIWE messages via `personal_sign` |
| Session Storage | Persist auth in `chrome.storage.local` |
| Cross-Tab Sync | Broadcast session changes to all tabs |
| Wallet Events | Handle account/chain changes |

### What This Extension Does NOT Do ❌

| Not Our Job | Where It Belongs |
|-------------|------------------|
| Account mode (Live/Demo) | Main app's Zustand store |
| Trade data | Main app's React Query |
| UI components | Main app's React |
| User preferences | Main app's localStorage |

The extension is a **wallet bridge**, not a business logic layer.

## Troubleshooting

### Wallet Not Detected

**Symptom**: "No wallet detected" error

**Solutions**:
1. Ensure MetaMask/Rabby is installed and unlocked
2. Refresh the page and try again
3. Check if wallet is enabled for the site

### "Cannot redefine property: ethereum"

**Cause**: Multiple wallet extensions conflict

**Note**: This is NOT our bug - it's caused by Phantom/MetaMask conflict. Does not affect functionality.

### Service Worker Inactive

**Symptom**: Slow response or timeout

**Solution**: Extension has automatic retry. Wait a moment and try again.

## Project Structure

```
crypto-web3-extension/
├── src/
│   ├── scripts/
│   │   ├── content.ts        # Message handling, SIWE flow
│   │   ├── injected-auth.ts  # Wallet interactions
│   │   ├── background.ts     # Service worker
│   │   ├── popup.ts          # Popup UI
│   │   └── config.ts         # Configuration
│   ├── styles/
│   └── icons/
├── dist/                     # Built extension
├── manifest.json
└── package.json
```

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Related

- [Crypto Trading Journal (Main App)](https://github.com/your-org/crypto-futures-jn)
- [SIWE Specification (EIP-4361)](https://eips.ethereum.org/EIPS/eip-4361)
- [Chrome Extension Docs](https://developer.chrome.com/docs/extensions/)
