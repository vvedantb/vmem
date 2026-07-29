// parse CSS color strings into Cosmos RGBA floats (channels 0–1).

const HEX_RE = /^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i;
const RGB_RE =
  /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;

function channel255(value: number): number {
  return Math.min(1, Math.max(0, value / 255));
}

function parseHex(hex: string): [number, number, number, number] | null {
  const match = HEX_RE.exec(hex.trim());
  if (!match) return null;
  const raw = match[1];
  if (raw === undefined) return null;

  if (raw.length === 3) {
    const rChar = raw.charAt(0);
    const gChar = raw.charAt(1);
    const bChar = raw.charAt(2);
    const r = Number.parseInt(rChar + rChar, 16);
    const g = Number.parseInt(gChar + gChar, 16);
    const b = Number.parseInt(bChar + bChar, 16);
    return [channel255(r), channel255(g), channel255(b), 1];
  }

  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  const a = raw.length === 8 ? Number.parseInt(raw.slice(6, 8), 16) / 255 : 1;
  return [channel255(r), channel255(g), channel255(b), a];
}

function parseRgb(value: string): [number, number, number, number] | null {
  const match = RGB_RE.exec(value.trim());
  if (!match) return null;
  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  const aRaw = match[4];
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return null;
  }
  const a = aRaw === undefined ? 1 : Number(aRaw);
  if (!Number.isFinite(a)) return null;
  return [channel255(r), channel255(g), channel255(b), a];
}

// convert `#rgb` / `#rrggbb` / `rgb()` / `rgba()` to cosmos `[r, g, b, a]` (0, 1)
export function colorToRgba(color: string): [number, number, number, number] {
  const hex = parseHex(color);
  if (hex) return hex;
  const rgb = parseRgb(color);
  if (rgb) return rgb;
  return [0.5, 0.5, 0.5, 1];
}
