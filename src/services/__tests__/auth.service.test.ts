import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pollToken, startDeviceFlow, isLoggedIn, refresh } from '../auth.service';
import type { ForgeConfig } from '../config.service';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockJsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Bad Request',
    json: () => Promise.resolve(body),
  };
}

describe('auth.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isLoggedIn', () => {
    it('returns true when config has accessToken', () => {
      const config = { accessToken: 'tok' } as Partial<ForgeConfig>;
      expect(isLoggedIn(config)).toBe(true);
    });

    it('returns false when config is null', () => {
      expect(isLoggedIn(null)).toBe(false);
    });

    it('returns false when config has no accessToken', () => {
      expect(isLoggedIn({} as Partial<ForgeConfig>)).toBe(false);
    });
  });

  describe('startDeviceFlow', () => {
    it('returns device flow request on success', async () => {
      const responseData = {
        deviceCode: 'dev-code',
        userCode: 'WXYZ-1234',
        verificationUri: 'https://forge.app/device',
        expiresIn: 300,
        interval: 5,
      };
      mockFetch.mockResolvedValue(mockJsonResponse(responseData));

      const result = await startDeviceFlow();
      expect(result).toEqual(responseData);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/device/request'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('throws when server returns non-OK status', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });

      await expect(startDeviceFlow()).rejects.toThrow('Failed to initiate authentication');
    });
  });

  describe('pollToken', () => {
    const deviceCode = 'dev-code-123';
    const interval = 0; // Use 0ms interval for fast tests

    it('returns token on immediate success', async () => {
      const tokenData = {
        accessToken: 'access-tok',
        refreshToken: 'refresh-tok',
        userId: 'user-1',
        teamId: 'team-1',
        user: { email: 'dev@example.com', displayName: 'Dev' },
      };
      mockFetch.mockResolvedValue(mockJsonResponse(tokenData, 200));

      const result = await pollToken(deviceCode, interval);
      expect(result).toEqual(tokenData);
    });

    it('retries on authorization_pending then succeeds', async () => {
      const tokenData = {
        accessToken: 'access-tok',
        refreshToken: 'refresh-tok',
        userId: 'user-1',
        teamId: 'team-1',
        user: { email: 'dev@example.com', displayName: 'Dev' },
      };

      mockFetch
        .mockResolvedValueOnce(mockJsonResponse({ error: 'authorization_pending' }, 400))
        .mockResolvedValueOnce(mockJsonResponse({ error: 'authorization_pending' }, 400))
        .mockResolvedValueOnce(mockJsonResponse(tokenData, 200));

      const result = await pollToken(deviceCode, interval);
      expect(result).toEqual(tokenData);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('throws on expired_token with clear message', async () => {
      mockFetch.mockResolvedValue(mockJsonResponse({ error: 'expired_token' }, 400));

      await expect(pollToken(deviceCode, interval)).rejects.toThrow(
        'Authorization timed out'
      );
    });

    it('throws on access_denied with clear message', async () => {
      mockFetch.mockResolvedValue(mockJsonResponse({ error: 'access_denied' }, 400));

      await expect(pollToken(deviceCode, interval)).rejects.toThrow(
        'Authorization was denied'
      );
    });

    it('throws after maxMs exceeded', async () => {
      mockFetch.mockResolvedValue(mockJsonResponse({ error: 'authorization_pending' }, 400));

      await expect(pollToken(deviceCode, interval, 1)).rejects.toThrow(
        '5 min exceeded'
      );
    });

    it('throws on unexpected server response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error', json: () => Promise.resolve({}) });

      await expect(pollToken(deviceCode, interval)).rejects.toThrow(
        'Unexpected server response'
      );
    });
  });

  describe('refresh', () => {
    it('returns new accessToken and expiresAt on success', async () => {
      const data = { accessToken: 'new-token', expiresAt: '2026-02-20T13:00:00.000Z' };
      mockFetch.mockResolvedValue(mockJsonResponse(data, 200));

      const result = await refresh('old-refresh-token');
      expect(result).toEqual(data);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/refresh'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ refreshToken: 'old-refresh-token' }),
        })
      );
    });

    it('throws session expired on non-OK response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });

      await expect(refresh('bad-token')).rejects.toThrow('Session expired');
    });
  });
});
