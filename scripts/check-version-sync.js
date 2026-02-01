#!/usr/bin/env node
/**
 * Check version consistency between package.json and manifest.json
 * Run in CI/pre-commit to catch version mismatches early
 * 
 * Exit codes:
 *   0 - Versions match
 *   1 - Version mismatch detected
 */

const fs = require('fs');
const path = require('path');

const packagePath = path.join(__dirname, '..', 'package.json');
const manifestPath = path.join(__dirname, '..', 'manifest.json');

try {
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const manifestJson = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const packageVersion = packageJson.version;
  const manifestVersion = manifestJson.version;

  console.log(`📦 package.json version:  ${packageVersion}`);
  console.log(`📄 manifest.json version: ${manifestVersion}`);

  if (packageVersion !== manifestVersion) {
    console.error('\n❌ VERSION MISMATCH DETECTED!');
    console.error('   Run: npm run sync-version');
    console.error('   Or:  node scripts/sync-manifest-version.js');
    process.exit(1);
  }

  console.log('\n✅ Versions match - OK');
  process.exit(0);
} catch (error) {
  console.error('❌ Failed to check versions:', error.message);
  process.exit(1);
}
