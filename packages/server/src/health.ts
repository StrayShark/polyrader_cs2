import { checkDbConnection, getCacheStats } from '@polyrader/infra';

// Lazy reference to WebSocket server (set via setWsServer)
let wssRef: { clients: Set<unknown> } | null = null;

export function setWsServer(wss: { clients: Set<unknown> }): void {
  wssRef = wss;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  dependencies: {
    database: { status: string; latency?: number };
    cache: { status: string; size: number; maxSize: number };
    websocket: { status: string; connections: number };
    externalApis: { status: string; checks: Array<{ name: string; status: string }> };
  };
}

export async function checkHealth(): Promise<HealthStatus> {
  const dbResult = await checkDbHealth();

  const cacheStats = getCacheStats();

  const wsInfo = checkWebSocket();

  const externalChecks = await checkExternalApis();

  // Determine overall status
  const allOk = dbResult.status === 'ok' && wsInfo.status === 'ok' && externalChecks.status === 'ok';
  const hasError = dbResult.status === 'error';

  return {
    status: hasError ? 'unhealthy' : allOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    dependencies: {
      database: dbResult,
      cache: { status: 'ok', ...cacheStats },
      websocket: wsInfo,
      externalApis: externalChecks,
    },
  };
}

async function checkDbHealth(): Promise<{ status: string; latency?: number }> {
  const start = Date.now();
  try {
    checkDbConnection();
    return { status: 'ok', latency: Date.now() - start };
  } catch {
    return { status: 'error' };
  }
}

function checkWebSocket(): { status: string; connections: number } {
  try {
    const connections = wssRef?.clients?.size ?? 0;
    return { status: 'ok', connections };
  } catch {
    return { status: 'error', connections: 0 };
  }
}

/**
 * Check external API reachability with a short timeout.
 * Only checks if the endpoint responds — does not validate response body.
 */
async function checkExternalApis(): Promise<{ status: string; checks: Array<{ name: string; status: string }> }> {
  const checks: Array<{ name: string; status: string }> = [];

  // Check Polymarket Gamma API
  const gammaUrl = process.env.POLYMARKET_GAMMA_API_URL ?? 'https://gamma-api.polymarket.com';
  checks.push(await checkEndpoint('polymarket-gamma', `${gammaUrl}/markets?limit=1`));

  // Check Polygon RPC
  const polygonUrl = process.env.POLYGON_RPC_URL ?? 'https://polygon-rpc.com';
  checks.push(await checkEndpoint('polygon-rpc', polygonUrl));

  const anyError = checks.some((c) => c.status === 'error');
  return { status: anyError ? 'degraded' : 'ok', checks };
}

async function checkEndpoint(name: string, url: string): Promise<{ name: string; status: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return { name, status: 'ok' };
  } catch {
    return { name, status: 'error' };
  }
}
