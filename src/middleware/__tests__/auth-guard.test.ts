import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/config.service', () => ({
  load: vi.fn(),
}));

vi.mock('../../services/auth.service', () => ({
  isLoggedIn: vi.fn(),
}));

import { load } from '../../services/config.service';
import { isLoggedIn } from '../../services/auth.service';
import { requireAuth } from '../auth-guard';
import type { ForgeConfig } from '../../services/config.service';

const mockConfig: ForgeConfig = {
  accessToken: 'tok',
  refreshToken: 'ref',
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  userId: 'u1',
  teamId: 't1',
  user: { email: 'dev@example.com', displayName: 'Dev' },
};

describe('requireAuth', () => {
  let mockExit: ReturnType<typeof vi.spyOn>;
  let mockConsoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it('returns config when user is logged in', async () => {
    vi.mocked(load).mockResolvedValue(mockConfig);
    vi.mocked(isLoggedIn).mockReturnValue(true);

    const result = await requireAuth();

    expect(result).toEqual(mockConfig);
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('exits with code 1 and prints message when not logged in', async () => {
    vi.mocked(load).mockResolvedValue(null);
    vi.mocked(isLoggedIn).mockReturnValue(false);

    await requireAuth();

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Not logged in')
    );
  });
});
