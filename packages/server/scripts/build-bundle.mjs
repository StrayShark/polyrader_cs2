/**
 * Cross-platform server bundle build script.
 * Runs esbuild + bun compile without shell quoting issues on Windows.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = join(__dirname, '..');
const distDir = join(serverDir, 'dist');

// Step 1: esbuild bundle (use array form to avoid shell quoting issues)
const bannerJs = 'import{createRequire}from"module";const require=createRequire(import.meta.url);';
const esbuildArgs = [
  'src/index.ts',
  '--bundle',
  '--platform=node',
  '--format=esm',
  '--outfile=dist/polyrader-server.js',
  '--external:better-sqlite3',
  '--external:bufferutil',
  '--external:utf-8-validate',
  `--banner:js=${bannerJs}`,
];
console.log('[1/2] Running esbuild...');
execFileSync('esbuild', esbuildArgs, { stdio: 'inherit', cwd: serverDir });

// Step 2: bun compile to standalone binary
console.log('[2/2] Running bun compile...');
execFileSync('bun', ['build', '--compile', 'src/index.ts', '--outfile=dist/polyrader-server'], {
  stdio: 'inherit',
  cwd: serverDir,
});

// Verify output
const isWindows = process.platform === 'win32';
const binaryName = isWindows ? 'polyrader-server.exe' : 'polyrader-server';
const binaryPath = join(distDir, binaryName);
if (!existsSync(binaryPath)) {
  // On some platforms bun may output without .exe extension on Windows
  const altPath = join(distDir, 'polyrader-server');
  if (existsSync(altPath) && isWindows) {
    renameSync(altPath, binaryPath);
  } else if (!existsSync(binaryPath)) {
    console.error(`ERROR: Binary not found at ${binaryPath}`);
    process.exit(1);
  }
}
console.log(`Server binary built: ${binaryName}`);
