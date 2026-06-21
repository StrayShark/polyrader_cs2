import { query, queryOne } from '../connection';

export type AlertType = 'price_above' | 'price_below' | 'volume_above';

export interface PriceAlert {
  id: string;
  marketSlug: string;
  marketQuestion: string;
  alertType: AlertType;
  threshold: number;
  currentValue: number;
  triggered: boolean;
  triggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAlertInput {
  id: string;
  marketSlug: string;
  marketQuestion: string;
  alertType: AlertType;
  threshold: number;
}

export interface UpdateAlertInput {
  threshold?: number;
  currentValue?: number;
  triggered?: boolean;
}

/**
 * Repository for price/volume alerts persistence.
 */
export class AlertRepository {
  createAlert(input: CreateAlertInput): PriceAlert {
    query(
      `INSERT INTO price_alerts (id, market_slug, market_question, alert_type, threshold, current_value, triggered)
       VALUES (?, ?, ?, ?, ?, 0, 0)`,
      input.id,
      input.marketSlug,
      input.marketQuestion,
      input.alertType,
      input.threshold,
    );
    return this.getAlertById(input.id)!;
  }

  getAlerts(triggered?: boolean): PriceAlert[] {
    let sql = `SELECT * FROM price_alerts ORDER BY created_at DESC`;
    let params: unknown[] = [];
    if (triggered !== undefined) {
      sql = `SELECT * FROM price_alerts WHERE triggered = ? ORDER BY created_at DESC`;
      params = [triggered ? 1 : 0];
    }
    const rows = query<Record<string, unknown>>(sql, ...params);
    return rows.map(this.mapRow);
  }

  getAlertById(id: string): PriceAlert | null {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM price_alerts WHERE id = ?`,
      id,
    );
    return row ? this.mapRow(row) : null;
  }

  updateAlert(id: string, input: UpdateAlertInput): PriceAlert | null {
    const existing = this.getAlertById(id);
    if (!existing) return null;

    const threshold = input.threshold ?? existing.threshold;
    const currentValue = input.currentValue ?? existing.currentValue;
    const triggered = input.triggered ?? existing.triggered;
    const triggeredAt = input.triggered !== undefined && input.triggered
      ? new Date().toISOString()
      : existing.triggeredAt;

    query(
      `UPDATE price_alerts
       SET threshold = ?, current_value = ?, triggered = ?, triggered_at = ?, updated_at = datetime('now')
       WHERE id = ?`,
      threshold,
      currentValue,
      triggered ? 1 : 0,
      triggeredAt,
      id,
    );
    return this.getAlertById(id);
  }

  deleteAlert(id: string): boolean {
    const existing = this.getAlertById(id);
    if (!existing) return false;
    query(`DELETE FROM price_alerts WHERE id = ?`, id);
    return true;
  }

  getTriggeredAlerts(): PriceAlert[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM price_alerts WHERE triggered = 1 ORDER BY triggered_at DESC`,
    );
    return rows.map(this.mapRow);
  }

  private mapRow(row: Record<string, unknown>): PriceAlert {
    return {
      id: row.id as string,
      marketSlug: row.market_slug as string,
      marketQuestion: row.market_question as string,
      alertType: row.alert_type as AlertType,
      threshold: row.threshold as number,
      currentValue: row.current_value as number,
      triggered: (row.triggered as number) === 1,
      triggeredAt: (row.triggered_at as string | null) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
