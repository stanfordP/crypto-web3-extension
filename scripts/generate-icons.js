/**
 * Icon Generation Script using canvas
 * 
 * Run with: node scripts/generate-icons.js
 * 
 * Prerequisites: npm install canvas
 */

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const SIZES = [16, 48, 128];

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Background - dark navy (#0f172a)
  ctx.fillStyle = '#0f172a';
  roundRect(ctx, 0, 0, size, size, size * 0.1875);
  ctx.fill();
  
  // Gold gradient for text
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#d4af37');
  gradient.addColorStop(0.5, '#f4e4a6');
  gradient.addColorStop(1, '#c9a227');
  
  // Text scaling
  const fontSize = size * 0.8125; // 26/32
  ctx.font = `400 ${fontSize}px Georgia, serif`;
  ctx.fillStyle = gradient;
  
  // Draw "C"
  ctx.fillText('C', size * 0.0625, size * 0.75);
  
  // Draw "J"
  ctx.fillText('J', size * 0.4375, size * 0.75);
  
  // Circle indicator
  ctx.strokeStyle = '#d4af37';
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = size * 0.025;
  ctx.beginPath();
  ctx.arc(size * 0.34375, size * 0.46875, size * 0.15625, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  
  return canvas.toBuffer('image/png');
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function main() {
  const iconsDir = path.join(__dirname, '..', 'src', 'icons');
  
  // Ensure icons directory exists
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }
  
  for (const size of SIZES) {
    const buffer = generateIcon(size);
    const outputPath = path.join(iconsDir, `icon-${size}.png`);
    fs.writeFileSync(outputPath, buffer);
    console.log(`Generated: icon-${size}.png (${buffer.length} bytes)`);
  }
  
  console.log('\\nIcon generation complete!');
}

main();
