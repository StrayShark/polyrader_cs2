export interface ThemeTokenExpectations {
  background: string;
  foreground: string;
  primary: string;
  border: string;
  cardShadow: 'none';
  primaryButtonMinHeight: number;
  primaryException?: boolean;
}

export const CURSOR_LIGHT: ThemeTokenExpectations = {
  background: '#f7f7f4',
  foreground: '#26251e',
  primary: '#f54e00',
  border: '#e6e5e0',
  cardShadow: 'none',
  primaryButtonMinHeight: 40,
};

export const CURSOR_DARK: ThemeTokenExpectations = {
  background: '#1a1916',
  foreground: '#f7f7f4',
  primary: '#f54e00',
  border: '#3d3b34',
  cardShadow: 'none',
  primaryButtonMinHeight: 40,
};

export const CURSOR_MATRIX: ThemeTokenExpectations = {
  // Matrix keeps green primary as product exception (not Cursor Orange).
  background: '#0d1117',
  foreground: '#c9d1d9',
  primary: '#00ff41',
  border: '#30363d',
  cardShadow: 'none',
  primaryButtonMinHeight: 40,
  primaryException: true,
};

export function themeExpectations(theme: 'dark' | 'light' | 'matrix'): ThemeTokenExpectations {
  if (theme === 'light') return CURSOR_LIGHT;
  if (theme === 'matrix') return CURSOR_MATRIX;
  return CURSOR_DARK;
}

export function parseRgb(color: string): [number, number, number] | null {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

export function colorDistance(a: string, b: string): number {
  const ca = parseRgb(a);
  const cb = parseRgb(b);
  if (!ca || !cb) return 999;
  return Math.sqrt(
    (ca[0] - cb[0]) ** 2 + (ca[1] - cb[1]) ** 2 + (ca[2] - cb[2]) ** 2,
  );
}

export function isNearColor(actual: string, expected: string, tolerance = 18): boolean {
  return colorDistance(actual, expected) <= tolerance;
}

export function isShadowNone(shadow: string): boolean {
  return shadow === 'none' || shadow.trim() === '';
}
