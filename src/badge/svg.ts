export interface BadgeOptions {
  /** Left label, e.g. "방문자". */
  title: string;
  /** Right value, e.g. "3 / 1,204". */
  value: string;
  /** Right background colour as a 3- or 6-digit hex string without '#'. */
  color?: string;
}

export const DEFAULT_TITLE = "방문자";
export const DEFAULT_COLOR = "79c83d";
export const MAX_TITLE_LENGTH = 32;

const HEX_COLOR = /^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

/** Flat badge in the style of shields.io / the original visit-counter (Verdana 11px, 20px tall). */
export function renderBadge({ title, value, color }: BadgeOptions): string {
  const leftWidth = textWidth(title);
  const rightWidth = textWidth(value);
  const width = leftWidth + rightWidth;
  const fill = `#${color && isHexColor(color) ? color : DEFAULT_COLOR}`;
  const left = escapeXml(title);
  const right = escapeXml(value);
  const leftX = (leftWidth / 2).toFixed(1);
  const rightX = (leftWidth + rightWidth / 2).toFixed(1);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${left}: ${right}">` +
    `<title>${left}: ${right}</title>` +
    `<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>` +
    `<clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>` +
    `<g clip-path="url(#r)">` +
    `<rect width="${leftWidth}" height="20" fill="#555"/>` +
    `<rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${fill}"/>` +
    `<rect width="${width}" height="20" fill="url(#s)"/>` +
    `</g>` +
    `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">` +
    `<text x="${leftX}" y="15" fill="#010101" fill-opacity=".3">${left}</text>` +
    `<text x="${leftX}" y="14">${left}</text>` +
    `<text x="${rightX}" y="15" fill="#010101" fill-opacity=".3">${right}</text>` +
    `<text x="${rightX}" y="14">${right}</text>` +
    `</g>` +
    `</svg>`
  );
}

const PADDING = 12;

/** Rough text width for Verdana 11px: wide for CJK, medium for Latin letters/digits, narrow for punctuation. */
export function textWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x1100 && (code <= 0x11ff || (code >= 0x2e80 && code <= 0xffef) || code >= 0x20000)) {
      width += 11; // Hangul / CJK / full-width
    } else if (/[0-9A-Za-z]/.test(ch)) {
      width += 6.6;
    } else if (ch === " " || ch === "/" || ch === "," || ch === ".") {
      width += 4;
    } else {
      width += 6;
    }
  }
  return Math.max(Math.round(width) + PADDING, 24);
}

export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
