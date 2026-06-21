/**
 * Cross-platform server bundle build script.
 * Runs esbuild + bun compile without shell quoting issues on Windows.
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = join(__dirname, '..');
const distDir = join(serverDir, 'dist');

// Step 1: esbuild bundle (use Node API to avoid shell/path issues on Windows)
const bannerJs = 'import{createRequire}from"module";const require=createRequire(import.meta.url);';
console.log('[1/2] Running esbuild...');
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/polyrader-server.js',
  external: ['better-sqlite3', 'bufferutil', 'utf-8-validate'],
  banner: { js: bannerJs },
});

// Step 2: bun compile to standalone binary
console.log('[2/2] Running bun compile...');
execFileSync('bun', ['build', '--compile', 'src/index.ts', '--outfile=dist/polyrader-server'], {
  stdio: 'inherit',
  cwd: serverDir,
  shell: process.platform === 'win32', // Need shell on Windows to find bun
});

// Verify output
const isWindows = process.platform === 'win32';
const binaryName = isWindows ? 'polyrader-server.exe' : 'polyrader-server';
const binaryPath = join(distDir, binaryName);
if (!existsSync(binaryPath)) {
  const altPath = join(distDir, 'polyrader-server');
  if (existsSync(altPath) && isWindows) {
    renameSync(altPath, binaryPath);
  } else if (!existsSync(binaryPath)) {
    console.error(`ERROR: Binary not found at ${binaryPath}`);
    process.exit(1);
  }
}
console.log(`Server binary built: ${binaryName}`);
