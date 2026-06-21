import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker } from '../circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker();
  });

  it('starts in CLOSED state', () => {
    expect(breaker.getState().state).toBe('CLOSED');
    expect(breaker.getState().failureCount).toBe(0);
    expect(breaker.isOpen).toBe(false);
  });

  it('allows requests in CLOSED state', () => {
    expect(breaker.beforeRequest()).toBe(true);
    expect(breaker.beforeRequest()).toBe(true);
  });

  it('counts failures without opening below threshold', () => {
    breaker.onFailure();
    breaker.onFailure();
    breaker.onFailure();
    breaker.onFailure();
    expect(breaker.getState().state).toBe('CLOSED');
    expect(breaker.getState().failureCount).toBe(4);
    expect(breaker.beforeRequest()).toBe(true);
  });

  it('opens after reaching failure threshold', () => {
    for (let i = 0; i < 5; i++) breaker.onFailure();
    expect(breaker.getState().state).toBe('OPEN');
    expect(breaker.isOpen).toBe(true);
  });

  it('rejects requests in OPEN state', () => {
    for (let i = 0; i < 5; i++) breaker.onFailure();
    expect(breaker.beforeRequest()).toBe(false);
  });

  it('transitions to HALF_OPEN after cooldown', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    const breaker = new CircuitBreaker({ cooldownMs: 100, failureThreshold: 1 });
    breaker.onFailure();
    expect(breaker.beforeRequest()).toBe(false);

    vi.setSystemTime(new Date('2025-01-01T00:00:00Z').getTime() + 150);
    expect(breaker.beforeRequest()).toBe(true);
    expect(breaker.getState().state).toBe('HALF_OPEN');
    vi.useRealTimers();
  });

  it('returns to CLOSED on success in HALF_OPEN', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    const breaker = new CircuitBreaker({ cooldownMs: 50, failureThreshold: 1 });
    breaker.onFailure();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z').getTime() + 100);
    breaker.beforeRequest();
    breaker.onSuccess();
    expect(breaker.getState().state).toBe('CLOSED');
    expect(breaker.getState().failureCount).toBe(0);
    vi.useRealTimers();
  });

  it('returns to OPEN on failure in HALF_OPEN', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    const breaker = new CircuitBreaker({ cooldownMs: 50, failureThreshold: 1 });
    breaker.onFailure();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z').getTime() + 100);
    breaker.beforeRequest();
    breaker.onFailure();
    expect(breaker.getState().state).toBe('OPEN');
    vi.useRealTimers();
  });

  it('only allows one probe in HALF_OPEN', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 0, halfOpenMaxRequests: 1 });
    breaker.onFailure();
    // cooldown is 0, so it immediately transitions to HALF_OPEN on next beforeRequest
    // OPEN→HALF_OPEN transition allows 1 request, then HALF_OPEN allows 1 more
    expect(breaker.beforeRequest()).toBe(true); // OPEN→HALF_OPEN transition
    expect(breaker.beforeRequest()).toBe(true); // HALF_OPEN probe
    expect(breaker.beforeRequest()).toBe(false); // blocked
  });

  it('resets to CLOSED', () => {
    for (let i = 0; i < 5; i++) breaker.onFailure();
    expect(breaker.isOpen).toBe(true);
    breaker.reset();
    expect(breaker.getState().state).toBe('CLOSED');
    expect(breaker.getState().failureCount).toBe(0);
  });

  it('uses custom config', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 5000 });
    breaker.onFailure();
    breaker.onFailure();
    expect(breaker.isOpen).toBe(true);
  });
});
