# Security Extension Compatibility Guide

> **CTJ Web3 Extension** compatibility with popular Web3 security extensions

## Overview

CTJ Web3 Extension is designed to work alongside security extensions that protect users from phishing, malicious transactions, and other Web3 threats. This document outlines compatibility status and best practices.

## Compatibility Matrix

| Extension | RDNS | Behavior | Status | Notes |
|-----------|------|----------|--------|-------|
| **Pocket Universe** | `app.pocketuniverse` | Transaction simulation | ✅ Full | Delays sign requests for simulation |
| **Wallet Guard** | `io.walletguard` | Phishing protection | ✅ Full | May delay connect requests |
| **Fire** | `xyz.joinfire` | Transaction simulation | ✅ Full | Intercepts sign requests |
| **Blowfish** | `xyz.blowfish` | Transaction preview | ✅ Full | Pre-sign analysis |
| **Revoke.cash** | `cash.revoke` | Approval monitoring | ✅ Full | No direct interaction |

## How It Works

### Provider Detection (EIP-6963)

CTJ extension supports the [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963) multi-wallet discovery standard. This allows:

1. **Multiple providers to coexist** - CTJ, MetaMask, and security extensions can all announce themselves
2. **User choice** - Applications can present all available providers
3. **No conflicts** - Each provider has a unique identifier

```javascript
// CTJ listens for provider announcements
window.addEventListener('eip6963:announceProvider', (event) => {
  const { info, provider } = event.detail;
  console.log('Provider detected:', info.name, info.rdns);
});

// Request all providers
window.dispatchEvent(new Event('eip6963:requestProvider'));
```

### Wrapped Providers

Security extensions typically "wrap" the underlying wallet provider to intercept requests:

```
User Request → Security Extension (intercept) → Wallet Provider → Blockchain
```

CTJ handles this by:
- Detecting wrapped providers (`isWrappedBySecurityExtension`)
- Increasing timeouts to accommodate simulation delays
- Not interfering with the request chain

## Testing

### Run Compatibility Tests

```bash
# Run security extension compatibility tests
npm run test:e2e:security

# Run all E2E tests (includes security compat)
npm run test:e2e:all
```

### Manual Testing

1. **Install security extension** (e.g., Pocket Universe)
2. **Install CTJ extension**
3. **Visit test page** at `http://localhost:3001`
4. **Connect wallet** - should work with security warnings
5. **Sign message** - security extension should show simulation first

## Known Behaviors

### Pocket Universe

- Shows transaction simulation before signing
- Adds 1-3 second delay for analysis
- May block malicious transactions entirely
- **CTJ Handling**: Extended sign timeout, graceful error handling

### Wallet Guard

- Checks domain reputation on connect
- May show warning for unknown domains
- **CTJ Handling**: Extended connect timeout, allows for user confirmation

### Fire

- Provides gas estimates and simulation
- May intercept `eth_estimateGas` calls
- **CTJ Handling**: Transparent passthrough, no interference

### Blowfish

- Pre-sign transaction analysis
- Shows asset changes preview
- **CTJ Handling**: Extended sign timeout, respects user decisions

## Troubleshooting

### Issue: Connection Times Out

**Cause**: Security extension is showing a warning/approval dialog

**Solution**: 
1. Check for security extension popup
2. Approve or deny the connection
3. CTJ will receive the result once user decides

### Issue: Sign Request Fails

**Cause**: Security extension blocked a suspicious message

**Solution**:
1. Review the security warning
2. If legitimate, approve in security extension
3. If blocked correctly, investigate the sign request

### Issue: Provider Not Detected

**Cause**: Security extension may have blocked provider injection

**Solution**:
1. Check security extension settings
2. Add CTJ domain to allowlist if needed
3. Ensure extension has permission for the site

## Configuration

### Adjusting Timeouts

CTJ uses extended timeouts when security extensions are detected:

```typescript
// Default timeout
const SIGN_TIMEOUT = 60000; // 60 seconds (allows for security review)

// Rate limiting is security-extension-aware
const RATE_LIMIT_CONFIG = {
  walletOps: {
    maxTokens: 10,
    refillRate: 2,
    refillIntervalMs: 1000,
  },
};
```

### Feature Flags

Enable/disable security extension compatibility:

```typescript
// In config.ts
FEATURES: {
  SECURITY_EXTENSION_COMPAT: true, // Enable extended timeouts
  PROVIDER_WRAPPING_DETECTION: true, // Detect wrapped providers
}
```

## Best Practices

### For Users

1. **Install security extensions first** - Before CTJ extension
2. **Review all warnings** - Don't dismiss security alerts
3. **Keep extensions updated** - Both CTJ and security extensions
4. **Report issues** - Help us improve compatibility

### For Developers

1. **Use EIP-6963** - Modern provider discovery
2. **Handle delays** - Security extensions need time for analysis
3. **Don't override providers** - Coexist with security tools
4. **Test thoroughly** - Use our compatibility test suite

## Adding New Security Extension Support

To add support for a new security extension:

1. **Identify the extension**
   ```typescript
   const NEW_EXTENSION = {
     id: 'new-extension',
     rdns: 'com.newextension',
     name: 'New Extension',
   };
   ```

2. **Add to compatibility tests**
   ```typescript
   // In tests/security-compat.test.ts
   test('detects New Extension', async () => {
     // Test implementation
   });
   ```

3. **Document behavior**
   - Update this file with compatibility status
   - Note any special handling requirements

4. **Submit PR**
   - Include test results
   - Document any issues found

## Resources

- [EIP-6963 Multi-Wallet Discovery](https://eips.ethereum.org/EIPS/eip-6963)
- [EIP-1193 Provider API](https://eips.ethereum.org/EIPS/eip-1193)
- [Pocket Universe](https://pocketuniverse.app/)
- [Wallet Guard](https://walletguard.io/)
- [Fire](https://joinfire.xyz/)
- [Blowfish](https://blowfish.xyz/)

## Changelog

### v2.0.0
- Added EIP-6963 support
- Implemented security extension detection
- Extended timeouts for wrapped providers
- Created compatibility test suite
