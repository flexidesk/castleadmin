/**
 * PWA Icon Generator
 * Run: node scripts/generate-pwa-icons.js
 * Generates PNG icons from the SVG source at public/icons/icon.svg
 * Requires: npm install sharp (dev dependency)
 */

const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// Inline SVG as a data URL fallback — icons are generated at build time
// For production, replace public/icons/icon.svg with your actual brand icon
// and run this script once to generate all PNG sizes.

async function generateIcons() {
  try {
    const sharp = require('sharp');
    const svgPath = path?.join(__dirname, '../public/icons/icon.svg');
    const svgBuffer = fs?.readFileSync(svgPath);

    for (const size of sizes) {
      const outPath = path?.join(__dirname, `../public/icons/icon-${size}x${size}.png`);
      await sharp(svgBuffer)?.resize(size, size)?.png()?.toFile(outPath);
      console.log(`✓ Generated icon-${size}x${size}.png`);
    }
    console.log('\nAll PWA icons generated successfully!');
  } catch (err) {
    console.error('Error generating icons:', err?.message);
    console.log('Install sharp: npm install --save-dev sharp');
  }
}

generateIcons();
