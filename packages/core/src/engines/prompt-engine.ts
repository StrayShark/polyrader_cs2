import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { MatchInfo, Team, LLMAnalysisResult, LLMProvider, Lineup, PromptVariant } from '../types/index';

/**
 * PromptEngine — 4-layer prompt architecture for LLM win rate analysis
 *
 * Layers:
 *   1. System Prompt    — Role definition, output format (loaded from system.yaml)
 *   2. Context Template — Match context structure (loaded from context-template.yaml)
 *   3. Data Injection   — Actual match data (including lineups)
 *   4. Output Schema    — Expected JSON structure (loaded from output-schema.yaml)
 *
 * Templates are loaded from YAML files in the prompts/ directory.
 * Falls back to hardcoded defaults if files are unavailable.
 */

export interface PromptTemplate {
  system: string;
  context: string;
  outputSchema: string;
}

export interface PromptContext {
  match: MatchInfo;
  teamA: Team;
  teamB: Team;
  marketProbA?: number;
}

// ============================================================
// YAML Template Types
// ============================================================

interface SystemYaml {
  role: string;
  task: string;
  analysis_factors: Array<{ id: string; name: string; description: string; weight_hint?: string; warning?: string }>;
  guidelines: string[];
}

interface OutputSchemaYaml {
  schema: Record<string, { type: string; range?: string; description: string; items?: string }>;
  example: string;
}

interface ContextTemplateYaml {
  sections: {
    match_info: { header: string; fields: Array<{ label: string; template: string }> };
    team: { header_prefix: string; fields: Array<{ label: string; template: string }>; sub_sections: Record<string, { header: string; item_template: string }> };
    lineup: { header_prefix: string; warnings: Record<string, string>; table_header: string; table_separator: string; row_template: string };
    head_to_head: { header: string; found_template: string; not_found: string };
    market_odds: { header: string; template: string };
    closing: { template: string };
  };
}

interface AllocationSystemYaml {
  role: string;
  task: string;
  principles: string[];
  output_notes: string;
}

// ============================================================
// Template Loader
// ============================================================

const PROMPTS_DIR = path.join(import.meta.dirname, '..', 'prompts');

function loadYaml<T>(filename: string): T | null {
  try {
    const filepath = path.join(PROMPTS_DIR, filename);
    const content = fs.readFileSync(filepath, 'utf-8');
    return yaml.load(content) as T;
  } catch {
    return null;
  }
}

// ============================================================
// System Prompt Renderer
// ============================================================

function renderSystemPrompt(yamlData: SystemYaml | null): string {
  if (!yamlData) return DEFAULT_SYSTEM_PROMPT;

  let prompt = `You are a ${yamlData.role}. Your task is to ${yamlData.task}.\n\n`;
  prompt += `Analyze the provided data and output a JSON response with your prediction.\n\n`;
  prompt += `Key factors to consider:\n`;

  yamlData.analysis_factors.forEach((f, i) => {
    prompt += `${i + 1}. ${f.name} — ${f.description}`;
    if (f.weight_hint) prompt += ` [${f.weight_hint}]`;
    prompt += `\n`;
  });

  const lineupFactor = yamlData.analysis_factors.find((f) => f.id === 'lineup');
  if (lineupFactor?.warning) {
    prompt += `\nIMPORTANT: ${lineupFactor.warning} Evaluate the lineup independently from the team's historical performance.\n`;
  }

  if (yamlData.guidelines.length > 0) {
    prompt += `\n${yamlData.guidelines.map((g) => `- ${g}`).join('\n')}\n`;
  }

  return prompt;
}

// ============================================================
// Output Schema Renderer
// ============================================================

function renderOutputSchema(yamlData: OutputSchemaYaml | null): string {
  if (!yamlData) return DEFAULT_OUTPUT_SCHEMA;
  return yamlData.example.trim();
}

// ============================================================
// Allocation System Prompt Renderer
// ============================================================

const DEFAULT_ALLOCATION_SYSTEM_PROMPT = `You are a professional sports betting bankroll manager. Your task is to allocate capital across multiple CS2 match betting opportunities based on remaining bankroll and target return rate.

Principles:
- Maximize expected value while respecting the user's risk tolerance.
- Never exceed the per-bet or total-exposure caps.
- Diversify across opportunities to reduce concentration risk.
- Prefer high-consensus, high-confidence opportunities.
- If no opportunity meets the minimum edge threshold, recommend skipping.
- Consider the target return rate: higher targets justify slightly larger allocations on high-EV bets, but never break the caps.
- Be objective and data-driven. Do not hallucinate odds or probabilities.

Output a JSON object with 'allocations' (array of {matchId, amount, reasoning}) and 'reasoning' (overall strategy summary). Only include opportunities worth betting on.`;

function renderAllocationSystemPrompt(yamlData: AllocationSystemYaml | null): string {
  if (!yamlData) return DEFAULT_ALLOCATION_SYSTEM_PROMPT;

  let prompt = `You are a ${yamlData.role}. Your task is to ${yamlData.task}.\n\nPrinciples:\n`;
  prompt += yamlData.principles.map((p) => `- ${p}`).join('\n');
  prompt += `\n\n${yamlData.output_notes}`;
  return prompt;
}

// ============================================================
// Context Template Builder
// ============================================================

function buildContextFromTemplate(
  tmpl: ContextTemplateYaml | null,
  context: PromptContext,
  formatters: {
    formatMapPool: (maps: Array<{ map: string; winRate: number; matchesPlayed: number }>) => string;
    formatPlayers: (players: Array<{ nickname: string; rating: number; role: string }>) => string;
    formatLineupSection: (teamLabel: string, lineup: Lineup, rowTemplate: string, warnings: Record<string, string>) => string;
    formatHeadToHead: (teamA: Team, teamB: Team, tmpl: ContextTemplateYaml) => string;
  },
): string {
  const { match, teamA, teamB, marketProbA } = context;

  // If no template loaded, use default formatting
  if (!tmpl) {
    return buildDefaultContext(context);
  }

  const s = tmpl.sections;
  let prompt = '';

  // Match Info
  prompt += `${s.match_info.header}\n`;
  prompt += `- Event: ${match.eventName} (${match.eventType})\n`;
  prompt += `- Format: ${match.format}\n`;
  prompt += `- Scheduled: ${match.scheduledAt}\n`;
  prompt += `- Maps: ${match.maps?.join(', ') ?? 'TBD'}\n`;

  // Team A
  prompt += `\n${s.team.header_prefix} A: ${teamA.name}\n`;
  prompt += `- HLTV Rank: #${teamA.rank}\n`;
  prompt += `- Region: ${teamA.region}\n`;
  prompt += `- Recent Form (Last 10): ${((teamA.recentForm.winRate ?? 0) * 100).toFixed(0)}% win rate\n`;
  prompt += `- Streak: ${(teamA.recentForm.streak ?? 0) > 0 ? `W${teamA.recentForm.streak}` : `L${Math.abs(teamA.recentForm.streak ?? 0)}`}\n`;
  prompt += `- Avg Rating: ${(teamA.recentForm.averageRating ?? 0).toFixed(2)}\n`;
  prompt += `- Map Pool:\n${formatters.formatMapPool(teamA.mapPool?.maps ?? [])}\n`;
  prompt += `- Key Players:\n${formatters.formatPlayers((teamA.players ?? []).slice(0, 3))}\n`;

  if (match.lineups) {
    prompt += formatters.formatLineupSection('Team A', match.lineups.teamA, s.lineup.row_template, s.lineup.warnings);
  }

  // Team B
  prompt += `\n${s.team.header_prefix} B: ${teamB.name}\n`;
  prompt += `- HLTV Rank: #${teamB.rank}\n`;
  prompt += `- Region: ${teamB.region}\n`;
  prompt += `- Recent Form (Last 10): ${((teamB.recentForm.winRate ?? 0) * 100).toFixed(0)}% win rate\n`;
  prompt += `- Streak: ${(teamB.recentForm.streak ?? 0) > 0 ? `W${teamB.recentForm.streak}` : `L${Math.abs(teamB.recentForm.streak ?? 0)}`}\n`;
  prompt += `- Avg Rating: ${(teamB.recentForm.averageRating ?? 0).toFixed(2)}\n`;
  prompt += `- Map Pool:\n${formatters.formatMapPool(teamB.mapPool?.maps ?? [])}\n`;
  prompt += `- Key Players:\n${formatters.formatPlayers((teamB.players ?? []).slice(0, 3))}\n`;

  if (match.lineups) {
    prompt += formatters.formatLineupSection('Team B', match.lineups.teamB, s.lineup.row_template, s.lineup.warnings);
  }

  // Head-to-Head
  prompt += `\n${formatters.formatHeadToHead(teamA, teamB, tmpl)}\n`;

  // Market Odds
  if (marketProbA !== undefined) {
    prompt += `\n${s.market_odds.header}\n`;
    prompt += `- ${s.market_odds.template
      .replace('{{probAPct}}', (marketProbA * 100).toFixed(1))
      .replace('{{probBPct}}', ((1 - marketProbA) * 100).toFixed(1))}\n`;
  }

  // Closing
  prompt += `\n${s.closing.template}`;

  return prompt;
}

// ============================================================
// Default fallbacks (used when YAML files can't be loaded)
// ============================================================

const DEFAULT_SYSTEM_PROMPT = `You are a professional CS2 esports analyst. Your task is to predict the win probability for a CS2 match.

Analyze the provided data and output a JSON response with your prediction.

Key factors to consider:
1. HLTV world ranking — higher rank = stronger team
2. Recent form — last 10 matches win rate and performance
3. Starting lineup — individual player ratings, roles, standins, and synergy
4. Map pool — which maps each team is strong/weak on
5. Head-to-head history — past matchups between these teams
6. Market sentiment — current betting market odds

IMPORTANT: Pay special attention to lineup changes. A team with standins or missing key players (especially AWPer or IGL) is significantly weaker than their ranking suggests. Evaluate the lineup independently from the team's historical performance.

Be objective and data-driven. Do not hallucinate. If data is insufficient, note it in your reasoning.`;

const DEFAULT_OUTPUT_SCHEMA = `{
  "winProbability": {
    "teamA": 0.55,
    "teamB": 0.45
  },
  "confidence": 0.75,
  "reasoning": "Brief analysis of why you made this prediction",
  "keyFactors": ["Factor 1", "Factor 2"],
  "riskAssessment": "Key risks and uncertainties"
}`;

function buildDefaultContext(context: PromptContext): string {
  const { match, teamA, teamB, marketProbA } = context;

  let prompt = `## Match Information
- Event: ${match.eventName} (${match.eventType})
- Format: ${match.format}
- Scheduled: ${match.scheduledAt}
- Maps: ${match.maps?.join(', ') ?? 'TBD'}

## Team A: ${teamA.name}
- HLTV Rank: #${teamA.rank}
- Region: ${teamA.region}
- Recent Form (Last 10): ${((teamA.recentForm.winRate ?? 0) * 100)}% win rate
- Streak: ${(teamA.recentForm.streak ?? 0) > 0 ? `W${teamA.recentForm.streak}` : `L${Math.abs(teamA.recentForm.streak ?? 0)}`}
- Avg Rating: ${(teamA.recentForm.averageRating ?? 0).toFixed(2)}
- Map Pool:
${formatMapPoolDefault(teamA.mapPool?.maps ?? [])}
- Key Players:
${formatPlayersDefault((teamA.players ?? []).slice(0, 3))}
`;

  if (match.lineups) {
    prompt += formatLineupSectionDefault('Team A', match.lineups.teamA);
  }

  prompt += `
## Team B: ${teamB.name}
- HLTV Rank: #${teamB.rank}
- Region: ${teamB.region}
- Recent Form (Last 10): ${((teamB.recentForm.winRate ?? 0) * 100)}% win rate
- Streak: ${(teamB.recentForm.streak ?? 0) > 0 ? `W${teamB.recentForm.streak}` : `L${Math.abs(teamB.recentForm.streak ?? 0)}`}
- Avg Rating: ${(teamB.recentForm.averageRating ?? 0).toFixed(2)}
- Map Pool:
${formatMapPoolDefault(teamB.mapPool?.maps ?? [])}
- Key Players:
${formatPlayersDefault((teamB.players ?? []).slice(0, 3))}
`;

  if (match.lineups) {
    prompt += formatLineupSectionDefault('Team B', match.lineups.teamB);
  }

  const h2h = teamA.headToHead.find((h) => h.opponent === teamB.teamId);
  prompt += `
## Head-to-Head
${!h2h || h2h.matchesPlayed === 0 ? 'No previous matchups found.' : `${teamA.name} leads ${h2h.wins}-${h2h.losses} in ${h2h.matchesPlayed} matches.\nLast match: ${h2h.lastMatch}`}
`;

  if (marketProbA !== undefined) {
    prompt += `
## Market Odds
- Polymarket implied probability: Team A ${(marketProbA * 100).toFixed(1)}% / Team B ${((1 - marketProbA) * 100).toFixed(1)}%
`;
  }

  prompt += `
Please analyze this match and provide your win probability prediction.`;

  return prompt;
}

function formatMapPoolDefault(maps: Array<{ map: string; winRate: number; matchesPlayed: number }>): string {
  return maps
    .sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))
    .map((m) => `  - ${m.map}: ${((m.winRate ?? 0) * 100).toFixed(0)}% (${m.matchesPlayed ?? 0} matches)`)
    .join('\n');
}

function formatPlayersDefault(players: Array<{ nickname: string; rating: number; role: string }>): string {
  return players
    .map((p) => `  - ${p.nickname ?? 'Unknown'} (${p.role ?? ''}): ${(p.rating ?? 1.0).toFixed(2)} rating`)
    .join('\n');
}

function formatLineupSectionDefault(teamLabel: string, lineup: Lineup): string {
  let section = `\n### ${teamLabel} Starting Lineup\n`;

  if (!lineup.isConfirmed) {
    section += `⚠️ LINEUP NOT CONFIRMED — may change before match\n`;
  }
  if (lineup.hasStandin) {
    section += `⚠️ HAS STANDIN(S) — ${lineup.standinCount} substitute player(s)\n`;
  }
  if (lineup.missingKeyPlayers.length > 0) {
    section += `⚠️ MISSING KEY PLAYERS: ${lineup.missingKeyPlayers.join(', ')}\n`;
  }

  section += `\n| Player | Role | Rating | Impact | Standin | Maps w/Team |\n`;
  section += `|--------|------|--------|--------|---------|-------------|\n`;
  for (const p of lineup.players) {
    section += `| ${p.nickname} | ${p.role} | ${(p.rating ?? 1.0).toFixed(2)} | ${p.impactScore} | ${p.isStandin ? '⚠️ YES' : 'No'} | ${p.mapsOnRecord} |\n`;
  }

  return section;
}

// ============================================================
// PromptEngine
// ============================================================

export class PromptEngine {
  private systemPrompt: string;
  private outputSchema: string;
  private contextTemplate: ContextTemplateYaml | null;
  private allocationSystemPrompt: string;

  constructor(systemPrompt?: string, outputSchema?: string) {
    // Load YAML templates
    const systemYaml = loadYaml<SystemYaml>('system.yaml');
    const schemaYaml = loadYaml<OutputSchemaYaml>('output-schema.yaml');
    this.contextTemplate = loadYaml<ContextTemplateYaml>('context-template.yaml');

    // Render prompts from YAML, fall back to provided values or defaults
    this.systemPrompt = systemPrompt ?? renderSystemPrompt(systemYaml);
    this.outputSchema = outputSchema ?? renderOutputSchema(schemaYaml);

    // Load allocation system prompt
    const allocYaml = loadYaml<AllocationSystemYaml>('allocation-system.yaml');
    this.allocationSystemPrompt = renderAllocationSystemPrompt(allocYaml);
  }

  buildPrompt(context: PromptContext): PromptTemplate {
    return {
      system: this.systemPrompt,
      context: this.buildContext(context),
      outputSchema: this.outputSchema,
    };
  }

  buildMessages(context: PromptContext): Array<{ role: 'system' | 'user'; content: string }> {
    return [
      {
        role: 'system',
        content: `${this.systemPrompt}\n\nOutput your response in the following JSON format:\n${this.outputSchema}`,
      },
      {
        role: 'user',
        content: this.buildContext(context),
      },
    ];
  }

  /**
   * Build messages for LLM-driven bet allocation.
   * `userContent` is produced by BetAllocationEngine.buildAllocationPrompt().
   */
  buildAllocationMessages(userContent: string): Array<{ role: 'system' | 'user'; content: string }> {
    return [
      { role: 'system', content: this.allocationSystemPrompt },
      { role: 'user', content: userContent },
    ];
  }

  /** Expose the allocation system prompt (for circuit-breaker client usage). */
  getAllocationSystemPrompt(): string {
    return this.allocationSystemPrompt;
  }

  private buildContext(context: PromptContext): string {
    return buildContextFromTemplate(this.contextTemplate, context, {
      formatMapPool: formatMapPoolDefault,
      formatPlayers: formatPlayersDefault,
      formatLineupSection: (teamLabel, lineup, rowTemplate, warnings) => {
        let section = `\n### ${teamLabel} Starting Lineup\n`;

        if (!lineup.isConfirmed) {
          section += `${warnings.unconfirmed}\n`;
        }
        if (lineup.hasStandin) {
          section += `${warnings.standin.replace('{{standinCount}}', String(lineup.standinCount))}\n`;
        }
        if (lineup.missingKeyPlayers.length > 0) {
          section += `${warnings.missing_key.replace('{{missingPlayers}}', lineup.missingKeyPlayers.join(', '))}\n`;
        }

        section += `\n| Player | Role | Rating | Impact | Standin | Maps w/Team |\n`;
        section += `|--------|------|--------|--------|---------|-------------|\n`;
        for (const p of lineup.players) {
          section += `${rowTemplate
            .replace('{{nickname}}', p.nickname)
            .replace('{{role}}', p.role)
            .replace('{{rating}}', (p.rating ?? 1.0).toFixed(2))
            .replace('{{impactScore}}', String(p.impactScore))
            .replace('{{standinMark}}', p.isStandin ? '⚠️ YES' : 'No')
            .replace('{{mapsOnRecord}}', String(p.mapsOnRecord))}\n`;
        }

        return section;
      },
      formatHeadToHead: (teamA, teamB, tmpl) => {
        const h2h = teamA.headToHead.find((h) => h.opponent === teamB.teamId);
        const s = tmpl.sections.head_to_head;
        if (!h2h || h2h.matchesPlayed === 0) {
          return `${s.header}\n${s.not_found}`;
        }
        return `${s.header}\n${s.found_template
          .replace('{{teamAName}}', teamA.name)
          .replace('{{wins}}', String(h2h.wins))
          .replace('{{losses}}', String(h2h.losses))
          .replace('{{matchesPlayed}}', String(h2h.matchesPlayed))
          .replace('{{lastMatch}}', h2h.lastMatch)}`;
      },
    });
  }

  parseResponse(
    provider: LLMProvider,
    model: string,
    responseText: string,
    latency: number,
    tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number },
  ): LLMAnalysisResult {
    try {
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                        responseText.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : responseText;
      const parsed = JSON.parse(jsonStr);

      return {
        provider,
        model,
        winProbability: {
          teamA: parsed.winProbability?.teamA ?? 0.5,
          teamB: parsed.winProbability?.teamB ?? 0.5,
        },
        confidence: parsed.confidence ?? 0.5,
        reasoning: parsed.reasoning ?? 'No reasoning provided',
        keyFactors: parsed.keyFactors ?? [],
        riskAssessment: parsed.riskAssessment ?? 'No risk assessment',
        latency,
        tokenUsage,
      };
    } catch {
      return {
        provider,
        model,
        winProbability: { teamA: 0.5, teamB: 0.5 },
        confidence: 0,
        reasoning: 'Failed to parse LLM response',
        keyFactors: [],
        riskAssessment: 'Parse error',
        latency,
        tokenUsage,
        error: 'Failed to parse response JSON',
      };
    }
  }
}

// ============================================================
// Prompt Variant Selection (A/B testing)
// ============================================================

/**
 * Select a prompt variant using weighted random selection.
 * Returns null if the array is empty.
 * If all weights are zero or invalid, falls back to the first variant.
 */
export function selectWeightedVariant(variants: PromptVariant[]): PromptVariant | null {
  if (variants.length === 0) return null;
  if (variants.length === 1) return variants[0];

  const validWeights = variants.map((v) =>
    Number.isFinite(v.trafficWeight) && v.trafficWeight > 0 ? v.trafficWeight : 0,
  );
  const totalWeight = validWeights.reduce((sum, w) => sum + w, 0);

  // If all weights are zero/invalid, fall back to the first variant
  if (totalWeight <= 0) return variants[0];

  let random = Math.random() * totalWeight;
  for (let i = 0; i < variants.length; i++) {
    random -= validWeights[i];
    if (random < 0) return variants[i];
  }

  // Fallback due to floating-point rounding
  return variants[variants.length - 1];
}
