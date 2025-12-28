# Claude Code Context: Crypto Web3 Extension

## Project Overview

This is a Manifest V3 Chrome browser extension that provides custom Web3 authentication for the Crypto Trading Journal application. It intercepts wallet connections and routes them through a custom API, enabling enhanced control, security, and custom authentication flows.

**Key Technologies:**
- TypeScript (strict mode)
- Webpack 5 for bundling
- Viem (v2.43.3) for Web3 utilities
- Chrome Extension APIs (Manifest V3)
- Jest for unit testing
- Playwright for E2E testing

**Supported Browsers:** Chrome, Brave, Edge, Opera (all Chromium-based)

## Project Structure

```
crypto-web3-extension/
├── src/
│   └── scripts/
│       ├── background.ts         # Service worker (main orchestrator)
│       ├── content.ts            # Content script (page injection)
│       ├── popup.ts              # Popup UI logic
│       ├── provider.ts           # EIP-1193 provider implementation
│       ├── injected-wallet.ts    # Page context wallet relay
│       ├── api.ts                # API client for backend
│       ├── config.ts             # Centralized configuration
│       ├── types.ts              # Shared TypeScript types
│       ├── sw-keepalive.ts       # Service worker keep-alive system
│       ├── sw-state.ts           # Service worker state persistence
│       ├── auth-state-machine.ts # Resumable auth flow state machine
│       ├── siwe-utils.ts         # SIWE message utilities
│       ├── logger.ts             # Logging utilities
│       ├── errors.ts             # Error types
│       └── error-reporting.ts    # Error reporting service
├── dist/                         # Compiled output (gitignored)
├── assets/                       # Icons and static assets
├── scripts/                      # Build and utility scripts
├── tests/                        # Test files
├── manifest.json                 # Extension configuration
├── webpack.config.js             # Bundler configuration
└── tsconfig.json                 # TypeScript configuration
```

## Key Architecture Components

### 1. Background Service Worker
- Long-lived background process (with MV3 limitations)
- Manages wallet connections and sessions
- Communicates with the Crypto Trading Journal API
- Handles authentication via SIWE (Sign-In With Ethereum)

### 2. Content Script
- Injected into matching web pages at `document_start`
- Injects custom EIP-1193 provider into page context
- Intercepts `window.ethereum` requests
- Forwards requests to background worker via message passing

### 3. Popup UI
- User-facing interface for connection management
- Shows connection status, wallet address, account mode
- Allows users to approve/reject connections
- Configuration and settings

### 4. Provider Implementation
- EIP-1193 compliant Ethereum provider
- Implements standard methods: `eth_requestAccounts`, `eth_accounts`, `eth_chainId`, `personal_sign`, etc.
- Type-safe request/response handling
- Event emitters for `connect`, `disconnect`, `accountsChanged`, `chainChanged`

## Important Standards & Specifications

### EIP-1193: Ethereum Provider JavaScript API
The extension must implement the standard Ethereum provider interface that dApps expect.

### EIP-6963: Multi Injected Provider Discovery
Allows multiple wallet extensions to coexist. The extension announces itself via custom events.

### EIP-4361: Sign-In With Ethereum (SIWE)
Standard authentication flow:
1. Generate SIWE challenge message
2. User signs with wallet
3. Send message + signature to API
4. API verifies and creates session
5. Return session token

## API Integration

The extension communicates with the main Crypto Trading Journal API:

**Base URLs:**
- Development: `http://localhost:3000/api` or `http://localhost:3001/api`
- Production: `https://cryptojournal.app/api`

**Key Endpoints:**
- `POST /api/auth/siwe/challenge` - Generate SIWE challenge
- `POST /api/auth/siwe/verify` - Verify signature and create session
- `GET /api/auth/session` - Validate existing session
- `POST /api/auth/disconnect` - Logout/disconnect

## Environment Configuration

The extension uses `.env.production` and `.env.development.example` files for environment-specific configuration:

- API URLs
- Extension IDs
- CORS origins
- Session duration
- Network configurations

## TypeScript Patterns

### Strict Type Safety
- `strict: true` in tsconfig.json
- No implicit any
- Strict null checks enabled
- Consistent casing enforced

### Type Organization
- Shared types in `src/types/`
- Interface over type aliases for extensibility
- Zod schemas for runtime validation (v4.2.1)
- Use Viem types for Web3 operations

### Message Passing Types
All messages between content script, background, and page context should be strongly typed.

## Build System

### Webpack Configuration
- Entry points: background.ts, content.ts, popup.ts, injected-wallet.ts
- Output: `dist/` directory
- CopyWebpackPlugin for static assets
- Development and production modes

### Build Commands
```bash
npm run build          # Production build
npm run build:dev      # Development build
npm run dev            # Watch mode
npm run build:prod     # Production with env vars
```

### Validation Commands
```bash
npm run type-check     # TypeScript type checking
npm run lint           # ESLint
npm run lint:fix       # Auto-fix linting issues
npm run validate       # Type check + lint
```

### Testing Commands
```bash
npm run test:unit      # Jest unit tests
npm run test:coverage  # Coverage report
npm run test           # Playwright E2E tests
```

## Security Considerations

### Critical Security Rules
1. **Never store private keys** - Extension only stores session tokens
2. **Use chrome.storage.local** - Not localStorage (more secure)
3. **Strict CSP** - No inline scripts, no eval()
4. **CORS validation** - API must validate extension origin
5. **Rate limiting** - Prevent spam connection attempts
6. **Single-use nonces** - For SIWE authentication
7. **Token rotation** - Implement secure token refresh

### Manifest V3 Limitations
- Background service workers may terminate after 30s inactivity
- No persistent background context
- No synchronous storage
- Must handle periodic wake-ups
- No DOM access from service worker

## Development Guidelines

### Code Style
- Match main app's TypeScript patterns
- Use ESLint rules from `.eslintrc.js`
- Clear, descriptive variable names
- Type everything explicitly
- No any types unless absolutely necessary

### Error Handling
- Wrap all async operations in try/catch
- Provide meaningful error messages
- Log errors for debugging
- Gracefully handle API failures
- Implement retry logic for transient failures

### Testing Strategy
- Unit tests for provider implementation
- Integration tests for message passing
- E2E tests for full authentication flow
- Security tests for SIWE verification
- Test with Brave Shields enabled/disabled

## Common Development Tasks

### Adding a New Provider Method
1. Add method definition to provider interface
2. Implement in wallet provider class
3. Add message handler in background worker
4. Update type definitions
5. Add unit tests
6. Update documentation

### Modifying API Integration
1. Update API client in `src/utils/api.ts` or similar
2. Update types for request/response
3. Update error handling
4. Test with both dev and prod environments
5. Update CORS configuration if needed

### Changing Manifest Permissions
1. Update `manifest.json`
2. Document why permission is needed
3. Update privacy policy
4. Test extension reload in browser
5. Prepare for Chrome Web Store review

## Browser-Specific Notes

### Brave Browser
- Has built-in crypto wallet
- Use EIP-6963 for provider coexistence
- Test with Shields enabled/disabled
- Users have stricter privacy expectations
- Fingerprinting protection may affect functionality

### Chrome/Edge/Opera
- Standard Chromium extension behavior
- Same Manifest V3 requirements
- Chrome Web Store distribution

## Version Management

```bash
npm run version:patch   # Bump patch version (1.0.0 -> 1.0.1)
npm run version:minor   # Bump minor version (1.0.0 -> 1.1.0)
npm run version:major   # Bump major version (1.0.0 -> 2.0.0)
npm run release         # Validate + test + build production
```

Versions are synced between package.json and manifest.json via `scripts/sync-manifest-version.js`.

## Related Documentation

- `WEB3_EXTENSION_GUIDE.md` - Comprehensive architecture guide
- `PRIVACY.md` - Privacy policy
- `manifest.json` - Extension configuration
- `.env.example` - Environment variable reference

## Development Workflow

1. **Local Development:**
   - Run `npm run dev` for watch mode
   - Load unpacked extension in Chrome at `chrome://extensions`
   - Enable Developer mode
   - Point to `dist/` directory

2. **Testing:**
   - Unit tests with Jest
   - E2E tests with Playwright
   - Manual testing in browser

3. **Building for Production:**
   - Run `npm run release`
   - Creates optimized build in `dist/`
   - Ready for Chrome Web Store submission

## Service Worker Keep-Alive System

The extension implements a comprehensive keep-alive system to handle Manifest V3 service worker limitations.

### Key Modules

1. **`sw-keepalive.ts`** - Core keep-alive infrastructure
   - Chrome Alarms (every 24 seconds)
   - Port-based communication for long operations
   - Operation tracking and lifecycle management
   - `withKeepAlive()` wrapper for async operations

2. **`auth-state-machine.ts`** - Resumable authentication
   - Persists auth flow state to `chrome.storage.session`
   - Allows resumption after service worker restart
   - State transitions: IDLE -> REQUESTING_ACCOUNTS -> ... -> AUTHENTICATED

### Keep-Alive Strategies

```typescript
// 1. Chrome Alarms - Periodic wake-up
chrome.alarms.create('sw-keepalive', { periodInMinutes: 0.4 });

// 2. Port Communication - Keeps SW alive during operation
const port = chrome.runtime.connect({ name: 'wallet-connection' });
port.postMessage(message);

// 3. Operation Tracking
startOperation(id, type);
// ... do work ...
completeOperation(id);

// 4. Lifetime Extension
await extendLifetime(); // Writes to storage to trigger activity
```

### Port Names
- `wallet-connection` - For SIWE authentication flow
- `long-operation` - For generic long-running operations

### Health Checks
Content script performs periodic health checks and can wake up the service worker if needed.

## Common Issues & Solutions

### Service Worker Inactive
The extension now uses multiple strategies to prevent inactivity:
- Chrome alarms every 24 seconds
- Port-based communication for long operations
- State machine for resumable authentication
- Health checks in content script

If issues persist, check:
1. `chrome://extensions` > Service Worker status
2. Console logs for keep-alive heartbeats
3. Auth state in `chrome.storage.session`

### CORS Errors
Ensure API has `chrome-extension://EXTENSION_ID` in allowed origins.

### Content Script Not Injecting
Check `matches` in manifest.json, ensure `run_at: document_start`.

### Type Errors with Chrome APIs
Install `@types/chrome` and ensure `types: ["chrome"]` in tsconfig.json.

### Authentication Flow Interrupted
If auth flow is interrupted:
1. The state machine persists progress
2. On next attempt, flow resumes from last checkpoint
3. Check `authFlowState` in `chrome.storage.session` for debugging

## Key Dependencies

- `viem` (v2.43.3) - Modern Web3 library, replaces ethers.js
- `zod` (v4.2.1) - Runtime type validation
- `buffer` (v6.0.3) - Node buffer polyfill for browser

## Notes for Claude

- Always check existing types before creating new ones
- Use Viem patterns, not ethers.js patterns
- Consider Manifest V3 service worker limitations
- Test changes in both development and production modes
- Security is critical - this handles user authentication
- Follow the project's existing patterns and conventions
- Reference WEB3_EXTENSION_GUIDE.md for architecture details
