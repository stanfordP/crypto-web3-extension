# Chrome Web Store Submission Guide

> **Extension**: Crypto Trading Journal - Web3 Auth  
> **Version**: 2.0.0  
> **Production Domain**: https://cryptotradingjournal.xyz

---

## Pre-Submission Checklist

### ✅ Technical Requirements (COMPLETED)
- [x] Manifest V3 format
- [x] Valid manifest.json structure
- [x] All required permissions documented
- [x] Content Security Policy configured
- [x] Service Worker implemented
- [x] TypeScript errors fixed
- [x] Lint errors resolved
- [x] Build passes (`npm run build:prod`)
- [x] Tests pass (`npm run test`)

### ✅ Accessibility (COMPLETED)
- [x] ARIA labels on all interactive elements
- [x] Focus indicators visible
- [x] Screen reader support (.sr-only)
- [x] Color contrast meets WCAG AA
- [x] Reduced motion support

### 🔲 Assets Required
- [ ] Extension icon 128x128 PNG
- [ ] Extension icon 48x48 PNG  
- [ ] Extension icon 16x16 PNG
- [ ] Store icon 128x128 PNG
- [ ] Promotional tile 440x280 PNG
- [ ] Screenshot 1280x800 (at least 1)
- [ ] Optional: Promotional video (YouTube)

### 🔲 Documentation Required
- [ ] Privacy Policy URL (publicly accessible)
- [ ] Support website/email
- [ ] Store description (detailed)
- [ ] Short description (132 chars max)

---

## Store Listing Content

### Short Description (132 characters max)
```
Secure Web3 wallet authentication for Crypto Trading Journal. Connect MetaMask to sign in with your Ethereum wallet.
```

### Detailed Description
```markdown
# Crypto Trading Journal - Web3 Auth Extension

Securely authenticate to Crypto Trading Journal using your Web3 wallet (MetaMask, WalletConnect, etc.) through Sign-In with Ethereum (SIWE).

## Features

🔐 **Secure Authentication**
- Sign-In with Ethereum (EIP-4361) standard
- No passwords to remember
- Cryptographic proof of wallet ownership

🛡️ **Privacy First**
- Only wallet address shared with journal
- No private keys ever leave your wallet
- All signatures local to your device
- Session data encrypted

🔗 **Seamless Integration**
- Auto-detects wallet connection
- Works with MetaMask and compatible wallets
- One-click sign in experience
- Automatic session management

## How It Works

1. Install this extension
2. Visit cryptotradingjournal.xyz
3. Click "Connect Wallet"
4. Approve connection in MetaMask
5. Sign the authentication message
6. You're logged in!

## Security

- Uses industry-standard SIWE (EIP-4361) protocol
- Message includes domain, nonce, and timestamp
- Signature cannot be replayed or forged
- Sessions expire automatically

## Support

Website: https://cryptotradingjournal.xyz
Issues: GitHub repository

## Permissions Explained

- **storage**: Save your session locally
- **activeTab**: Detect when you're on the journal site
- **alarms**: Maintain service worker for background auth

This extension only activates on cryptotradingjournal.xyz domains.
```

### Category
Select: **Productivity** (or **Developer Tools**)

### Language
English

---

## Required Assets Specifications

### Icons

| Size | Use | Requirements |
|------|-----|--------------|
| 16x16 | Browser toolbar | PNG, transparent bg |
| 48x48 | Extensions page | PNG, transparent bg |
| 128x128 | Store & install | PNG, transparent bg |

**Current icons location**: `assets/` folder

### Screenshots

**Requirements:**
- Minimum: 1 screenshot
- Maximum: 5 screenshots
- Size: 1280x800 or 640x400
- Format: PNG or JPEG

**Recommended screenshots:**
1. Wallet connection prompt
2. Signing authentication message
3. Successful login state
4. Extension popup UI

### Promotional Images

| Type | Size | Required |
|------|------|----------|
| Small tile | 440x280 | Optional |
| Marquee | 1400x560 | Optional |

---

## Privacy Policy

Your privacy policy must be publicly accessible. Here's a template URL structure:

**Recommended**: `https://cryptotradingjournal.xyz/privacy` or `/extension-privacy`

The [PRIVACY.md](./PRIVACY.md) file in this repository contains the full privacy policy content. Convert it to a hosted web page.

---

## Chrome Developer Account Setup

### 1. Register Developer Account
1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Sign in with Google account
3. Pay one-time $5 registration fee
4. Accept Developer Agreement

### 2. Verify Developer Identity
- Google may require identity verification
- This can take 24-48 hours
- Keep business documents handy if applicable

---

## Building the Submission Package

### 1. Clean Build
```bash
# Ensure clean state
rm -rf dist/
npm run clean

# Build production version
npm run build:prod
```

### 2. Create ZIP Package
```bash
# Package the dist folder
cd dist
zip -r ../crypto-web3-extension-v2.0.0.zip .
cd ..
```

**Or on Windows PowerShell:**
```powershell
Compress-Archive -Path dist\* -DestinationPath crypto-web3-extension-v2.0.0.zip
```

### 3. Verify Package Contents
The ZIP should contain:
```
crypto-web3-extension-v2.0.0.zip
├── manifest.json
├── background.js
├── content.js
├── injected-wallet.js
├── injected-auth.js
├── popup.html
├── popup.js
├── auth.html
├── auth.js
├── styles/
│   ├── popup.css
│   └── auth.css
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Submission Process

### Step 1: Upload Package
1. Go to Developer Dashboard
2. Click "New Item"
3. Upload the ZIP file
4. Wait for initial validation

### Step 2: Fill Store Listing
1. **Product Details**
   - Name: Crypto Trading Journal - Web3 Auth
   - Summary: (short description above)
   - Description: (detailed description above)
   - Category: Productivity
   - Language: English

2. **Graphic Assets**
   - Upload all icons
   - Upload screenshots
   - Add promotional images (optional)

3. **Additional Fields**
   - Website: https://cryptotradingjournal.xyz
   - Support URL/Email
   - Privacy Policy URL

### Step 3: Privacy Practices
Declare data handling:
- **Personally identifiable info**: No
- **Health info**: No
- **Financial info**: No (wallet address is not financial)
- **Authentication info**: Yes (session tokens)
- **Personal communications**: No
- **Location**: No
- **Web history**: No
- **User activity**: Limited (login events)

### Step 4: Distribution
- **Visibility**: Public
- **Geographic regions**: All regions (or restrict if needed)

### Step 5: Submit for Review
1. Click "Submit for Review"
2. Google typically reviews within 1-3 business days
3. May take longer for first submission

---

## Domain Name ✅

Your domain `cryptotradingjournal.xyz` perfectly matches the extension name "Crypto Trading Journal - Web3 Auth". This alignment eliminates any reviewer concerns about domain ownership or name mismatch.

---

## Post-Submission Monitoring

### Review Status
- **Pending Review**: Normal, wait 1-3 days
- **Needs Action**: Review feedback, make changes
- **Rejected**: Read reason, fix issues, resubmit
- **Published**: 🎉 Live on store!

### Common Rejection Reasons

1. **Missing Privacy Policy** → Host at public URL
2. **Excessive Permissions** → Justify each permission
3. **Misleading Description** → Match actual functionality
4. **Low Quality** → Add screenshots, better descriptions
5. **Policy Violations** → Review Chrome Web Store policies

---

## Updates & Maintenance

### Updating the Extension
1. Increment version in `manifest.json` and `package.json`
2. Update `CHANGELOG.md`
3. Build new ZIP
4. Upload to Developer Dashboard
5. Submit for review (usually faster)

### Version Strategy
- **Patch** (2.0.1): Bug fixes
- **Minor** (2.1.0): New features
- **Major** (3.0.0): Breaking changes

---

## Useful Links

- [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- [Manifest V3 Documentation](https://developer.chrome.com/docs/extensions/mv3/)
- [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/)
- [Publishing Extensions](https://developer.chrome.com/docs/webstore/publish/)
- [SIWE Standard (EIP-4361)](https://eips.ethereum.org/EIPS/eip-4361)

---

## Quick Commands Reference

```bash
# Full validation
npm run validate

# Build production
npm run build:prod

# Run all tests
npm run test

# Create package (PowerShell)
Compress-Archive -Path dist\* -DestinationPath crypto-web3-extension-v2.0.0.zip

# Create package (bash)
cd dist && zip -r ../crypto-web3-extension-v2.0.0.zip . && cd ..
```

---

*Last Updated: December 2024*
