# Chrome Web Store Listing Content

Use this content when submitting to the Chrome Web Store.

**Current Version:** 2.2.4  
**Last Updated:** January 30, 2026  
**Status:** Resubmission after rejection (Violation ID: Red Potassium)

---

## Extension Name
**Crypto Trading Journal - Web3 Auth**

---

## Short Description (132 characters max)
```
Web3 authentication bridge for Crypto Trading Journal. Connects your existing MetaMask/Brave wallet for passwordless sign-in (SIWE).
```

---

## What's New in v2.2.4

```
🔧 CHROME WEB STORE REVIEWER IMPROVEMENTS

• Enhanced popup status indicators for clearer extension functionality demonstration
• Added real-time wallet detection when on supported domains
• Improved guidance for reviewers: shows MetaMask requirement and domain checks
• Clearer messaging: "This is NOT a wallet" prominently displayed
• Status panel shows: Extension Active ✅, Wallet Detected, Domain Status
• Better user guidance with direct links to MetaMask and supported site
```

---

## What's New in v2.2.3

```
🔧 CHROME WEB STORE RESUBMISSION

• Clarified extension positioning: authentication bridge, NOT a wallet
• Added explicit prerequisites section (requires MetaMask or similar)
• Updated descriptions to prevent reviewer confusion
• Added comprehensive testing guide for Chrome reviewers
• Emphasized that extension bridges existing wallets, doesn't provide wallet functionality
```

---

## What's New in v2.2.1

```
🛠️ STABILITY & TESTING UPDATE

• Improved test coverage documentation
• Enhanced error recovery flows
• Updated wallet compatibility matrix
• Added rate limiting documentation
• Refined security recommendations
• Code quality improvements
```

---

## What's New in v2.2.0

```
🚀 MAJOR ARCHITECTURE UPDATE

• Improved stability and reliability
• Enhanced wallet detection (EIP-6963 support)
• Better session synchronization across tabs
• Reduced extension size
• Improved error handling and recovery
• Enhanced security extension compatibility (Pocket Universe, Wallet Guard, etc.)
```

---

## Detailed Description (For Store Listing)

```
🔐 WEB3 AUTHENTICATION BRIDGE (NOT A WALLET)

⚠️ IMPORTANT: This extension is NOT a cryptocurrency wallet. It connects your EXISTING wallet (MetaMask, Brave Wallet, etc.) to Crypto Trading Journal for secure authentication.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 PREREQUISITES

Before installing, you must have:
• MetaMask, Brave Wallet, or another EIP-1193 compatible wallet extension already installed
• An account on Crypto Trading Journal (https://cryptotradingjournal.xyz)

This extension enables passwordless Web3 authentication using the Sign-In With Ethereum (SIWE) standard.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ WHAT THIS EXTENSION DOES

• Bridges your existing wallet to Crypto Trading Journal
• Enables passwordless authentication via SIWE (EIP-4361)
• Manages secure session state across browser tabs
• Works only with cryptotradingjournal.xyz domain
• Supports multiple blockchain networks (Ethereum, Polygon, Arbitrum, etc.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ WHAT THIS EXTENSION DOES NOT DO

• Does NOT store, send, or receive cryptocurrency
• Does NOT manage private keys or seed phrases
• Does NOT provide wallet functionality
• Does NOT work standalone - requires Crypto Trading Journal website

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🛡️ SECURITY FIRST

This extension follows the highest security standards:

✓ Chrome Manifest V3 - Latest extension security model
✓ Minimal Permissions - Only requests what's absolutely necessary
✓ No Tracking - We don't collect browsing history or personal data
✓ Open Source - Transparent codebase you can audit
✓ Cryptographic Verification - All auth uses signed messages, not passwords

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 BUILT FOR CRYPTO TRADING JOURNAL

This extension enables seamless Web3 authentication for Crypto Trading Journal (https://cryptotradingjournal.xyz), the comprehensive trading journal for cryptocurrency futures and spot traders.

Track your trades, analyze performance, and improve your trading—all secured with your Web3 wallet.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔧 HOW IT WORKS

1. Install MetaMask or another wallet extension (if not already installed)
2. Install this authentication bridge extension
3. Visit cryptotradingjournal.xyz and click "Connect Wallet"
4. Approve connection in your wallet
5. Sign the authentication message (SIWE)
6. You're authenticated—no password required!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 COMPATIBLE WITH THESE WALLETS

This extension detects and works with:
• MetaMask (Recommended)
• Brave Wallet
• Coinbase Wallet
• Rabby
• Rainbow
• Any EIP-1193 compatible browser wallet extension

Note: You must install one of these wallet extensions separately first.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 PERMISSIONS EXPLAINED

• Storage: Save your session locally (never uploaded)
• Active Tab: Detect when you're on cryptotradingjournal.xyz
• Host Permissions: Only communicates with cryptotradingjournal.xyz

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🆘 SUPPORT

Questions or issues? Contact us:
• Website: https://cryptotradingjournal.xyz
• Email: support@cryptotradingjournal.xyz

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Keywords: crypto, trading, journal, web3, wallet, ethereum, SIWE, authentication, MetaMask, defi, blockchain
```

---

## Category
**Productivity** or **Developer Tools**

---

## Language
**English**

---

## Screenshots Needed

### Screenshot 1: Extension Popup (Connected State)
- Size: 1280×800 or 640×400
- Show: Extension popup with connected wallet address, network indicator, and disconnect button

### Screenshot 2: Authentication Flow  
- Size: 1280×800 or 640×400
- Show: The SIWE signature request in MetaMask alongside the app

### Screenshot 3: Login Page Integration (Optional)
- Size: 1280×800 or 640×400  
- Show: The Crypto Trading Journal login page with "Connect Wallet" button highlighted

---

## Promotional Tile (440×280) - Content Suggestions

**Text Overlay:**
- "Sign In With Your Wallet"
- "Secure • Passwordless • Web3"

**Visual Elements:**
- Wallet icon connecting to journal/chart icon
- Ethereum logo subtly in background
- Dark theme matching extension aesthetic

---

## Test Instructions for Chrome Web Store Reviewers (500 Character Limit)

**Use this exact text when submitting to Chrome Web Store:**

```
REQUIRES MetaMask extension.

TEST WALLET (no real funds):
abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about

STEPS:
1. In MetaMask: Import wallet using seed above
2. Visit https://cryptotradingjournal.xyz
3. Click "Connect Wallet" on site
4. Approve in MetaMask popup
5. Success = wallet address shown in extension popup

Extension ONLY works on cryptotradingjournal.xyz domain.
Contact: support@cryptotradingjournal.xyz
```

**Character count:** 466 characters ✅

**Notes for submission:**
- This uses the standard BIP-39 test mnemonic (no real funds at risk)
- Reviewers can import in 30 seconds vs. creating new wallet
- Extension popup will show status indicators even before connection
- Click extension icon to see: Extension Active, Wallet Detection, Domain Check

---

## Single Purpose Description (For Chrome Web Store Review)

```
This extension is an authentication bridge (NOT a wallet) for the Crypto Trading Journal web application. It connects users' existing wallet extensions (MetaMask, Brave Wallet, etc.) to enable passwordless authentication via Sign-In With Ethereum (SIWE/EIP-4361). The extension detects installed wallet extensions, facilitates the SIWE signature flow, and maintains the authenticated session. It does not provide wallet functionality—users must have a separate wallet extension already installed.
```

---

## Privacy Policy URL
```
https://stanfordp.github.io/crypto-web3-extension/
```
(After enabling GitHub Pages on the `docs` folder)

---

## Support URL
```
https://cryptotradingjournal.xyz/support
```
or
```
mailto:support@cryptotradingjournal.xyz
```
