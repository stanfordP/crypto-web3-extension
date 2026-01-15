/**
 * Package Extension for Chrome Web Store
 * 
 * Creates a .zip file ready for submission to Chrome Web Store.
 * Run: npm run package
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIST_DIR = path.join(__dirname, '..', 'dist');
const PACKAGE_DIR = path.join(__dirname, '..', 'packages');
const MANIFEST_PATH = path.join(__dirname, '..', 'manifest.json');

// Read version from manifest
function getVersion() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  return manifest.version;
}

// Ensure packages directory exists
function ensurePackageDir() {
  if (!fs.existsSync(PACKAGE_DIR)) {
    fs.mkdirSync(PACKAGE_DIR, { recursive: true });
  }
}

// Create zip file
function createPackage() {
  const version = getVersion();
  const timestamp = new Date().toISOString().split('T')[0];
  const zipName = `crypto-trading-journal-web3-v${version}-${timestamp}.zip`;
  const zipPath = path.join(PACKAGE_DIR, zipName);

  console.log('📦 Packaging extension...');
  console.log(`   Version: ${version}`);
  console.log(`   Output: ${zipName}`);

  // Check if dist exists
  if (!fs.existsSync(DIST_DIR)) {
    console.error('❌ Error: dist/ directory not found. Run `npm run build:prod` first.');
    process.exit(1);
  }

  // Ensure package dir exists
  ensurePackageDir();

  // Create zip using PowerShell (Windows) or zip command (Unix)
  const isWindows = process.platform === 'win32';
  
  try {
    if (isWindows) {
      // Use PowerShell Compress-Archive
      const psCommand = `Compress-Archive -Path "${DIST_DIR}\\*" -DestinationPath "${zipPath}" -Force`;
      execSync(`powershell -Command "${psCommand}"`, { stdio: 'inherit' });
    } else {
      // Use zip command on Unix
      execSync(`cd "${DIST_DIR}" && zip -r "${zipPath}" .`, { stdio: 'inherit' });
    }

    // Verify zip was created
    if (fs.existsSync(zipPath)) {
      const stats = fs.statSync(zipPath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      console.log('');
      console.log('✅ Package created successfully!');
      console.log(`   📁 ${zipPath}`);
      console.log(`   📊 Size: ${sizeMB} MB`);
      console.log('');
      console.log('📋 Next steps:');
      console.log('   1. Go to https://chrome.google.com/webstore/devconsole');
      console.log('   2. Click "New Item" or update existing');
      console.log('   3. Upload the .zip file');
      console.log('   4. Fill in store listing details from STORE_LISTING.md');
      console.log('   5. Submit for review');
    } else {
      throw new Error('Zip file was not created');
    }
  } catch (error) {
    console.error('❌ Error creating package:', error.message);
    process.exit(1);
  }
}

// Validate dist contents
function validateDist() {
  console.log('🔍 Validating dist contents...');
  
  const requiredFiles = [
    'manifest.json',
    'background.js',
    'content.js',
    'popup.js',
    'popup.html',
    'auth.html',
    'injected-auth.js',
    'icons/icon-16.png',
    'icons/icon-48.png',
    'icons/icon-128.png',
  ];

  const missing = [];
  for (const file of requiredFiles) {
    const filePath = path.join(DIST_DIR, file);
    if (!fs.existsSync(filePath)) {
      missing.push(file);
    }
  }

  if (missing.length > 0) {
    console.error('❌ Missing required files in dist/:');
    missing.forEach(f => console.error(`   - ${f}`));
    process.exit(1);
  }

  console.log('   All required files present ✓');
}

// Main
console.log('');
console.log('🚀 Chrome Web Store Package Builder');
console.log('====================================');
console.log('');

validateDist();
createPackage();
