import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/config.service', () => ({
  load: vi.fn(),
}));

vi.mock('../../services/auth.service', () => ({
  isLoggedIn: vi.fn(),
}));

import { load } from '../../services/config.service';
import { isLoggedIn } from '../../services/auth.service';
import { whoamiCommand } from '../whoami';

const mockConfig = {
  accessToken: 'tok',
  refreshToken: 'ref',
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  userId: 'u1',
  teamId: 'team-42',
  user: { email: 'dev@example.com', displayName: 'Dev User' },
};

describe('whoamiCommand', () => {
  let mockExit: ReturnType<typeof vi.spyOn>;
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockConsoleLog.mockRestore();
  });

  it('shows user name and email when logged in', async () => {
    vi.mocked(load).mockResolvedValue(mockConfig);
    vi.mocked(isLoggedIn).mockReturnValue(true);

    await whoamiCommand.parseAsync(['node', 'whoami']);

    const output = mockConsoleLog.mock.calls.flat().join('\n');
    expect(output).toContain('Dev User');
    expect(output).toContain('dev@example.com');
  });

  it('shows team ID when logged in', async () => {
    vi.mocked(load).mockResolvedValue(mockConfig);
    vi.mocked(isLoggedIn).mockReturnValue(true);

    await whoamiCommand.parseAsync(['node', 'whoami']);

    const output = mockConsoleLog.mock.calls.flat().join('\n');
    expect(output).toContain('team-42');
  });

  it('shows "valid" for non-expired token', async () => {
    vi.mocked(load).mockResolvedValue(mockConfig);
    vi.mocked(isLoggedIn).mockReturnValue(true);

    await whoamiCommand.parseAsync(['node', 'whoami']);

    const output = mockConsoleLog.mock.calls.flat().join('\n');
    expect(output).toContain('valid');
  });

  it('shows "expired" for expired token', async () => {
    const expiredConfig = {
      ...mockConfig,
      expiresAt: new Date(Date.now() - 3_600_000).toISOString(),
    };
    vi.mocked(load).mockResolvedValue(expiredConfig);
    vi.mocked(isLoggedIn).mockReturnValue(true);

    await whoamiCommand.parseAsync(['node', 'whoami']);

    const output = mockConsoleLog.mock.calls.flat().join('\n');
    expect(output).toContain('expired');
  });

  it('exits 1 with helpful message when not logged in', async () => {
    vi.mocked(load).mockResolvedValue(null);
    vi.mocked(isLoggedIn).mockReturnValue(false);

    await whoamiCommand.parseAsync(['node', 'whoami']);

    const output = mockConsoleLog.mock.calls.flat().join('\n');
    expect(output).toContain('Not logged in');
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
