import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
  })),
}));

vi.mock('../../services/config.service', () => ({
  load: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/auth.service', () => ({
  isLoggedIn: vi.fn(),
  startDeviceFlow: vi.fn(),
  pollToken: vi.fn(),
}));

vi.mock('../../mcp/install', () => ({
  tryRegisterMcpServer: vi.fn(),
}));

import { load, save } from '../../services/config.service';
import { isLoggedIn, startDeviceFlow, pollToken } from '../../services/auth.service';
import { tryRegisterMcpServer } from '../../mcp/install';
import { loginCommand } from '../login';

const mockToken = {
  accessToken: 'new-access-token',
  refreshToken: 'new-refresh-token',
  userId: 'user-1',
  teamId: 'team-1',
  user: { email: 'dev@example.com', displayName: 'Dev' },
};

const mockDeviceFlow = {
  deviceCode: 'device-code-123',
  userCode: 'ABCD-1234',
  verificationUri: 'https://forge.app/device',
  expiresIn: 300,
  interval: 5,
};

describe('loginCommand', () => {
  let mockExit: ReturnType<typeof vi.spyOn>;
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.mocked(load).mockResolvedValue(null); // not logged in
    vi.mocked(isLoggedIn).mockReturnValue(false);
    vi.mocked(startDeviceFlow).mockResolvedValue(mockDeviceFlow);
    vi.mocked(pollToken).mockResolvedValue(mockToken);
    vi.mocked(tryRegisterMcpServer).mockResolvedValue('registered');
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockConsoleLog.mockRestore();
  });

  it('calls tryRegisterMcpServer with user scope after successful login', async () => {
    await loginCommand.parseAsync(['node', 'login']);

    expect(tryRegisterMcpServer).toHaveBeenCalledWith('user');
  });

  it('exits with code 0 after successful login even if MCP setup is skipped', async () => {
    vi.mocked(tryRegisterMcpServer).mockResolvedValue('skipped');

    await loginCommand.parseAsync(['node', 'login']);

    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('exits with code 0 even when tryRegisterMcpServer throws', async () => {
    vi.mocked(tryRegisterMcpServer).mockRejectedValue(new Error('claude CLI crashed'));

    await loginCommand.parseAsync(['node', 'login']);

    // Login must succeed — MCP setup errors don't fail login
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('saves config to disk after successful token poll', async () => {
    await loginCommand.parseAsync(['node', 'login']);

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: mockToken.accessToken,
        userId: mockToken.userId,
        teamId: mockToken.teamId,
      })
    );
  });
});
