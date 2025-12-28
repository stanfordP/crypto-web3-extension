# Web3 Authentication Extension - Architecture Guide

## Overview

This browser extension provides a custom Web3 authentication layer that routes wallet connections through your Crypto Trading Journal application's API. It acts as an intermediary between users' wallets (MetaMask, Rabby, etc.) and your application, enabling enhanced control, security, and custom authentication flows.

**Supported Browsers:**
- Chrome/Chromium (Manifest V3)
- Brave Browser (Chromium-based, full compatibility)
- Edge (Chromium-based)
- Opera (Chromium-based)

**Tech Stack:**
- TypeScript (matching main app)
- Webpack for bundling
- ethers.js for Web3 utilities
- Chrome Extension APIs (Manifest V3)

## Why Build a Custom Extension?

### Benefits

1. **Full Control Over Authentication Flow**
   - Intercept and validate all wallet connection requests
   - Add custom approval/rejection logic
   - Implement transaction limits or spending controls
   - Add compliance checks before allowing connections

2. **Enhanced Security**
   - Audit all Web3 requests before they reach your app
   - Add rate limiting per wallet address
   - Detect and block suspicious transactions
   - Implement multi-signature requirements

3. **Privacy & Data Control**
   - Trading data never leaves your infrastructure
   - No reliance on third-party wallet analytics
   - Control what data is shared with your backend

4. **Custom User Experience**
   - Unified authentication across multiple wallets
   - Custom approval UI tailored to trading workflows
   - Add contextual information (e.g., gas estimates, trade limits)
   - Session management with your app's API

### Trade-offs

**Advantages:**
- ✅ Complete control over Web3 integration
- ✅ Can add features impossible with standard wallets
- ✅ Enhanced security and compliance options
- ✅ Unified UX across different wallet types
- ✅ Works in Brave's privacy-focused environment

**Disadvantages:**
- ❌ Significant development and maintenance effort
- ❌ Users must install your extension (adoption friction)
- ❌ Requires security audits and ongoing updates
- ❌ Chrome Web Store approval process (also submit to Brave/Edge stores)
- ❌ Must support Manifest V3 (current standard)

## Architecture Overview

### Component Interaction Flow

```
User's Wallet (MetaMask/Rabby)
         ↓
Browser Extension (Custom Provider)
         ↓
Content Script (Injects Provider)
         ↓
Your dApp Frontend
         ↓
Extension Background Worker
         ↓
Your API (crypto-futures-jn)
         ↓
Supabase Database
```

### Key Components

1. **Manifest V3 Configuration** (`manifest.json`)
   - Defines extension permissions and structure
   - Service worker registration
   - Content script injection rules

2. **Content Script** (`scripts/content.ts`)
   - Injects custom EIP-1193 provider into page context
   - Intercepts `window.ethereum` requests
   - Forwards requests to background worker

3. **Background Service Worker** (`scripts/background.ts`)
   - Long-lived background process
   - Communicates with your API
   - Manages wallet connections and sessions
   - Handles signing requests

4. **Popup UI** (`popup.html` + `scripts/popup.ts`)
   - User-facing interface for approvals
   - Connection management
   - Settings and configuration

5. **Provider Implementation** (`scripts/provider.ts`)
   - EIP-1193 compliant Ethereum provider
   - Type-safe request/response handling

6. **API Integration** (`scripts/api.ts`)
   - RESTful endpoints on your main app
   - Authentication via SIWE (Sign-In With Ethereum)
   - Session management
   - Trade data synchronization

## Standards & Specifications

### EIP-1193: Ethereum Provider JavaScript API

The standard interface for Ethereum providers in browsers. Your extension must implement:

```typescript
interface EthereumProvider {
  // Send a request to the provider
  request(args: RequestArguments): Promise<unknown>

  // Event listeners
  on(event: string, listener: (...args: unknown[]) => void): Provider
  removeListener(event: string, listener: (...args: unknown[]) => void): Provider

  // Chain ID (hex string)
  chainId: string

  // Connected accounts
  selectedAddress: string | null
}

interface RequestArguments {
  method: string
  params?: unknown[]
}

// Standard events to emit
type ProviderEvents =
  | { type: 'connect'; chainId: string }
  | { type: 'disconnect'; error: ProviderRpcError }
  | { type: 'accountsChanged'; accounts: string[] }
  | { type: 'chainChanged'; chainId: string }
```

**Common Methods to Implement:**
- `eth_requestAccounts` - Request wallet connection
- `eth_accounts` - Get connected accounts
- `eth_chainId` - Get current chain ID
- `eth_sendTransaction` - Send transaction
- `personal_sign` - Sign message
- `eth_signTypedData_v4` - Sign typed data (for SIWE)

### EIP-6963: Multi Injected Provider Discovery

Allows multiple wallet extensions to coexist without conflicts. Recommended for production.

```typescript
interface EIP6963ProviderInfo {
  uuid: string
  name: string
  icon: string
  rdns: string // Reverse DNS (e.g., "com.cryptojournal.wallet")
}

interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo
  provider: EthereumProvider
}

// Announce your provider
window.dispatchEvent(
  new CustomEvent('eip6963:announceProvider', {
    detail: {
      info: {
        uuid: crypto.randomUUID(),
        name: 'Crypto Trading Journal Wallet',
        icon: 'data:image/svg+xml,...',
        rdns: 'com.cryptojournal.wallet'
      },
      provider: customProvider
    } as EIP6963ProviderDetail
  })
)

// Listen for discovery requests
window.addEventListener('eip6963:requestProvider', () => {
  // Re-announce provider
})
```

### SIWE (EIP-4361): Sign-In With Ethereum

Standard for authenticating with Ethereum accounts. Your API should implement SIWE verification.

**Flow:**
1. Extension generates SIWE message
2. User signs message with wallet
3. Extension sends message + signature to your API
4. API verifies signature and creates session
5. API returns session token

```typescript
interface SiweMessage {
  domain: string
  address: string
  statement: string
  uri: string
  version: string
  chainId: number
  nonce: string
  issuedAt: string
  expirationTime?: string
}
```

## API Integration Architecture

### Required API Endpoints

Your main app (`crypto-futures-jn`) should expose these endpoints:

#### 1. Generate SIWE Challenge
```typescript
// POST /api/auth/siwe/challenge
interface ChallengeRequest {
  address: string
}

interface ChallengeResponse {
  message: string  // SIWE message to sign
  nonce: string    // One-time nonce
}
```

#### 2. Verify SIWE Signature
```typescript
// POST /api/auth/siwe/verify
interface VerifyRequest {
  message: string
  signature: string
}

interface VerifyResponse {
  token: string    // JWT or session token
  user: {
    id: string
    address: string
    accountMode: 'demo' | 'live'
  }
}
```

#### 3. Validate Session
```typescript
// GET /api/auth/session
// Headers: { Authorization: "Bearer <token>" }
interface SessionResponse {
  valid: boolean
  user: {
    id: string
    address: string
    accountMode: 'demo' | 'live'
  }
}
```

#### 4. Disconnect/Logout
```typescript
// POST /api/auth/disconnect
// Headers: { Authorization: "Bearer <token>" }
interface DisconnectResponse {
  success: boolean
}
```

#### 5. Submit Signed Transaction (Optional)
```typescript
// POST /api/trades/submit
// Headers: { Authorization: "Bearer <token>" }
interface SubmitTradeRequest {
  txHash: string
  tradeData: {
    pair: string
    side: 'long' | 'short'
    entryPrice: number
    size: number
    leverage: number
  }
}

interface SubmitTradeResponse {
  tradeId: string
  status: 'pending' | 'confirmed'
}
```

### Security Considerations

1. **CORS Configuration**
   - Your API must allow requests from `chrome-extension://<extension-id>`
   - Use strict origin validation
   - For Brave: Same CORS rules apply (Chromium-based)

2. **Rate Limiting**
   - Implement per-address rate limits
   - Prevent spam connection attempts
   - Use IP + wallet address combination

3. **Nonce Management**
   - Single-use nonces for SIWE
   - Expire after 5-10 minutes
   - Store in Redis or database

4. **Token Storage**
   - Store session tokens in `chrome.storage.local` (not localStorage)
   - Never store private keys
   - Use secure token rotation

5. **Content Security Policy**
   - Strict CSP in manifest
   - No inline scripts
   - No eval() or Function()

## TypeScript Configuration

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM"],
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["chrome", "node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Type Definitions

Install Chrome types:
```bash
npm install --save-dev @types/chrome @types/node
```

## Development Workflow

### Phase 1: Basic Extension Setup
1. Create manifest.json with minimal permissions
2. Implement basic content script that logs requests
3. Create popup UI for connection status
4. Test loading in Chrome/Brave DevTools

### Phase 2: Provider Implementation
1. Implement EIP-1193 provider interface (TypeScript)
2. Forward `eth_requestAccounts` to background worker
3. Add type-safe message passing between content script and background
4. Test with simple dApp (e.g., connect button)

### Phase 3: API Integration
1. Implement SIWE challenge/verify endpoints in main app
2. Add authentication flow to background worker
3. Store session tokens in chrome.storage
4. Test full authentication cycle

### Phase 4: Advanced Features
1. Add support for multiple wallets (EIP-6963)
2. Implement transaction approval UI
3. Add error handling and retry logic
4. Load testing and security audit

### Phase 5: Distribution
1. Create Chrome Web Store listing
2. Submit to Brave Browser Web Store (optional but recommended)
3. Prepare privacy policy and terms
4. Submit for review
5. Set up auto-update mechanism

## Testing Strategy

### Unit Tests (Jest + TypeScript)
```typescript
// __tests__/provider.test.ts
import { CustomProvider } from '../src/scripts/provider'

describe('CustomProvider', () => {
  it('should implement EIP-1193 interface', () => {
    const provider = new CustomProvider()
    expect(provider.request).toBeDefined()
    expect(provider.on).toBeDefined()
  })

  it('should handle eth_requestAccounts', async () => {
    const provider = new CustomProvider()
    const accounts = await provider.request({
      method: 'eth_requestAccounts'
    })
    expect(Array.isArray(accounts)).toBe(true)
  })
})
```

### Integration Tests
- Content script injection
- Message passing between components
- API authentication flow

### E2E Tests (Playwright)
```typescript
// e2e/extension.spec.ts
import { test, expect, chromium } from '@playwright/test'
import path from 'path'

test('should load extension and connect wallet', async () => {
  const pathToExtension = path.join(__dirname, '../dist')
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`
    ]
  })

  const page = await context.newPage()
  await page.goto('http://localhost:3000')

  // Click connect wallet button
  await page.click('[data-testid="connect-wallet"]')

  // Verify connection
  await expect(page.locator('[data-testid="wallet-address"]')).toBeVisible()
})
```

### Security Testing
- SIWE signature verification
- Token expiration handling
- Rate limit enforcement
- XSS/injection attack vectors
- Content Security Policy validation

## Manifest V3 Requirements

Chrome and Brave extensions must use Manifest V3 (V2 deprecated as of 2024).

**Key Differences from V2:**
- Background pages → Service workers
- No persistent background context
- `chrome.action` instead of `browser_action`
- Host permissions separated from regular permissions
- Content scripts must use `declarativeContent` for dynamic injection

**Service Worker Limitations:**
- No DOM access
- No synchronous storage
- May terminate after 30 seconds of inactivity
- Must handle periodic wake-ups

## Browser-Specific Considerations

### Brave Browser

**Shields Compatibility:**
- Test with Brave Shields enabled/disabled
- Ensure extension works with ad/tracker blocking
- Handle fingerprinting protection gracefully

**Built-in Wallet:**
- Brave has a native crypto wallet
- Use EIP-6963 to coexist peacefully
- Don't override Brave Wallet unless user explicitly chooses

**Distribution:**
- Can use Chrome Web Store (Brave supports Chrome extensions)
- Optional: Submit to Brave Web Store for better visibility
- Brave users may have stricter privacy expectations

## Deployment Checklist

- [ ] Manifest V3 compliant
- [ ] TypeScript compilation succeeds with no errors
- [ ] All permissions justified in privacy policy
- [ ] Icons in required sizes (16x16, 48x48, 128x128)
- [ ] Content Security Policy configured
- [ ] No external code dependencies (bundle all libraries)
- [ ] Error tracking implemented
- [ ] API rate limiting configured
- [ ] SIWE implementation audited
- [ ] User data handling documented
- [ ] Chrome Web Store screenshots and description
- [ ] Brave Browser compatibility tested
- [ ] Privacy policy URL in manifest
- [ ] Support email provided

## File Structure

```
crypto-web3-extension/
├── src/
│   ├── scripts/
│   │   ├── background.ts          # Service worker
│   │   ├── content.ts             # Injected into web pages
│   │   ├── popup.ts               # Popup UI logic
│   │   ├── provider.ts            # EIP-1193 provider implementation
│   │   ├── api.ts                 # API client
│   │   └── types.ts               # Shared TypeScript types
│   ├── styles/
│   │   └── popup.css              # Popup styling
│   └── assets/
│       ├── icon-16.png
│       ├── icon-48.png
│       └── icon-128.png
├── dist/                           # Compiled output (gitignored)
├── __tests__/
│   ├── provider.test.ts
│   └── api.test.ts
├── manifest.json                   # Extension configuration
├── popup.html                      # Popup UI
├── package.json                    # Dependencies
├── tsconfig.json                   # TypeScript config
├── webpack.config.js               # Bundler configuration
├── .eslintrc.js                    # ESLint config (match main app)
├── README.md                       # Setup instructions
└── WEB3_EXTENSION_GUIDE.md        # This file
```

## Environment Variables (Main App)

Add to `crypto-futures-jn/.env.local`:

```bash
# Extension API Configuration
NEXT_PUBLIC_EXTENSION_API_URL=http://localhost:3000/api
EXTENSION_ALLOWED_ORIGINS=chrome-extension://YOUR_EXTENSION_ID

# SIWE Configuration
SIWE_DOMAIN=localhost
SIWE_URI=http://localhost:3000
SIWE_SESSION_DURATION=86400  # 24 hours in seconds

# CORS for extension
NEXT_PUBLIC_ALLOWED_ORIGINS=chrome-extension://YOUR_EXTENSION_ID
```

## Recommended Libraries

### Extension Development
```json
{
  "dependencies": {
    "ethers": "^6.9.0",
    "siwe": "^2.1.4"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.256",
    "@types/node": "^20.10.0",
    "typescript": "^5.3.3",
    "webpack": "^5.89.0",
    "webpack-cli": "^5.1.4",
    "ts-loader": "^9.5.1",
    "copy-webpack-plugin": "^11.0.0"
  }
}
```

### Main App API
```json
{
  "dependencies": {
    "siwe": "^2.1.4",
    "jose": "^5.1.3",
    "zod": "^3.22.4"
  }
}
```

## Next Steps

1. ✅ Review this guide thoroughly
2. ⏳ Implement extension files (manifest, scripts, UI)
3. ⏳ Set up required API endpoints in `crypto-futures-jn`
4. ⏳ Test extension locally in Chrome/Brave
5. ⏳ Iterate on features and security
6. ⏳ Plan Chrome Web Store submission

## Resources

- [Chrome Extensions Documentation](https://developer.chrome.com/docs/extensions/)
- [Brave Browser Extension Support](https://support.brave.com/hc/en-us/articles/360017909112-How-can-I-add-extensions-to-Brave-)
- [Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [EIP-1193 Specification](https://eips.ethereum.org/EIPS/eip-1193)
- [EIP-6963 Specification](https://eips.ethereum.org/EIPS/eip-6963)
- [SIWE Specification](https://eips.ethereum.org/EIPS/eip-4361)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [ethers.js Documentation](https://docs.ethers.org/)
- [wagmi Documentation](https://wagmi.sh) - For main app integration

---

**Document Version**: 1.0
**Last Updated**: December 27, 2025
**Related Project**: crypto-futures-jn (Next.js Trading Journal)
**Language**: TypeScript
**Supported Browsers**: Chrome, Brave, Edge, Opera (Chromium-based)
