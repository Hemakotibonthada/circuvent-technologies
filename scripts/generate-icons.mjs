/**
 * Script to generate proper PNG PWA icons from the Circuvent swirl logo SVG.
 * Run with: node scripts/generate-icons.mjs
 */
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "icons");
const logoSvgPath = join(__dirname, "..", "public", "logo.svg");

mkdirSync(outDir, { recursive: true });

const sizes = [192, 512];

// Read the logo SVG file
const logoSvg = readFileSync(logoSvgPath, "utf-8");

async function generate() {
  for (const size of sizes) {
    const pngBuffer = await sharp(Buffer.from(logoSvg))
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ quality: 100, compressionLevel: 9 })
      .toBuffer();

    const outPath = join(outDir, `icon-${size}.png`);
    writeFileSync(outPath, pngBuffer);
    console.log(`Generated: icon-${size}.png (${pngBuffer.length} bytes)`);
  }

  // Also generate favicon.ico (32x32)
  const faviconBuffer = await sharp(Buffer.from(logoSvg))
    .resize(32, 32, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  writeFileSync(join(__dirname, "..", "public", "favicon.ico"), faviconBuffer);
  console.log(`Generated: favicon.ico (${faviconBuffer.length} bytes)`);

  // Apple touch icon (180x180)
  const appleBuffer = await sharp(Buffer.from(logoSvg))
    .resize(180, 180, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  writeFileSync(join(outDir, "apple-touch-icon.png"), appleBuffer);
  console.log(`Generated: apple-touch-icon.png (${appleBuffer.length} bytes)`);

  console.log("\nAll icons generated successfully!");
}

generate().catch(console.error);
