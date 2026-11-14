import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PullToRefreshProvider, usePullToRefresh } from '../PullToRefresh';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('@/hooks/useNotification', () => ({
  useToast: () => toast,
}));

vi.mock('@/utils/nativeShell', () => ({
  hapticTap: vi.fn(),
  hapticSuccess: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const handler = vi.fn(() => Promise.resolve());

const TestPage: React.FC = () => {
  usePullToRefresh(handler);
  return <div>page</div>;
};

function renderProvider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PullToRefreshProvider>
        <TestPage />
      </PullToRefreshProvider>
    </QueryClientProvider>
  );
}

function pull(fromY: number, toY: number) {
  fireEvent.touchStart(window, { touches: [{ clientX: 10, clientY: fromY }] });
  fireEvent.touchMove(window, { touches: [{ clientX: 10, clientY: toY }] });
  fireEvent.touchEnd(window, { changedTouches: [{ clientX: 10, clientY: toY }] });
}

beforeEach(() => {
  handler.mockClear();
  toast.success.mockClear();
  toast.error.mockClear();
});

describe('全局下拉刷新', () => {
  it('超过阈值后触发刷新并提示成功', async () => {
    renderProvider();

    pull(100, 300);

    await waitFor(() => expect(handler).toHaveBeenCalledTimes(1), { timeout: 2000 });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('refresh:done'), { timeout: 2000 });
  });

  it('未超过阈值不触发刷新', async () => {
    renderProvider();

    pull(100, 150);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(handler).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
