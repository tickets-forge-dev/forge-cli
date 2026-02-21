import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get, patch } from '../api.service';
import type { ForgeConfig } from '../config.service';

// Mock dependencies
vi.mock('../auth.service', () => ({
  refresh: vi.fn(),
}));
vi.mock('../config.service', () => ({
  save: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { refresh } from '../auth.service';
import { save } from '../config.service';

const config: ForgeConfig = {
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
  expiresAt: '2026-02-20T12:00:00.000Z',
  userId: 'user-1',
  teamId: 'team-1',
  user: { email: 'dev@example.com', displayName: 'Dev' },
};

function mockResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 401 ? 'Unauthorized' : status >= 500 ? 'Server Error' : 'Error',
    json: () => Promise.resolve(body),
  };
}

describe('api.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(save).mockResolvedValue(undefined);
  });

  describe('get — happy path', () => {
    it('fetches with Bearer token and returns parsed JSON', async () => {
      const data = [{ id: 'T-1', title: 'Fix bug' }];
      mockFetch.mockResolvedValue(mockResponse(data));

      const result = await get('/tickets', config);
      expect(result).toEqual(data);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/tickets'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-access-token',
          }),
        })
      );
    });

    it('appends query params to URL', async () => {
      mockFetch.mockResolvedValue(mockResponse([]));
      await get('/tickets', config, { assignedToMe: 'true', teamId: 'team-1' });
      const calledUrl: string = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('assignedToMe=true');
      expect(calledUrl).toContain('teamId=team-1');
    });
  });

  describe('get — network errors', () => {
    it('throws clear message when fetch throws (offline)', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(get('/tickets', config)).rejects.toThrow(
        'Cannot reach Forge server'
      );
    });
  });

  describe('get — 401 with token refresh', () => {
    it('refreshes token and retries on 401', async () => {
      const refreshed = { accessToken: 'new-token', expiresAt: '2026-02-20T13:00:00.000Z' };
      vi.mocked(refresh).mockResolvedValue(refreshed);

      mockFetch
        .mockResolvedValueOnce(mockResponse({}, 401))   // initial → 401
        .mockResolvedValueOnce(mockResponse([{ id: 'T-1' }], 200)); // retry → success

      const result = await get('/tickets', config);
      expect(result).toEqual([{ id: 'T-1' }]);
      expect(refresh).toHaveBeenCalledWith('test-refresh-token');
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: 'new-token' })
      );
    });

    it('throws session expired when retry also returns 401', async () => {
      vi.mocked(refresh).mockResolvedValue({
        accessToken: 'new-token',
        expiresAt: '2026-02-20T13:00:00.000Z',
      });
      mockFetch
        .mockResolvedValueOnce(mockResponse({}, 401))
        .mockResolvedValueOnce(mockResponse({}, 401));

      await expect(get('/tickets', config)).rejects.toThrow('Session expired');
    });

    it('throws session expired when refresh itself fails', async () => {
      vi.mocked(refresh).mockRejectedValue(new Error('Session expired'));
      mockFetch.mockResolvedValueOnce(mockResponse({}, 401));

      await expect(get('/tickets', config)).rejects.toThrow('Session expired');
    });
  });

  describe('get — 5xx retry', () => {
    it('retries after 2s delay on 5xx and returns on success', async () => {
      vi.useFakeTimers();
      mockFetch
        .mockResolvedValueOnce(mockResponse({}, 503))
        .mockResolvedValueOnce(mockResponse([{ id: 'T-1' }], 200));

      const promise = get('/tickets', config);
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;

      expect(result).toEqual([{ id: 'T-1' }]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it('throws with clear message when retry also 5xx', async () => {
      vi.useFakeTimers();
      mockFetch
        .mockResolvedValueOnce(mockResponse({}, 503))
        .mockResolvedValueOnce(mockResponse({}, 503));

      // Attach rejection handler BEFORE advancing timers to avoid unhandled rejection
      const assertion = expect(get('/tickets', config)).rejects.toThrow('Forge server error');
      await vi.advanceTimersByTimeAsync(2000);
      await assertion;
      vi.useRealTimers();
    });
  });

  describe('get — other errors', () => {
    it('throws generic error on other non-OK responses', async () => {
      mockFetch.mockResolvedValue(mockResponse({}, 400));
      await expect(get('/tickets', config)).rejects.toThrow('API error 400');
    });
  });

  describe('patch — happy path', () => {
    it('sends PATCH with correct method, body, and Bearer token', async () => {
      const updated = { id: 'T-1', status: 'CREATED' };
      mockFetch.mockResolvedValue(mockResponse(updated));

      const result = await patch('/tickets/T-1', { status: 'CREATED' }, config);

      expect(result).toEqual(updated);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/tickets/T-1'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'CREATED' }),
          headers: expect.objectContaining({
            Authorization: 'Bearer test-access-token',
          }),
        })
      );
    });
  });

  describe('patch — network errors', () => {
    it('throws clear message when fetch throws (offline)', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(patch('/tickets/T-1', { status: 'CREATED' }, config)).rejects.toThrow(
        'Cannot reach Forge server'
      );
    });
  });

  describe('patch — 401 with token refresh', () => {
    it('refreshes token and retries on 401', async () => {
      const refreshed = { accessToken: 'new-token', expiresAt: '2026-02-20T13:00:00.000Z' };
      vi.mocked(refresh).mockResolvedValue(refreshed);

      mockFetch
        .mockResolvedValueOnce(mockResponse({}, 401))
        .mockResolvedValueOnce(mockResponse({ id: 'T-1', status: 'CREATED' }, 200));

      const result = await patch('/tickets/T-1', { status: 'CREATED' }, config);
      expect(result).toEqual({ id: 'T-1', status: 'CREATED' });
      expect(refresh).toHaveBeenCalledWith('test-refresh-token');
    });

    it('throws session expired when retry also returns 401', async () => {
      vi.mocked(refresh).mockResolvedValue({
        accessToken: 'new-token',
        expiresAt: '2026-02-20T13:00:00.000Z',
      });
      mockFetch
        .mockResolvedValueOnce(mockResponse({}, 401))
        .mockResolvedValueOnce(mockResponse({}, 401));

      await expect(patch('/tickets/T-1', { status: 'CREATED' }, config)).rejects.toThrow(
        'Session expired'
      );
    });
  });

  describe('patch — 5xx retry', () => {
    it('retries after 2s delay on 5xx and returns on success', async () => {
      vi.useFakeTimers();
      mockFetch
        .mockResolvedValueOnce(mockResponse({}, 503))
        .mockResolvedValueOnce(mockResponse({ id: 'T-1', status: 'CREATED' }, 200));

      const promise = patch('/tickets/T-1', { status: 'CREATED' }, config);
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;

      expect(result).toEqual({ id: 'T-1', status: 'CREATED' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });
  });
});
