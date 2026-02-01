# Coinbase Wallet Compatibility Testing

> Test plan for verifying CTJ Web3 Extension works with Coinbase Wallet browser extension.

## Overview

The extension should work with any EIP-1193 compliant wallet including Coinbase Wallet. This document outlines testing procedures and expected behavior.

## Current Wallet Detection Logic

The extension uses the following priority order for wallet selection:

1. **EIP-6963 Providers** (cleanest discovery) - filters out security extensions
2. **Rabby Wallet** (`provider.isRabby`)
3. **MetaMask** (`provider.isMetaMask && !provider.isBraveWallet`)
4. **Phantom** (`provider.isPhantom`)
5. **Brave Wallet** (`provider.isBraveWallet`)
6. **Fallback** - `window.ethereum` (generic)

Coinbase Wallet would be detected:
- Via EIP-6963 with RDNS `com.coinbase.wallet`
- As fallback `window.ethereum` if no other wallet is prioritized

## Test Environment Setup

### Prerequisites
1. Chrome or Brave browser
2. Coinbase Wallet extension installed from Chrome Web Store
3. Test wallet with Ethereum Mainnet, Polygon, or Arbitrum One
4. CTJ Extension installed (dev build or production)

### Test Seed (Optional)
For testing, you can use the standard test mnemonic:
```
abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
```
**WARNING:** Never fund this seed with real assets - it's publicly known.

## Test Cases

### TC1: Wallet Detection (Coinbase Wallet Only)

**Setup:** Only Coinbase Wallet installed (uninstall MetaMask temporarily)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open extension popup | Shows "Not Connected" state |
| 2 | Check console logs | Should see `[CryptoJournal] EIP-6963 provider discovered: Coinbase Wallet` |
| 3 | Wallet status indicator | Shows ✅ "Wallet Detected" |

### TC2: Wallet Detection (Multi-Wallet)

**Setup:** Both MetaMask and Coinbase Wallet installed

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check console logs | Should see both wallets discovered via EIP-6963 |
| 2 | Note selected wallet | MetaMask should be selected (higher priority) |
| 3 | Uninstall MetaMask | Coinbase Wallet should become active |

### TC3: Connect Flow

**Setup:** Coinbase Wallet as primary wallet

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Visit https://cryptotradingjournal.xyz/login | Page loads with "Connect Wallet" button |
| 2 | Click "Connect Wallet" | Coinbase Wallet popup appears |
| 3 | Approve connection | Extension shows "Connecting..." state |
| 4 | Complete SIWE signing | Extension shows "Connected" with address |

### TC4: SIWE Signing

**Setup:** Connected with Coinbase Wallet

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger SIWE sign | Coinbase Wallet shows signature request |
| 2 | Message displayed | Shows CTJ domain and nonce |
| 3 | Click "Sign" | Signature returned to extension |
| 4 | Verify in popup | Shows "Connected" state with correct address |

### TC5: Network Switching

**Setup:** Connected on Ethereum Mainnet

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Switch to Polygon in Coinbase Wallet | Extension detects chain change |
| 2 | Check popup network display | Shows "Polygon" |
| 3 | Switch to unsupported chain | Shows "Unsupported Network" error |

### TC6: Account Switching

**Setup:** Multiple accounts in Coinbase Wallet

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Switch to different account | Extension detects `accountsChanged` event |
| 2 | Session state | Clears existing session (requires re-auth) |
| 3 | New connection flow | Uses new account address |

### TC7: Disconnect Flow

**Setup:** Connected session

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Disconnect" in popup | Session cleared |
| 2 | Coinbase Wallet state | May remain connected (provider-level) |
| 3 | Extension popup | Shows "Not Connected" |

## Known Differences from MetaMask

| Behavior | MetaMask | Coinbase Wallet | Impact |
|----------|----------|-----------------|--------|
| EIP-6963 RDNS | `io.metamask` | `com.coinbase.wallet` | Detection works via EIP-6963 |
| Provider flags | `isMetaMask: true` | No standard flag | Falls back to EIP-6963 or generic |
| Popup behavior | In-browser popup | May open mobile app | Longer timeout may be needed |
| Deep linking | N/A | Supports coinbase:// links | Not currently used |

## Code Changes Required

### 1. Add Coinbase Wallet to Priority Detection

```typescript
// In injected-auth.ts, add to priorityOrder:
const priorityOrder = [
  (p: EthereumProvider) => p.isRabby,
  (p: EthereumProvider) => p.isMetaMask && !p.isBraveWallet,
  (p: EthereumProvider) => p.isCoinbaseWallet,  // ADD THIS
  (p: EthereumProvider) => p.isPhantom,
  (p: EthereumProvider) => p.isBraveWallet,
];
```

### 2. Add Type Definition

```typescript
interface EthereumProvider {
  // ... existing props
  isCoinbaseWallet?: boolean;
}
```

### 3. Update Wallet Name Detection (for UI)

```typescript
function getWalletName(provider: EthereumProvider): string {
  if (provider.isRabby) return 'Rabby';
  if (provider.isMetaMask) return 'MetaMask';
  if (provider.isCoinbaseWallet) return 'Coinbase Wallet';
  if (provider.isPhantom) return 'Phantom';
  if (provider.isBraveWallet) return 'Brave Wallet';
  return 'Web3 Wallet';
}
```

## Automated Test Considerations

Since Coinbase Wallet can't be easily mocked in unit tests:

1. **Unit Tests** - Mock `isCoinbaseWallet: true` flag on provider
2. **E2E Tests** - Would require Synpress-like tool with Coinbase Wallet support
3. **Manual Testing** - Required for full verification

## Test Results Template

| Test Case | Status | Notes | Date |
|-----------|--------|-------|------|
| TC1 | ⬜ | | |
| TC2 | ⬜ | | |
| TC3 | ⬜ | | |
| TC4 | ⬜ | | |
| TC5 | ⬜ | | |
| TC6 | ⬜ | | |
| TC7 | ⬜ | | |

## References

- [Coinbase Wallet SDK](https://docs.cloud.coinbase.com/wallet-sdk/docs)
- [EIP-6963: Multi Wallet Discovery](https://eips.ethereum.org/EIPS/eip-6963)
- [EIP-1193: Provider API](https://eips.ethereum.org/EIPS/eip-1193)
