# Crypto Web3 Extension - Deployment Guide

> **Version**: 2.0.0  
> **Last Updated**: January 1, 2026  
> **Status**: Ready for Chrome Web Store Submission

---

## 📋 Pre-Deployment Checklist

### ✅ Development Complete

| Task | Status | Notes |
|------|--------|-------|
| Core Features | ✅ Done | SIWE auth, session management, wallet detection |
| Unit Tests | ✅ Done | 310+ tests passing |
| Type Checking | ✅ Done | No TypeScript errors |
| Linting | ✅ Done | No ESLint errors |
| Production Build | ✅ Done | ~63 KB total bundle |
| Privacy Policy | ✅ Done | [PRIVACY.md](./PRIVACY.md) |
| Documentation | ✅ Done | README, CHANGELOG, Guide |

### ⚠️ Node.js Version Requirement

**IMPORTANT**: Use Node.js 20.x or 22.x LTS. Node.js 25.x has jsdom compatibility issues.

```bash
# Check current version
node -v

# Switch to LTS (using nvm)
nvm use 20
# or
nvm use 22
```

### ⏳ Before Chrome Web Store Submission

| Task | Status | Action Required |
|------|--------|-----------------|
| Use correct Node.js | ✅ Done | Node.js 20.x or 22.x LTS |
| Verify production URL | ✅ Done | `https://cryptotradingjournal.xyz` in config |
| Run full test suite | ⏳ Pending | `npm run test:unit` (with Node 20/22) |
| Configure error reporting | ⏳ Optional | Set endpoint if using error tracking |
| Generate store icons | ⏳ Pending | 440x280 promo image needed |
| Create store screenshots | ⏳ Pending | 1280x800 screenshots (min 1, max 5) |
| Prepare store description | ⏳ Pending | See template below |
| Pay developer fee | ⏳ Pending | $5 one-time fee |

---

## 🚀 Deployment Steps

### Step 1: Verify Environment

```bash
# Ensure correct Node.js version
node -v  # Should be 20.x or 22.x

# Install dependencies
npm ci

# Run validation
npm run validate
```

### Step 2: Run Tests

```bash
# Run unit tests (MUST pass before deployment)
npm run test:unit

# Optional: Run with coverage
npm run test:coverage
```

### Step 3: Build Production Package

```bash
# Clean build
npm run clean
npm run build:prod

# Verify output
ls -la dist/
# Should see: auth.js, background.js, content.js, popup.js, manifest.json, etc.
```

### Step 4: Verify Production Configuration

Check [src/scripts/config.ts](./src/scripts/config.ts):

```typescript
// These should be set correctly:
const API_URLS = {
  production: 'https://cryptotradingjournal.xyz',
  // ...
};

export const ALLOWED_ORIGINS: readonly string[] = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://cryptotradingjournal.xyz',
  'https://www.cryptotradingjournal.xyz',
  'https://*.cryptotradingjournal.xyz',
] as const;
```

### Step 5: Create ZIP Package

```bash
# Create submission package
npm run package
# or manually:
# cd dist && zip -r ../crypto-web3-extension.zip . && cd ..
```

---

## 🧪 Beta Distribution (Manual Side-loading)

Since Chrome policies block remote one-click installations from GitHub, testers must use "Developer Mode":

### 1. Preparation for Testers
Run the full release pipeline to create a clean package:
```bash
# Validates, tests, builds, and zips the extension
npm run release:full
```
The resulting ZIP will be in the project root.

### 2. Manual Installation Steps
1.  **Download** the latest `.zip` release from the GitHub repository.
2.  **Extract** the archive to a permanent folder on your machine.
3.  Open Chrome and navigate to `chrome://extensions`.
4.  Enable **"Developer mode"** (toggle in top-right corner).
5.  Click **"Load unpacked"** and select the folder where you extracted the extension.

### 3. Known Limitations for Beta
*   **No Auto-Updates:** Users must manually repeat this process for every new version.
*   **Security Warnings:** Chrome will show a "Disable developer mode extensions" dialog on startup; users must click "Keep" or close the dialog.
*   **Extension Persistence:** Developer-mode extensions may occasionally be disabled after major Chrome updates.

---

### Step 6: Chrome Web Store Submission (Official Release)

1. Go to [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Click "New Item"
3. Upload `crypto-web3-extension-v2.0.0.zip`
4. Fill in store listing details (see below)
5. Submit for review

---

## 📝 Chrome Web Store Listing

### Name
```
Crypto Trading Journal - Web3 Auth
```

### Short Description (132 chars max)
```
Secure Web3 wallet authentication for Crypto Trading Journal. Sign-In With Ethereum (SIWE) without exposing your wallet.
```

### Detailed Description
```
🔐 SECURE WEB3 AUTHENTICATION

Crypto Trading Journal Web3 Auth enables secure wallet-based authentication for the Crypto Trading Journal application.

✨ KEY FEATURES:

• Sign-In With Ethereum (SIWE) - Industry-standard authentication
• Privacy-Focused - Your wallet stays in your browser extension
• No Seed Phrase Sharing - Only signature requests, never keys
• Multi-Wallet Support - Works with MetaMask, Phantom, and more
• Anti-Phishing - Origin validation prevents malicious sites

🛡️ SECURITY:

This extension follows best practices:
• No external wallet connections to websites
• Cryptographic signature verification
• Session tokens with automatic expiry
• Origin whitelisting for approved domains only

📱 HOW IT WORKS:

1. Install the extension
2. Click "Connect" on Crypto Trading Journal
3. Approve the connection in your wallet
4. Sign the authentication message
5. You're logged in securely!

🔗 REQUIREMENTS:

• A Web3 wallet extension (MetaMask, Phantom, etc.)
• Crypto Trading Journal account

⚠️ IMPORTANT:

This extension only works with the official Crypto Trading Journal application (cryptojournal.app). It will not interact with any other websites.

📞 SUPPORT:

For issues or questions, visit our GitHub repository or contact support@cryptojournal.app
```

### Category
```
Productivity
```

### Language
```
English
```

---

## 🖼️ Required Assets

### Store Icons

| Size | File | Status |
|------|------|--------|
| 128x128 | `icons/icon-128.png` | ✅ Ready |
| 48x48 | `icons/icon-48.png` | ✅ Ready |
| 16x16 | `icons/icon-16.png` | ✅ Ready |

### Promotional Images

| Size | Purpose | Status |
|------|---------|--------|
| 440x280 | Small promo tile | ⏳ Create |
| 920x680 | Large promo tile | ⏳ Optional |
| 1400x560 | Marquee | ⏳ Optional |

### Screenshots (1280x800 or 640x400)

1. **Connection Screen** - Shows the popup with "Connect Wallet" button
2. **Signing Message** - Shows wallet signature request
3. **Connected State** - Shows logged-in status with address
4. **Auth Page** - Shows the full authentication page flow

---

## 🔧 Post-Deployment

### Monitor for Issues

1. Check Chrome Web Store developer console for crash reports
2. Monitor error reporting endpoint (if configured)
3. Watch for user reviews and feedback

### Version Updates

When releasing updates:

1. Update version in `package.json` and `manifest.json` (use `npm run sync-version`)
2. Update `CHANGELOG.md`
3. Build and test locally
4. Submit to Chrome Web Store (automatic update to users)

---

## 🔗 Related Documents

- [README.md](./README.md) - Project overview
- [WEB3_EXTENSION_GUIDE.md](./WEB3_EXTENSION_GUIDE.md) - Technical architecture
- [PRIVACY.md](./PRIVACY.md) - Privacy policy
- [CHANGELOG.md](./CHANGELOG.md) - Version history

---

## ⚙️ Production Configuration Options

### Error Reporting (Optional)

To enable error reporting, update [config.ts](./src/scripts/config.ts):

```typescript
export const FEATURES = {
  // ...
  ERROR_REPORTING: IS_PRODUCTION,
  ERROR_REPORTING_ENDPOINT: 'https://api.cryptojournal.app/api/errors/report',
};
```

### Custom API Domain

If using a different API domain:

```typescript
const API_URLS = {
  production: 'https://your-api-domain.com',
};
```

---

## 📞 Support

For deployment issues:
- GitHub Issues: [Repository Link]
- Email: support@cryptojournal.app
