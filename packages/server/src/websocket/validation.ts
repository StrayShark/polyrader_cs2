import { z } from 'zod';

// ============================================================
// WebSocket message schemas
// ============================================================

export const wsMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('subscribe'),
    channel: z.string().min(1).max(64),
  }),
  z.object({
    type: z.literal('unsubscribe'),
    channel: z.string().min(1).max(64),
  }),
  z.object({
    type: z.literal('ping'),
    sentAt: z.number().optional(),
  }),
]);

export type WsMessage = z.infer<typeof wsMessageSchema>;

// ============================================================
// Allowed channel whitelist
// ============================================================
export const ALLOWED_CHANNELS = new Set([
  'prices',
  'whales',
  'whale-trades',
  'settlement',
  'daily',
  'analysis',
  'alerts',
  'arbitrage',
  'simulation',
  'tasks',
]);

export function isAllowedChannel(channel: string): boolean {
  // Allow dynamic channels with known prefixes
  if (ALLOWED_CHANNELS.has(channel)) return true;
  if (channel.startsWith('market:')) return true;
  if (channel.startsWith('match:')) return true;
  if (channel.startsWith('team:')) return true;
  if (channel.startsWith('prices:')) return true;
  return false;
}

// ============================================================
// Connection limits
// ============================================================
// In sidecar mode (desktop app), relaxed limits for single user.
// In web mode, stricter limits for multi-user.
const isSidecar = process.argv.some((arg) => arg.startsWith('--port='));
export const MAX_CONNECTIONS = isSidecar ? 20 : 100;
export const MAX_CONNECTIONS_PER_IP = isSidecar ? 20 : 10;
