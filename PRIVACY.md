# Privacy Policy

**Crypto Trading Journal Web3 Extension**

*Last Updated: January 2026*

## Overview

The Crypto Trading Journal Web3 Extension ("Extension") is designed to facilitate secure authentication between your browser and the Crypto Trading Journal application. This privacy policy explains what data we collect, how we use it, and your rights regarding your information.

## Data We Collect

### 1. Wallet Address

- **What:** Your Ethereum wallet public address (e.g., 0x...)
- **Why:** To authenticate you and associate your trading data with your account
- **Storage:** Stored locally in your browser's extension storage and on our servers for session management
- **Retention:** Until you disconnect or clear extension data

### 2. Chain/Network Information

- **What:** The blockchain network you're connected to (e.g., Ethereum Mainnet, Polygon)
- **Why:** To ensure transactions are processed on the correct network
- **Storage:** Stored locally in browser extension storage
- **Retention:** Session-based, cleared on disconnect

### 3. Session Tokens

- **What:** Encrypted authentication tokens
- **Why:** To maintain your authenticated session without requiring repeated sign-ins
- **Storage:** Stored locally in browser extension storage
- **Retention:** 24 hours, then automatically expired

### 4. SIWE Messages

- **What:** Sign-In With Ethereum (SIWE) message signatures
- **Why:** To cryptographically verify your wallet ownership
- **Storage:** Temporarily during authentication, not persisted
- **Retention:** Verification only, not stored

## Data We Do NOT Collect

- **Private Keys:** We never access, store, or transmit your private keys
- **Seed Phrases:** We never request or access your wallet recovery phrases
- **Transaction History:** We don't read your wallet's transaction history
- **Token Balances:** We don't access your token balances unless you explicitly initiate a transaction
- **Browsing History:** We don't track websites you visit outside our application
- **Personal Information:** We don't collect names, emails, or other personal identifiers through the extension

## How We Use Your Data

1. **Authentication:** Verify your wallet ownership using cryptographic signatures
2. **Session Management:** Keep you logged in across browser sessions
3. **Network Routing:** Ensure wallet operations target the correct blockchain
4. **User Experience:** Remember your preferences (e.g., preferred network)

## Data Sharing

We do NOT sell, rent, or share your data with third parties except:

- **Service Providers:** Backend infrastructure providers who help us operate the service (bound by confidentiality agreements)
- **Legal Requirements:** When required by law or to protect our rights

## Data Security

- All communication with our servers uses HTTPS encryption
- Session tokens are cryptographically signed and time-limited
- Wallet signatures use industry-standard EIP-4361 (SIWE) protocol
- Extension follows Chrome's Manifest V3 security requirements
- Content Security Policy restricts script execution

## Your Rights

### Access & Export
You can view your connected wallet address in the extension popup at any time.

### Deletion
To remove all extension data:
1. Click the extension icon
2. Click "Disconnect"
3. Optionally, remove the extension from your browser

### Opt-Out
You can stop using the extension at any time by disconnecting or uninstalling it.

## Third-Party Wallets

This extension interacts with third-party wallet providers (e.g., MetaMask, Brave Wallet). These providers have their own privacy policies that govern how they handle your data. We recommend reviewing their policies:

- [MetaMask Privacy Policy](https://consensys.io/privacy-policy)
- [Brave Wallet Privacy](https://brave.com/privacy/browser/)

## Children's Privacy

This extension is not intended for use by individuals under 18 years of age. We do not knowingly collect data from children.

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be posted with an updated "Last Updated" date. Continued use of the extension after changes constitutes acceptance of the updated policy.

## Contact Us

If you have questions about this privacy policy or our data practices:

- **Email:** privacy@cryptotradingjournal.xyz
- **Website:** https://cryptotradingjournal.xyz

## Consent

By installing and using this extension, you consent to the data practices described in this privacy policy.

---

## Technical Details for Developers

### Permissions Requested

| Permission | Purpose |
|------------|---------|
| `storage` | Store session tokens and user preferences locally |
| `activeTab` | Inject provider script on authorized pages only |

### Host Permissions

The extension only communicates with:
- `http://localhost:3000` (development)
- `https://cryptotradingjournal.xyz` (production)
- `https://*.cryptotradingjournal.xyz` (subdomains)

### Data Flow

```
User's Wallet (MetaMask, etc.)
       ↓ (signature only, no private keys)
Extension Content Script
       ↓ (encrypted messages)
Extension Background Script
       ↓ (HTTPS)
Crypto Trading Journal API
```

No private keys ever leave your wallet. The extension only receives and forwards cryptographic signatures.
