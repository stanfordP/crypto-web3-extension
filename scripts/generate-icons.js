/**
 * Icon Generation Script - CTJ 16C Brand Mark
 *
 * Generates the Tier 1 (Micro Grid+Dot) brand mark as PNG icons.
 *
 * Run with: node scripts/generate-icons.js
 * Prerequisites: npm install canvas
 */

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const SIZES = [16, 48, 128];

// Deep Oceanic theme colors
const COLORS = {
  bg: '#0a1628',       // --cj-ocean-deepest
  gold: '#d4a854',     // --cj-gold-accent
  dot: '#2dd4bf',      // --cj-teal-light (active bridge state)
  cellOpacity: 0.6,
};

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background with rounded corners
  const cornerRadius = size * 0.1875;
  ctx.fillStyle = COLORS.bg;
  roundRect(ctx, 0, 0, size, size, cornerRadius);
  ctx.fill();

  // Grid dimensions (matching 48-unit viewBox proportions)
  // Enlarged for favicon visibility — grid fills ~70% of canvas
  const VB = 48;
  const scale = size / VB;
  const cellSize = 15 * scale;
  const gap = 4 * scale;
  const gridWidth = cellSize * 2 + gap;
  const offset = (size - gridWidth) / 2;

  // Draw 4 gold cells in a 2x2 grid
  const goldRgb = hexToRgb(COLORS.gold);
  ctx.fillStyle = `rgba(${goldRgb.r}, ${goldRgb.g}, ${goldRgb.b}, ${COLORS.cellOpacity})`;

  const cellR = 3.0 * scale; // corner radius for cells
  const positions = [
    [0, 0], [1, 0],
    [0, 1], [1, 1],
  ];

  for (const [col, row] of positions) {
    const x = offset + col * (cellSize + gap);
    const y = offset + row * (cellSize + gap);
    roundRect(ctx, x, y, cellSize, cellSize, cellR);
    ctx.fill();
  }

  // Center separator circle (background color to punch out)
  const cx = size / 2;
  const cy = size / 2;
  const sepR = 8.5 * scale;
  ctx.fillStyle = COLORS.bg;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(cx, cy, sepR, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Center dot (teal)
  const dotR = 7 * scale;
  ctx.fillStyle = COLORS.dot;
  ctx.beginPath();
  ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
  ctx.fill();

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

  console.log('\nIcon generation complete!');
  console.log('Brand mark: CTJ 16C Tier 1 (Micro Grid+Dot)');
  console.log('Colors: Deep Oceanic theme');
}

main();
