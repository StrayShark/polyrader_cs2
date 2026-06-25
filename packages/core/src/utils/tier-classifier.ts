/**
 * CS2 tournament tier classification.
 *
 * HLTV doesn't expose an explicit "tier" field, so we infer it from a
 * combination of star rating, event type (LAN vs Online), and event name
 * keyword matching against the known premier tournament circuits.
 *
 * Tier definitions (aligned with community/Liquipedia conventions):
 *   S — Majors, IEM Katowice/Cologne, BLAST Premier World Final
 *   A — Big-circuit LAN events (ESL Pro League, BLAST Spring/Fall, IEM Dallas/Chengdu…)
 *   B — Mid-tier LAN / RMR qualifiers / prominent online leagues
 *   C — Smaller online cups, qualifiers, show matches
 */

/** Tournament tier, from highest (S) to lowest (C). */
export type EventTier = 'S' | 'A' | 'B' | 'C';

/** Ordered tiers for comparison — higher index = more prestigious. */
export const TIER_ORDER: Record<EventTier, number> = { S: 3, A: 2, B: 1, C: 0 };

/** Check whether `tier` meets or exceeds the `minimum` threshold. */
export function tierMeetsMinimum(tier: EventTier | undefined, minimum: EventTier): boolean {
  if (!tier) return false;
  return TIER_ORDER[tier] >= TIER_ORDER[minimum];
}

interface TierInput {
  stars: number;        // HLTV star rating 0-5
  eventType: 'LAN' | 'Online';
  eventName: string;
  prizePool?: number;   // USD, if known
}

/** Premier event name keywords → tier S. */
const S_TIER_KEYWORDS = [
  'major', 'iem katowice', 'iem cologne', 'world final', 'global final',
  'blast world final', 'blast premier world final', 'pgl major',
  'perfect world major', 'starladder major', 'faceit major',
  'blast.tv major',
];

/** Big-circuit keywords → tier A. */
const A_TIER_KEYWORDS = [
  'iem dallas', 'iem chengdu', 'iem rio', 'iem melbourne',
  'esl pro league', 'epl', 'blast premier spring', 'blast premier fall',
  'blast spring final', 'blast fall final', 'esl one',
  'iem new york', 'dreamhack open', 'blastspring', 'blastfall',
  'blast bounty',
];

/** Mid-tier keywords → tier B. */
const B_TIER_KEYWORDS = [
  'rmr', 'qualifier', 'cash cup', 'home sweet home', 'funspark',
  'dreamhack open jan', 'dreamhack open feb', 'dreamhack open mar',
  'dreamhack open apr', 'dreamhack open may', 'dreamhack open jun',
  'dreamhack open jul', 'dreamhack open aug', 'dreamhub', 'ltv',
  'telia', 'nine to five', 'spring cup', 'summer cup',
  'esea premier', 'esea advanced',
  'snow sweet snow', 'swisscom',
];

/**
 * Classify a CS2 event into a tier.
 *
 * Decision precedence:
 *   1. Explicit keyword match (S → A → B)
 *   2. HLTV stars: 5★ → S, 4★ → A, 3★ → B
 *   3. LAN fallback + stars: 2★ LAN → B, else C
 *   4. Online fallback: 2★+ online → B, else C
 *   5. Prize pool: ≥$500k → A, ≥$100k → B, ≥$25k → C
 */
export function classifyEventTier(input: TierInput): EventTier {
  const name = input.eventName.toLowerCase().trim();

  // 1. Keyword matching
  if (S_TIER_KEYWORDS.some((kw) => name.includes(kw))) return 'S';
  if (A_TIER_KEYWORDS.some((kw) => name.includes(kw))) return 'A';
  if (B_TIER_KEYWORDS.some((kw) => name.includes(kw))) return 'B';

  // 2. HLTV star rating
  if (input.stars >= 5) return 'S';
  if (input.stars >= 4) return 'A';
  if (input.stars >= 3) return 'B';

  // 3. Prize pool — a meaningful prize pool overrides stars/event-type heuristics
  if (input.prizePool != null) {
    if (input.prizePool >= 500_000) return 'A';
    if (input.prizePool >= 100_000) return 'B';
    if (input.prizePool >= 25_000) return 'C';
  }

  // 4-5. Event type + stars fallback
  if (input.eventType === 'LAN') {
    if (input.stars >= 2) return 'B';
    return 'C';
  }

  // Online
  if (input.stars >= 2) return 'B';

  return 'C';
}

/** Human-readable description for a tier, used in UI/config display. */
export function tierDescription(tier: EventTier): string {
  switch (tier) {
    case 'S': return 'S — Majors & Premier Events (Katowice/Cologne/World Final)';
    case 'A': return 'A — Big-circuit LAN (ESL Pro League, BLAST Spring/Fall, IEM)';
    case 'B': return 'B — Mid-tier LAN / RMR / Prominent Online Leagues';
    case 'C': return 'C — Smaller Online Cups & Qualifiers';
  }
}
