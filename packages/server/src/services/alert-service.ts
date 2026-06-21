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
}
