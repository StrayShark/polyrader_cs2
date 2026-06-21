import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ToastProvider } from '../components/ToastProvider';
import { PriceChart } from '../components/PriceChart';
import { CalibrationChart } from '../components/CalibrationChart';

// ============================================================
// ErrorBoundary
// ============================================================
describe('ErrorBoundary', () => {
  it('renders children normally', () => {
    const { container } = render(
      <ErrorBoundary>
        <div>Hello World</div>
      </ErrorBoundary>,
    );
    expect(container.textContent).toContain('Hello World');
  });

  it('renders fallback on error', () => {
    const ThrowError = () => {
      throw new Error('Test error');
    };

    const { container } = render(
      <ErrorBoundary fallback={<div>Custom Error</div>}>
        <ThrowError />
      </ErrorBoundary>,
    );
    expect(container.textContent).toContain('Custom Error');
  });

  it('renders default error UI', () => {
    const ThrowError = () => {
      throw new Error('Something broke');
    };

    const { container } = render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    );
    expect(container.textContent).toContain('Something broke');
  });
});

// ============================================================
// ToastProvider
// ============================================================
describe('ToastProvider', () => {
  it('renders children', () => {
    const { container } = render(
      <ToastProvider>
        <div>Content</div>
      </ToastProvider>,
    );
    expect(container.textContent).toContain('Content');
  });
});

// ============================================================
// PriceChart
// ============================================================
describe('PriceChart', () => {
  it('renders with empty data', () => {
    const { container } = render(
      <BrowserRouter>
        <PriceChart data={[]} />
      </BrowserRouter>,
    );
    expect(container.querySelector('div')).toBeTruthy();
  });

  it('renders with data', () => {
    const data = [
      { time: '2025-01-01T00:00:00Z', value: 0.55 },
      { time: '2025-01-01T01:00:00Z', value: 0.56 },
    ];
    const { container } = render(
      <BrowserRouter>
        <PriceChart data={data} />
      </BrowserRouter>,
    );
    expect(container.querySelector('div')).toBeTruthy();
  });

  it('renders with label', () => {
    const { container } = render(
      <BrowserRouter>
        <PriceChart data={[]} label="Test Chart" />
      </BrowserRouter>,
    );
    expect(container.textContent).toContain('Test Chart');
  });
});

// ============================================================
// CalibrationChart
// ============================================================
describe('CalibrationChart', () => {
  it('renders empty state', () => {
    const { container } = render(
      <BrowserRouter>
        <CalibrationChart data={[]} />
      </BrowserRouter>,
    );
    expect(container.textContent).toContain('暂无校准数据');
  });

  it('renders with data', () => {
    const data = [
      { confidenceBucket: 5, accuracy: 0.52, sampleCount: 10 },
      { confidenceBucket: 7, accuracy: 0.71, sampleCount: 15 },
      { confidenceBucket: 9, accuracy: 0.88, sampleCount: 8 },
    ];
    const { container } = render(
      <BrowserRouter>
        <CalibrationChart data={data} providerName="openai" />
      </BrowserRouter>,
    );
    expect(container.textContent).toContain('openai');
  });
});
