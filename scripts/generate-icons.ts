/**
 * Icon Generation Script for Crypto Trading Journal Extension
 * 
 * Run with: npx ts-node scripts/generate-icons.ts
 * or: node scripts/generate-icons.js (after compilation)
 * 
 * Prerequisites: npm install sharp
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SIZES = [16, 48, 128];

// SVG template matching favicon.svg style with gold gradient
const createIconSvg = (size: number): string => `
<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="iconGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#d4af37"/>
      <stop offset="50%" stop-color="#f4e4a6"/>
      <stop offset="100%" stop-color="#c9a227"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="#0f172a" rx="6"/>
  <text x="2" y="24" font-family="Georgia,serif" font-size="26" font-weight="400" fill="url(#iconGold)">C</text>
  <text x="14" y="24" font-family="Georgia,serif" font-size="26" font-weight="400" fill="url(#iconGold)">J</text>
  <circle cx="11" cy="15" r="5" fill="none" stroke="#d4af37" stroke-width="0.8" opacity="0.6"/>
</svg>
`;

async function generateIcons() {
  const iconsDir = path.join(__dirname, '..', 'src', 'icons');
  
  // Ensure icons directory exists
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }
  
  for (const size of SIZES) {
    const svgBuffer = Buffer.from(createIconSvg(size));
    const outputPath = path.join(iconsDir, `icon-${size}.png`);
    
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    
    console.log(`Generated: icon-${size}.png`);
  }
  
  // Also copy the SVG as icon.svg
  const fullSvg = createIconSvg(128);
  fs.writeFileSync(path.join(iconsDir, 'icon.svg'), fullSvg.trim());
  console.log('Generated: icon.svg');
  
  console.log('\\nIcon generation complete!');
}

generateIcons().catch(console.error);
