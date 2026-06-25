/**
 * Centralized environment variable validation.
 * Validates all required env vars at startup and fails fast if critical ones are missing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_VARS = [
  { name: 'PORT', defaultValue: '3001' },
  { name: 'NODE_ENV', defaultValue: 'development' },
] as const;

const OPTIONAL_VARS = [
  'CORS_ORIGIN',
  'POLYRADER_ENCRYPTION_KEY',
  'ENCRYPTION_KEY',
  'DATABASE_URL',
  'POLYRADER_DATA_DIR',
  'POLYMARKET_GAMMA_API_URL',
  'POLYMARKET_CLOB_API_URL',
  'POLYMARKET_DATA_API_URL',
  'POLYMARKET_WS_URL',
  'POLYMARKET_ADDRESS',
  'POLYMARKET_FUNDER',
  'POLYMARKET_API_KEY',
  'POLYMARKET_API_SECRET',
  'POLYMARKET_API_PASSPHRASE',
  'POLYGON_RPC_URL',
  'OPENAI_BASE_URL',
  'ANTHROPIC_BASE_URL',
  'GOOGLE_BASE_URL',
  'DEEPSEEK_BASE_URL',
  'XAI_BASE_URL',
  'GROQ_BASE_URL',
] as const;

export interface EnvValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  env: Record<string, string | undefined>;
}

let dotenvLoaded = false;

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const equalsIndex = trimmed.indexOf('=');
  if (equalsIndex <= 0) return null;

  const key = trimmed.slice(0, equalsIndex).trim();
  let value = trimmed.slice(equalsIndex + 1).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  } else {
    const commentIndex = value.indexOf(' #');
    if (commentIndex >= 0) value = value.slice(0, commentIndex).trim();
  }

  return [key, value.replace(/\\n/g, '\n')];
}

function loadDotenvFiles(): void {
  if (dotenvLoaded) return;
  dotenvLoaded = true;

  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(moduleDir, '../../../../.env'),
    resolve(moduleDir, '../../.env'),
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
  ];

  for (const filePath of [...new Set(candidates)]) {
    if (!existsSync(filePath)) continue;

    const contents = readFileSync(filePath, 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;

      const [key, value] = parsed;
      process.env[key] ??= value;
    }
  }
}

/**
 * Validate environment variables at startup.
 * Returns a result object with errors/warnings.
 */
export function validateEnv(): EnvValidationResult {
  loadDotenvFiles();

  const errors: string[] = [];
  const warnings: string[] = [];
  const env: Record<string, string | undefined> = {};

  // Check required vars (they have defaults, so should never fail)
  for (const { name, defaultValue } of REQUIRED_VARS) {
    const value = process.env[name] ?? defaultValue;
    env[name] = value;
  }

  // Collect optional vars
  for (const name of OPTIONAL_VARS) {
    env[name] = process.env[name];
  }

  // Validate encryption key — warn if missing (not required at startup,
  // but will fail when user first configures LLM keys)
  if (!env.POLYRADER_ENCRYPTION_KEY && !env.ENCRYPTION_KEY) {
    warnings.push(
      'POLYRADER_ENCRYPTION_KEY is not set. A random key will be generated. ' +
      'Set it explicitly to persist encrypted API keys across restarts.',
    );
  }

  // Validate PORT is a valid number
  const port = parseInt(env.PORT ?? '3001', 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push(`PORT must be a number between 1 and 65535, got: ${env.PORT}`);
  }

  // Validate NODE_ENV
  if (env.NODE_ENV && !['development', 'production', 'test'].includes(env.NODE_ENV)) {
    warnings.push(`NODE_ENV "${env.NODE_ENV}" is not one of: development, production, test`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    env,
  };
}
