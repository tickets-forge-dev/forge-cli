import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/config.service.js', () => ({
  load: vi.fn(),
}));

vi.mock('../../services/auth.service.js', () => ({
  isLoggedIn: vi.fn(),
}));

vi.mock('../../mcp/server.js', () => ({
  ForgeMCPServer: vi.fn(function (this: Record<string, unknown>) {
    this.start = vi.fn().mockResolvedValue(undefined);
    this.stop = vi.fn().mockResolvedValue(undefined);
  }),
}));

vi.mock('../../mcp/install.js', () => ({
  writeMcpJson: vi.fn().mockResolvedValue(undefined),
  tryRegisterMcpServer: vi.fn().mockResolvedValue('registered'),
}));

import { load } from '../../services/config.service.js';
import { isLoggedIn } from '../../services/auth.service.js';
import { writeMcpJson, tryRegisterMcpServer } from '../../mcp/install.js';
import { mcpCommand } from '../mcp';

const mockConfig = {
  accessToken: 'tok',
  refreshToken: 'ref',
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  userId: 'u1',
  teamId: 't1',
  user: { email: 'dev@example.com', displayName: 'Dev' },
};

describe('mcpCommand install subcommand', () => {
  let mockExit: ReturnType<typeof vi.spyOn>;
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;
  let mockConsoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(load).mockResolvedValue(mockConfig);
    vi.mocked(isLoggedIn).mockReturnValue(true);
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
  });

  it('calls writeMcpJson() during mcp install', async () => {
    await mcpCommand.parseAsync(['node', 'mcp', 'install']);

    expect(writeMcpJson).toHaveBeenCalledOnce();
  });

  it('calls tryRegisterMcpServer with project scope', async () => {
    await mcpCommand.parseAsync(['node', 'mcp', 'install']);

    expect(tryRegisterMcpServer).toHaveBeenCalledWith('project');
  });

  it('prints success output after writing .mcp.json', async () => {
    await mcpCommand.parseAsync(['node', 'mcp', 'install']);

    const output = mockConsoleLog.mock.calls.flat().join('\n');
    expect(output).toContain('.mcp.json');
  });

  it('prints info message when claude CLI is not found (skipped)', async () => {
    vi.mocked(tryRegisterMcpServer).mockResolvedValue('skipped');

    await mcpCommand.parseAsync(['node', 'mcp', 'install']);

    const output = mockConsoleLog.mock.calls.flat().join('\n');
    expect(output).toContain('claude CLI not found');
  });

  it('prints registered confirmation when claude CLI is found', async () => {
    vi.mocked(tryRegisterMcpServer).mockResolvedValue('registered');

    await mcpCommand.parseAsync(['node', 'mcp', 'install']);

    const output = mockConsoleLog.mock.calls.flat().join('\n');
    expect(output).toContain('Registered via');
  });

  it('exits 1 when writeMcpJson() throws', async () => {
    vi.mocked(writeMcpJson).mockRejectedValue(new Error('EACCES: permission denied'));

    await mcpCommand.parseAsync(['node', 'mcp', 'install']);

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('permission denied')
    );
  });
});
