#!/usr/bin/env node
/**
 * Generates PNG PWA icons from the SVG source.
 * Run: node scripts/generate-pwa-icons.js
 * Requires: npm install sharp (dev dependency)
 */

const fs = require('fs');
const path = require('path');

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const SVG_PATH = path.join(__dirname, '../public/icons/icon.svg');
const OUT_DIR = path.join(__dirname, '../public/icons');

async function generate() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.log('sharp not available — skipping PNG generation');
    return;
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const svgBuffer = fs.readFileSync(SVG_PATH);

  for (const size of SIZES) {
    const outPath = path.join(OUT_DIR, `icon-${size}x${size}.png`);
    await sharp(svgBuffer).resize(size, size).png().toFile(outPath);
    console.log(`✓ Generated ${outPath}`);
  }

  console.log('PWA icons generated successfully.');
}

generate().catch(console.error);
