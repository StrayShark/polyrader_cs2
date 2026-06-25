/**
 * Polymarket CS2 match parser.
 *
 * Extracts structured match info from Polymarket market questions.
 *
 * Question format examples:
 *   "Counter-Strike: Acend vs Bebop (BO3) - CCT Europe Series #14 Play-In Group B"
 *   "Counter-Strike: FC Famalicão Esports vs Falcons Force - Map 1 Winner"
 *   "Counter-Strike: 3DMAX vs FOKUS - Map 2 Winner"
 *   "Counter-Strike: Spirit vs G2 (BO5) - IEM Cologne 2026 Quarterfinal"
 */

export interface ParsedPolymarketMatch {
  /** Original Polymarket question */
  question: string;
  /** Team A name as written in the question */
  teamAName: string;
  /** Team B name as written in the question */
  teamBName: string;
  /** Best-of format, null if not specified */
  format: 'BO1' | 'BO3' | 'BO5' | null;
  /** Event/tournament name */
  eventName: string;
  /** Event stage if present (e.g. "Quarterfinal", "Group B", "Play-In") */
  eventStage: string | null;
  /** Map number if this is a single-map market (e.g. "Map 1 Winner") */
  mapNumber: number | null;
  /** Whether this is a map market rather than a match market */
  isMapMarket: boolean;
}

/**
 * Parse a Polymarket CS2 market question into structured data.
 *
 * Returns null if the question doesn't look like a CS2 match market.
 */
export function parsePolymarketMatch(question: string): ParsedPolymarketMatch | null {
  // Must contain "vs" to be a match market
  if (!question.includes(' vs ')) return null;

  // Strip "Counter-Strike: " prefix
  let text = question.trim();
  const prefixPatterns = [
    /^Counter-Strike:\s*/i,
    /^CS2:\s*/i,
    /^CSGO:\s*/i,
  ];
  for (const p of prefixPatterns) {
    text = text.replace(p, '');
  }

  // Split into match part and event part by " - " (first occurrence)
  const dashIdx = text.indexOf(' - ');
  const matchPart = dashIdx >= 0 ? text.substring(0, dashIdx).trim() : text.trim();
  const eventPart = dashIdx >= 0 ? text.substring(dashIdx + 3).trim() : '';

  // Extract format (BO1/BO3/BO5) from match part
  const formatMatch = matchPart.match(/\((BO[135])\)/i);
  const format = formatMatch
    ? (formatMatch[1].toUpperCase() as 'BO1' | 'BO3' | 'BO5')
    : null;

  // Extract map number (e.g. "Map 1 Winner", "Map 2 Winner")
  const mapMatch = eventPart.match(/Map\s+(\d+)\s+Winner/i);
  const mapNumber = mapMatch ? parseInt(mapMatch[1], 10) : null;
  const isMapMarket = mapNumber !== null;

  // Split teams by " vs "
  const vsIdx = matchPart.indexOf(' vs ');
  if (vsIdx < 0) return null;

  let teamAName = matchPart.substring(0, vsIdx).trim();
  let teamBName = matchPart.substring(vsIdx + 4).trim();

  // Remove format suffix from team B name: "Bebop (BO3)" → "Bebop"
  teamBName = teamBName.replace(/\s*\(BO[135]\)\s*$/i, '').trim();
  // Remove "Map X Winner" suffix if present in team B
  teamBName = teamBName.replace(/\s*-\s*Map\s+\d+\s+Winner\s*$/i, '').trim();

  // Parse event name and stage
  let eventName = eventPart;
  let eventStage: string | null = null;

  // Try to extract stage from event part
  const stageMatch = eventPart.match(
    /\b(Play-In|Quarterfinal|Quarterfinals|Semifinal|Semifinals|Final|Grand Final|Group [A-Z]|Group \d+|Upper Bracket Round \d|Lower Bracket Round \d|Upper Bracket Semifinal|Lower Bracket Semifinal|Upper Bracket Final|Lower Bracket Final)\b/i,
  );
  if (stageMatch) {
    eventStage = stageMatch[1];
    eventName = eventPart.replace(stageMatch[0], '').replace(/\s*-\s*$/, '').trim();
  }

  // If no stage found, check if event part has "Map X Winner" and strip it
  if (isMapMarket && !eventStage) {
    eventName = eventPart.replace(/Map\s+\d+\s+Winner/i, '').replace(/\s*-\s*$/, '').trim();
  }

  if (!eventName) eventName = 'Unknown Event';

  return {
    question,
    teamAName,
    teamBName,
    format,
    eventName,
    eventStage,
    mapNumber,
    isMapMarket,
  };
}
