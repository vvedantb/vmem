/**
 * Generates the desktop app and tray icons into assets/. Run it with
 * `pnpm --filter @vmem/desktop icons` and commit the output: CI does not run
 * it, and macOS `iconutil` is not needed because the ICNS and ICO containers
 * are written here.
 *
 * - App icons come from apps/web/public/icon.png (white mark on black, 512 px).
 * - Tray icons are drawn from the VmemLogo SVG paths so they stay sharp at 16 px.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "../web/public/icon.png");
const out = join(root, "assets");

// Same paths as apps/chrome-extension/src/popup/_components/VmemLogo.tsx.
const MARK_PATHS = [
  "M81.3835 181.779C22.2397 161.586 13.4909 102.411 36.5078 61.7585L25.0687 36.241C-10.1246 81.7999 -19.3022 165.229 71.8802 203.249L81.3835 181.779Z",
  "M128.109 181.779C187.253 161.586 196.002 102.411 172.985 61.7585L184.424 36.241C219.617 81.7999 228.795 165.229 137.612 203.249L128.109 181.779Z",
  "M156.866 14.2622C115.857 -4.51398 93.2253 -4.72022 53.5056 13.461L63.1205 36.2163C92.2894 19.6073 110.744 19.1365 147.571 34.774L156.866 14.2622Z",
];
// Bounds of the paths, so the mark can fill the tray icon.
const MARK = { x: -10.6, y: -4.8, width: 241, height: 208 };

/** The mark as a square SVG of `size` px, with `pad` px around it. */
function markSvg(size, fill, background) {
  const pad = Math.round(size * 0.12);
  const scale = Math.min(
    (size - 2 * pad) / MARK.width,
    (size - 2 * pad) / MARK.height,
  );
  const dx = (size - MARK.width * scale) / 2 - MARK.x * scale;
  const dy = (size - MARK.height * scale) / 2 - MARK.y * scale;
  const paths = MARK_PATHS.map((d) => `<path d="${d}" fill="${fill}"/>`).join(
    "",
  );
  const bg = background
    ? `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${background}"/>`
    : "";
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}<g transform="translate(${dx} ${dy}) scale(${scale})">${paths}</g></svg>`,
  );
}

const png = (buffer) => sharp(buffer).png().toBuffer();
const appIcon = (size) =>
  sharp(source).resize(size, size, { kernel: "lanczos3" }).png().toBuffer();

/** macOS icons are not masked by the OS, so round the corners here. */
async function roundedAppIcon(size) {
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.2237}"/></svg>`,
  );
  return sharp(await appIcon(size))
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

/** ICO with PNG-compressed images (Windows Vista and later). */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

/** ICNS with PNG chunks. Types follow Apple's icon family table. */
function buildIcns(chunks) {
  const body = chunks.map(({ type, data }) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, "ascii");
    head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const total = 8 + body.reduce((sum, b) => sum + b.length, 0);
  const head = Buffer.alloc(8);
  head.write("icns", 0, "ascii");
  head.writeUInt32BE(total, 4);
  return Buffer.concat([head, ...body]);
}

await mkdir(out, { recursive: true });

await writeFile(join(out, "icon.png"), await appIcon(512));

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
await writeFile(
  join(out, "icon.ico"),
  buildIco(
    await Promise.all(
      icoSizes.map(async (size) => ({ size, data: await appIcon(size) })),
    ),
  ),
);

const icnsTypes = [
  ["icp4", 16],
  ["icp5", 32],
  ["icp6", 64],
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic11", 32],
  ["ic12", 64],
  ["ic13", 256],
  ["ic14", 512],
];
await writeFile(
  join(out, "icon.icns"),
  buildIcns(
    await Promise.all(
      icnsTypes.map(async ([type, size]) => ({
        type,
        data: await roundedAppIcon(size),
      })),
    ),
  ),
);

// Windows and Linux tray: white mark on a black tile, readable on light and dark bars.
await writeFile(join(out, "tray.png"), await png(markSvg(16, "#fff", "#000")));
await writeFile(
  join(out, "tray@2x.png"),
  await png(markSvg(32, "#fff", "#000")),
);
// macOS menu bar: black on transparent. The `Template` suffix and
// setTemplateImage(true) let macOS recolour it for light and dark bars.
await writeFile(
  join(out, "trayTemplate.png"),
  await png(markSvg(16, "#000", null)),
);
await writeFile(
  join(out, "trayTemplate@2x.png"),
  await png(markSvg(32, "#000", null)),
);
