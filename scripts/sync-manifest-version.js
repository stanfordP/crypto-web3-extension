/**
 * Sync manifest.json version with package.json version
 * Run after npm version commands
 */

const fs = require('fs');
const path = require('path');

const packagePath = path.join(__dirname, '..', 'package.json');
const manifestPath = path.join(__dirname, '..', 'manifest.json');

try {
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const manifestJson = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const newVersion = packageJson.version;
  const oldVersion = manifestJson.version;

  if (newVersion !== oldVersion) {
    manifestJson.version = newVersion;
    fs.writeFileSync(manifestPath, JSON.stringify(manifestJson, null, 2) + '\n');
    console.log(`✅ Updated manifest.json version: ${oldVersion} → ${newVersion}`);
  } else {
    console.log(`ℹ️ manifest.json version already matches: ${newVersion}`);
  }
} catch (error) {
  console.error('❌ Failed to sync versions:', error.message);
  process.exit(1);
}
