import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@polyrader/infra', () => ({
  AlertRepository: vi.fn().mockImplementation(() => ({
    getAlerts: vi.fn().mockReturnValue([]),
    getAlertById: vi.fn().mockReturnValue(null),
    createAlert: vi.fn(),
    updateAlert: vi.fn().mockReturnValue(null),
    deleteAlert: vi.fn(),
    getTriggeredAlerts: vi.fn().mockReturnValue([]),
  })),
}));

import { AlertService } from '../services/alert-service';
import type { PriceAlert } from '@polyrader/infra';

function makeAlert(overrides: Partial<PriceAlert> = {}): PriceAlert {
  return {
    id: 'a1',
    marketSlug: 'market-1',
    marketQuestion: 'Test?',
    alertType: 'price_above',
    threshold: 0.65,
    currentValue: 0.5,
    triggered: false,
    triggeredAt: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('AlertService.checkAlerts', () => {
  let service: AlertService;
  let repo: {
    getAlerts: ReturnType<typeof vi.fn>;
    updateAlert: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AlertService();
    repo = (service as unknown as { repo: typeof repo }).repo;
  });

  it('triggers price_above alert when price >= threshold', () => {
    const alert = makeAlert({ id: 'a1', alertType: 'price_above', threshold: 0.65, currentValue: 0.5 });
    repo.getAlerts.mockReturnValue([alert]);

    const triggered = { ...alert, triggered: true, currentValue: 0.7, triggeredAt: '2024-01-02T00:00:00.000Z' };
    repo.updateAlert.mockReturnValue(triggered);

    const prices = new Map([['market-1', { price: 0.7, volume: 1000 }]]);
    const result = service.checkAlerts(prices);

    expect(result).toHaveLength(1);
    expect(result[0].triggered).toBe(true);
    expect(repo.updateAlert).toHaveBeenCalledWith('a1', { currentValue: 0.7, triggered: true });
  });

  it('triggers price_below alert when price <= threshold', () => {
    const alert = makeAlert({ id: 'a2', marketSlug: 'market-2', alertType: 'price_below', threshold: 0.3, currentValue: 0.5 });
    repo.getAlerts.mockReturnValue([alert]);

    const triggered = { ...alert, triggered: true, currentValue: 0.2, triggeredAt: '2024-01-02T00:00:00.000Z' };
    repo.updateAlert.mockReturnValue(triggered);

    const prices = new Map([['market-2', { price: 0.2, volume: 500 }]]);
    const result = service.checkAlerts(prices);

    expect(result).toHaveLength(1);
    expect(result[0].triggered).toBe(true);
    expect(repo.updateAlert).toHaveBeenCalledWith('a2', { currentValue: 0.2, triggered: true });
  });

  it('triggers volume_above alert when volume >= threshold', () => {
    const alert = makeAlert({ id: 'a3', marketSlug: 'market-3', alertType: 'volume_above', threshold: 10000, currentValue: 5000 });
    repo.getAlerts.mockReturnValue([alert]);

    const triggered = { ...alert, triggered: true, currentValue: 15000, triggeredAt: '2024-01-02T00:00:00.000Z' };
    repo.updateAlert.mockReturnValue(triggered);

    const prices = new Map([['market-3', { price: 0.5, volume: 15000 }]]);
    const result = service.checkAlerts(prices);

    expect(result).toHaveLength(1);
    expect(result[0].triggered).toBe(true);
    expect(repo.updateAlert).toHaveBeenCalledWith('a3', { currentValue: 15000, triggered: true });
  });

  it('does not trigger when threshold is not breached', () => {
    const alert = makeAlert({ id: 'a1', alertType: 'price_above', threshold: 0.65, currentValue: 0.5 });
    repo.getAlerts.mockReturnValue([alert]);

    const prices = new Map([['market-1', { price: 0.6, volume: 1000 }]]);
    const result = service.checkAlerts(prices);

    expect(result).toHaveLength(0);
    // Should still update currentValue
    expect(repo.updateAlert).toHaveBeenCalledWith('a1', { currentValue: 0.6 });
  });

  it('does not re-trigger already triggered alerts (only queries non-triggered)', () => {
    // getAlerts(false) returns only non-triggered alerts — empty means all are triggered
    repo.getAlerts.mockReturnValue([]);

    const prices = new Map([['market-1', { price: 0.99, volume: 99999 }]]);
    const result = service.checkAlerts(prices);

    expect(result).toHaveLength(0);
    expect(repo.getAlerts).toHaveBeenCalledWith(false);
    expect(repo.updateAlert).not.toHaveBeenCalled();
  });

  it('skips alerts for markets not present in the price map', () => {
    const alert = makeAlert({ id: 'a1', marketSlug: 'market-unknown', alertType: 'price_above', threshold: 0.65 });
    repo.getAlerts.mockReturnValue([alert]);

    const prices = new Map([['market-1', { price: 0.9, volume: 1000 }]]);
    const result = service.checkAlerts(prices);

    expect(result).toHaveLength(0);
    expect(repo.updateAlert).not.toHaveBeenCalled();
  });

  it('handles multiple alerts in a single check', () => {
    const alert1 = makeAlert({ id: 'a1', marketSlug: 'm1', alertType: 'price_above', threshold: 0.6, currentValue: 0.5 });
    const alert2 = makeAlert({ id: 'a2', marketSlug: 'm2', alertType: 'volume_above', threshold: 5000, currentValue: 3000 });
    const alert3 = makeAlert({ id: 'a3', marketSlug: 'm3', alertType: 'price_below', threshold: 0.4, currentValue: 0.5 });
    repo.getAlerts.mockReturnValue([alert1, alert2, alert3]);

    repo.updateAlert.mockImplementation((id: string) => {
      if (id === 'a1') return { ...alert1, triggered: true, currentValue: 0.7, triggeredAt: '2024-01-02T00:00:00.000Z' };
      if (id === 'a2') return { ...alert2, triggered: true, currentValue: 6000, triggeredAt: '2024-01-02T00:00:00.000Z' };
      return null;
    });

    const prices = new Map([
      ['m1', { price: 0.7, volume: 100 }],
      ['m2', { price: 0.5, volume: 6000 }],
      ['m3', { price: 0.5, volume: 100 }], // price 0.5 > threshold 0.4, not triggered
    ]);
    const result = service.checkAlerts(prices);

    expect(result).toHaveLength(2);
    expect(result.map((a) => a.id).sort()).toEqual(['a1', 'a2']);
  });
});
