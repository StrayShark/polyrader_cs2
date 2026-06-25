export interface AppRoute {
  path: string;
  name: string;
  hash: string;
}

export const APP_ROUTES: AppRoute[] = [
  { path: '/', name: 'dashboard', hash: '/#/' },
  { path: '/daily', name: 'daily', hash: '/#/daily' },
  { path: '/whales', name: 'whales', hash: '/#/whales' },
  { path: '/esports', name: 'esports', hash: '/#/esports' },
  { path: '/signals', name: 'signals', hash: '/#/signals' },
  { path: '/polymarket/account', name: 'polymarket-account', hash: '/#/polymarket/account' },
  { path: '/ai/config', name: 'ai-config', hash: '/#/ai/config' },
  { path: '/ai/stats', name: 'ai-stats', hash: '/#/ai/stats' },
  { path: '/prompt-variants', name: 'prompt-variants', hash: '/#/prompt-variants' },
  { path: '/allocation', name: 'allocation', hash: '/#/allocation' },
  { path: '/simulation', name: 'simulation', hash: '/#/simulation' },
  { path: '/llm/analysis/openai', name: 'llm-analysis', hash: '/#/llm/analysis/openai' },
];

export const DESIGN_AUDIT_PAGES = APP_ROUTES.filter((r) =>
  ['dashboard', 'ai-config', 'signals'].includes(r.name),
);
