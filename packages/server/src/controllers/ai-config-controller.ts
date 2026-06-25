import type { Request, Response } from 'express';
import { AiConfigService } from '../services/ai-config-service';
import { trackTask } from '../services/task-tracker-service';
import type { LLMAggregation, ConnectivityResult } from '@polyrader/core';
import { createSSEStream } from '../sse';
import { logger } from '../utils/logger';

export class AiConfigController {
  private service = new AiConfigService();

  async getKeys(req: Request, res: Response): Promise<void> {
    try {
      const keys = await this.service.getKeys();
      res.json({ data: keys });
    } catch (err) {
      logger.error('Failed to fetch keys', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch keys', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async setKey(req: Request, res: Response): Promise<void> {
    try {
      const { apiKey, model } = req.body;
      await this.service.setKey(req.params.providerId, apiKey, model);
      res.json({ message: 'Key updated' });
    } catch (err) {
      logger.error('Failed to set key', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to set key', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async testConnection(req: Request, res: Response): Promise<void> {
    try {
      const providerId = req.params.providerId;
      let result: ConnectivityResult | undefined;
      await trackTask(`llm-test-${providerId}`, {
        name: `LLM 连通性测试 (${providerId})`,
        category: 'ai',
        trigger: 'manual',
        metadata: { providerId },
      }, async (ctx) => {
        result = await this.service.testConnection(providerId);
        if (result.success) {
          ctx.log(`成功 ${result.latency}ms`);
        } else {
          ctx.log(`失败: ${result.error ?? 'unknown'}`, 'warn');
        }
        return { success: result.success, latency: result.latency };
      });
      res.json({ data: result });
    } catch (err) {
      logger.error('Failed to test connection', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to test connection', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getUsage(req: Request, res: Response): Promise<void> {
    try {
      const usage = await this.service.getUsage();
      res.json({ data: usage });
    } catch (err) {
      logger.error('Failed to fetch usage', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch usage', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async analyze(req: Request, res: Response): Promise<void> {
    try {
      const { matchId, teamAId, teamBId } = req.body;
      let result: LLMAggregation | undefined;
      await trackTask(`llm-analyze-${matchId}`, {
        name: 'LLM 手动分析',
        category: 'ai',
        trigger: 'manual',
        metadata: { matchId, teamAId, teamBId },
      }, async (ctx) => {
        result = await this.service.analyze(matchId, teamAId, teamBId);
        ctx.log(`${result.results.length} 个 provider 返回结果`);
        ctx.setProgress(100);
      });
      res.json({ data: result });
    } catch (err) {
      logger.error('Failed to run analysis', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to run analysis', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  /**
   * Streaming SSE analysis endpoint.
   * Sends progress events as each LLM completes, then a final 'result' event.
   */
  async analyzeStream(req: Request, res: Response): Promise<void> {
    const stream = createSSEStream(res);
    const { matchId, teamAId, teamBId } = req.body;
    // Stop streaming once the client disconnects so we don't write to a dead socket
    let aborted = false;
    req.on('close', () => { aborted = true; });

    try {
      const result = await this.service.analyzeWithProgress(
        matchId,
        teamAId,
        teamBId,
        (llmResult) => {
          if (aborted) return;
          // Send each LLM result immediately as it completes
          stream.send('llm_result', {
            provider: llmResult.provider,
            probability: llmResult.winProbability.teamA,
            confidence: llmResult.confidence,
            reasoning: llmResult.reasoning,
            error: llmResult.error,
          });
        },
      );

      // Send final aggregation — the full LLMAggregation object
      if (!aborted) {
        stream.send('result', {
          aggregation: result,
        });

        stream.done();
      }
    } catch (err) {
      logger.error('Failed to stream analysis', { error: (err as Error).message });
      if (!aborted) {
        const errMsg = process.env.NODE_ENV === 'development'
          ? (err as Error).message
          : 'Analysis failed';
        stream.error(errMsg);
      }
    }
  }

  async getAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const analysis = await this.service.getAnalysis(req.params.analysisId);
      if (!analysis) {
        res.status(404).json({ error: 'Analysis not found' });
        return;
      }
      res.json({ data: analysis });
    } catch (err) {
      logger.error('Failed to fetch analysis', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch analysis', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getAnalysisFilter(req: Request, res: Response): Promise<void> {
    try {
      const { EsportsRepository } = await import('@polyrader/infra');
      const repo = new EsportsRepository();
      const config = repo.getAnalysisFilterConfig();
      res.json({ data: config });
    } catch (err) {
      logger.error('Failed to fetch analysis filter config', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch analysis filter config' });
    }
  }

  async updateAnalysisFilter(req: Request, res: Response): Promise<void> {
    try {
      const { EsportsRepository } = await import('@polyrader/infra');
      const repo = new EsportsRepository();
      const { minTier, enabled, minStars, lanOnly, skipIfNoRoster, historyMonths, minVolumeUsd } = req.body;

      if (minTier != null && !['S', 'A', 'B', 'C'].includes(minTier)) {
        res.status(400).json({ error: 'minTier must be one of S, A, B, C' });
        return;
      }

      if (historyMonths != null) {
        const months = Number(historyMonths);
        if (!Number.isInteger(months) || months < 3 || months > 6) {
          res.status(400).json({ error: 'historyMonths must be an integer between 3 and 6' });
          return;
        }
      }

      if (minVolumeUsd != null) {
        const vol = Number(minVolumeUsd);
        if (isNaN(vol) || vol < 0) {
          res.status(400).json({ error: 'minVolumeUsd must be a non-negative number' });
          return;
        }
      }

      const updated = repo.updateAnalysisFilterConfig({
        ...(minTier != null && { minTier }),
        ...(enabled != null && { enabled }),
        ...(minStars != null && { minStars: Number(minStars) }),
        ...(lanOnly != null && { lanOnly: !!lanOnly }),
        ...(skipIfNoRoster != null && { skipIfNoRoster: !!skipIfNoRoster }),
        ...(historyMonths != null && { historyMonths: Number(historyMonths) }),
        ...(minVolumeUsd != null && { minVolumeUsd: Number(minVolumeUsd) }),
      });

      res.json({ data: updated });
    } catch (err) {
      logger.error('Failed to update analysis filter config', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to update analysis filter config' });
    }
  }

  /**
   * GET /api/ai/analysis/timeline/:matchId
   * Returns analysis snapshots for a match within the last N hours (default 24).
   * Used by the win-rate timeline chart on the match detail page (PRD §9.2).
   */
  async getMatchTimeline(req: Request, res: Response): Promise<void> {
    try {
      const { matchId } = req.params;
      const hours = parseInt(req.query.hours as string, 10) || 24;
      const { LLMRepository } = await import('@polyrader/infra');
      const repo = new LLMRepository();
      const snapshots = repo.getAnalysesByMatch(matchId, hours);
      res.json({ data: snapshots });
    } catch (err) {
      logger.error('Failed to fetch match analysis timeline', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch timeline' });
    }
  }
}
