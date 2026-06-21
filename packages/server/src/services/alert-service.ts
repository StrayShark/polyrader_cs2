import { AlertRepository, type PriceAlert, type CreateAlertInput } from '@polyrader/infra';
import { randomUUID } from 'crypto';

export class AlertService {
  private repo = new AlertRepository();

  getAlerts(triggered?: boolean): PriceAlert[] {
    return this.repo.getAlerts(triggered);
  }

  getAlertById(id: string): PriceAlert | null {
    return this.repo.getAlertById(id);
  }

  createAlert(input: Omit<CreateAlertInput, 'id'>): PriceAlert {
    return this.repo.createAlert({ ...input, id: randomUUID() });
  }

  updateAlert(id: string, input: {
    threshold?: number;
    currentValue?: number;
    triggered?: boolean;
  }): PriceAlert | null {
    return this.repo.updateAlert(id, input);
  }

  deleteAlert(id: string): boolean {
    return this.repo.deleteAlert(id);
  }

  getTriggeredAlerts(): PriceAlert[] {
    return this.repo.getTriggeredAlerts();
  }

  /**
   * Check all active (non-triggered) alerts against the latest market prices.
   * When a threshold is breached, marks the alert as triggered and records triggeredAt.
   * Returns the list of newly triggered alerts.
   */
  checkAlerts(marketPrices: Map<string, { price: number; volume: number }>): PriceAlert[] {
    const activeAlerts = this.repo.getAlerts(false);
    const triggered: PriceAlert[] = [];

    for (const alert of activeAlerts) {
      const marketData = marketPrices.get(alert.marketSlug);
      if (!marketData) continue;

      let breached = false;
      let currentValue = alert.currentValue;

      switch (alert.alertType) {
        case 'price_above':
          currentValue = marketData.price;
          breached = marketData.price >= alert.threshold;
          break;
        case 'price_below':
          currentValue = marketData.price;
          breached = marketData.price <= alert.threshold;
          break;
        case 'volume_above':
          currentValue = marketData.volume;
          breached = marketData.volume >= alert.threshold;
          break;
      }

      if (breached) {
        const updated = this.repo.updateAlert(alert.id, { currentValue, triggered: true });
        if (updated) triggered.push(updated);
      } else if (currentValue !== alert.currentValue) {
        this.repo.updateAlert(alert.id, { currentValue });
      }
    }

    return triggered;
  }
}
