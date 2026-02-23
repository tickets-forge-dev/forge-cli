import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/config.service', () => ({
  load: vi.fn(),
  clear: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/auth.service', () => ({
  isLoggedIn: vi.fn(),
}));

import { load, clear } from '../../services/config.service';
import { isLoggedIn } from '../../services/auth.service';
import { logoutCommand } from '../logout';

const mockConfig = {
  accessToken: 'tok',
  refreshToken: 'ref',
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  userId: 'u1',
  teamId: 't1',
  user: { email: 'dev@example.com', displayName: 'Dev' },
};

describe('logoutCommand', () => {
  let mockExit: ReturnType<typeof vi.spyOn>;
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;
  let mockConsoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
  });

  it('exits 0 with a message when already logged out (no config)', async () => {
    vi.mocked(load).mockResolvedValue(null);
    vi.mocked(isLoggedIn).mockReturnValue(false);

    await logoutCommand.parseAsync(['node', 'logout']);

    // process.exit is mocked (no-op), so we only verify the exit code and message
    expect(mockExit).toHaveBeenCalledWith(0);
    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('not logged in'));
  });

  it('calls ConfigService.clear() when logged in and exits 0', async () => {
    vi.mocked(load).mockResolvedValue(mockConfig);
    vi.mocked(isLoggedIn).mockReturnValue(true);

    await logoutCommand.parseAsync(['node', 'logout']);

    expect(clear).toHaveBeenCalledOnce();
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('prints success message after clearing config', async () => {
    vi.mocked(load).mockResolvedValue(mockConfig);
    vi.mocked(isLoggedIn).mockReturnValue(true);

    await logoutCommand.parseAsync(['node', 'logout']);

    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('Logged out successfully')
    );
  });

  it('exits 1 when ConfigService.clear() throws', async () => {
    vi.mocked(load).mockResolvedValue(mockConfig);
    vi.mocked(isLoggedIn).mockReturnValue(true);
    vi.mocked(clear).mockRejectedValue(new Error('disk write failed'));

    await logoutCommand.parseAsync(['node', 'logout']);

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('disk write failed')
    );
  });
});
