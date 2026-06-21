import type { Request, Response } from 'express';
import { AiConfigService } from '../services/ai-config-service';
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
      const result = await this.service.testConnection(req.params.providerId);
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
      const result = await this.service.analyze(matchId, teamAId, teamBId);
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
}
