/**
 * Circuit breaker for LLM API calls.
 *
 * States: CLOSED → OPEN (after N consecutive failures) → HALF_OPEN (after cooldown)
 *
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: All requests fail fast without calling the provider
 * - HALF_OPEN: Single probe request allowed to test recovery
 */

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerConfig {
  failureThreshold: number;   // consecutive failures to trip
  cooldownMs: number;         // time in OPEN before transitioning to HALF_OPEN
  halfOpenMaxRequests: number; // max probe requests in HALF_OPEN
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  cooldownMs: 60_000,  // 1 minute
  halfOpenMaxRequests: 1,
};

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenRequests = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  get isOpen(): boolean {
    return this.state === 'OPEN';
  }

  /**
   * Called before making a request. Returns true if the request should proceed.
   */
  beforeRequest(): boolean {
    switch (this.state) {
      case 'CLOSED':
        return true;

      case 'OPEN': {
        const elapsed = Date.now() - this.lastFailureTime;
        if (elapsed >= this.config.cooldownMs) {
          this.state = 'HALF_OPEN';
          this.halfOpenRequests = 0;
          return true;
        }
        return false;
      }

      case 'HALF_OPEN':
        if (this.halfOpenRequests < this.config.halfOpenMaxRequests) {
          this.halfOpenRequests++;
          return true;
        }
        return false;

      default:
        return true;
    }
  }

  /**
   * Called on successful request.
   */
  onSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
    this.halfOpenRequests = 0;
  }

  /**
   * Called on failed request.
   */
  onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      return;
    }

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  /**
   * Reset to initial state.
   */
  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.halfOpenRequests = 0;
  }

  getState(): { state: CircuitState; failureCount: number } {
    return { state: this.state, failureCount: this.failureCount };
  }
}
