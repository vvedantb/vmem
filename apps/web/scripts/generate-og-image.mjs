#!/usr/bin/env node
/**
 * Generate OG image for SEO using sharp and SVG
 * Run: node scripts/generate-og-image.mjs
 * Requires: sharp (pnpm add -D sharp)
 */

import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "../public");

const WIDTH = 1200;
const HEIGHT = 630;

async function generateOgImage() {
  // Create SVG with embedded text and styling
  const svg = `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0a0a0b"/>
          <stop offset="100%" style="stop-color:#18181b"/>
        </linearGradient>
        <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
        </pattern>
      </defs>
      
      <!-- Background -->
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <rect width="100%" height="100%" fill="url(#grid)"/>
      
      <!-- Decorative circles -->
      <circle cx="1000" cy="200" r="300" fill="rgba(99,102,241,0.08)"/>
      <circle cx="200" cy="500" r="200" fill="rgba(168,85,247,0.06)"/>
      
      <!-- Content -->
      <text x="80" y="220" font-family="Georgia, serif" font-size="72" font-style="italic" fill="white">vmem</text>
      
      <text x="80" y="320" font-family="system-ui, sans-serif" font-size="48" font-weight="600" fill="white">Memory engine for AI agents</text>
      
      <text x="80" y="390" font-family="system-ui, sans-serif" font-size="24" fill="rgba(255,255,255,0.7)">Graph storage, vector recall, and MCP-ready integrations</text>
      
      <!-- Feature pills -->
      <rect x="80" y="440" width="140" height="40" rx="20" fill="rgba(255,255,255,0.12)"/>
      <text x="110" y="467" font-family="system-ui, sans-serif" font-size="16" fill="rgba(255,255,255,0.9)">Graph Memory</text>
      
      <rect x="236" y="440" width="70" height="40" rx="20" fill="rgba(255,255,255,0.08)"/>
      <text x="255" y="467" font-family="system-ui, sans-serif" font-size="16" fill="rgba(255,255,255,0.9)">MCP</text>
      
      <rect x="322" y="440" width="100" height="40" rx="20" fill="rgba(255,255,255,0.08)"/>
      <text x="342" y="467" font-family="system-ui, sans-serif" font-size="16" fill="rgba(255,255,255,0.9)">HTTP API</text>
      
      <rect x="438" y="440" width="65" height="40" rx="20" fill="rgba(255,255,255,0.08)"/>
      <text x="455" y="467" font-family="system-ui, sans-serif" font-size="16" fill="rgba(255,255,255,0.9)">SDK</text>
      
      <!-- Domain -->
      <text x="1000" y="580" font-family="system-ui, sans-serif" font-size="18" fill="rgba(255,255,255,0.5)" text-anchor="end">vmem.vedantb.com</text>
    </svg>
  `;

  const outputPath = path.join(publicDir, "og-image.png");

  await sharp(Buffer.from(svg)).png().toFile(outputPath);
}

await generateOgImage();
