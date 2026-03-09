/**
 * Script to generate proper PNG PWA icons from SVG.
 * Run with: node scripts/generate-icons.mjs
 */
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "icons");

mkdirSync(outDir, { recursive: true });

const sizes = [192, 512];

const svgTemplate = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#030712"/>
      <stop offset="100%" style="stop-color:#0f1729"/>
    </linearGradient>
    <linearGradient id="ring" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#06b6d4"/>
      <stop offset="100%" style="stop-color:#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.2)}" fill="url(#bg)"/>
  <circle cx="${size / 2}" cy="${size * 0.42}" r="${size * 0.18}" fill="none" stroke="url(#ring)" stroke-width="${Math.max(3, size * 0.02)}"/>
  <circle cx="${size / 2}" cy="${size * 0.42}" r="${size * 0.04}" fill="#06b6d4"/>
  <text x="${size / 2}" y="${size * 0.75}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="${size * 0.12}" font-weight="800" fill="#f1f5f9" letter-spacing="${size * 0.005}">Circuvent</text>
  <text x="${size / 2}" y="${size * 0.85}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="${size * 0.045}" font-weight="500" fill="#94a3b8" letter-spacing="${size * 0.01}">TECHNOLOGIES</text>
</svg>`;

async function generate() {
  for (const size of sizes) {
    const svg = svgTemplate(size);
    const pngBuffer = await sharp(Buffer.from(svg))
      .resize(size, size)
      .png({ quality: 100, compressionLevel: 9 })
      .toBuffer();

    const outPath = join(outDir, `icon-${size}.png`);
    writeFileSync(outPath, pngBuffer);
    console.log(`Generated: icon-${size}.png (${pngBuffer.length} bytes)`);
  }

  // Also generate favicon.ico (32x32)
  const faviconSvg = svgTemplate(32);
  const faviconBuffer = await sharp(Buffer.from(faviconSvg))
    .resize(32, 32)
    .png()
    .toBuffer();
  writeFileSync(join(__dirname, "..", "public", "favicon.ico"), faviconBuffer);
  console.log(`Generated: favicon.ico (${faviconBuffer.length} bytes)`);

  // Apple touch icon (180x180)
  const appleSvg = svgTemplate(180);
  const appleBuffer = await sharp(Buffer.from(appleSvg))
    .resize(180, 180)
    .png()
    .toBuffer();
  writeFileSync(join(outDir, "apple-touch-icon.png"), appleBuffer);
  console.log(`Generated: apple-touch-icon.png (${appleBuffer.length} bytes)`);

  console.log("\nAll icons generated successfully!");
}

generate().catch(console.error);
