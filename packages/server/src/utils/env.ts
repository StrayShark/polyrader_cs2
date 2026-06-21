/**
 * Centralized environment variable validation.
 * Validates all required env vars at startup and fails fast if critical ones are missing.
 */

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
  'POLYMARKET_WS_URL',
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

/**
 * Validate environment variables at startup.
 * Returns a result object with errors/warnings.
 */
export function validateEnv(): EnvValidationResult {
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
