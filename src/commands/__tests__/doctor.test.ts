import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/config.service', () => ({
  load: vi.fn(),
  getConfigPath: vi.fn(() => '/home/user/.forge/config.json'),
}));

vi.mock('../../services/auth.service', () => ({
  isLoggedIn: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { load, getConfigPath } from '../../services/config.service';
import { isLoggedIn } from '../../services/auth.service';
import * as fs from 'fs/promises';
import { execFile } from 'child_process';
import { doctorCommand } from '../doctor';

const mockConfig = {
  accessToken: 'tok',
  refreshToken: 'ref',
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  userId: 'u1',
  teamId: 't1',
  user: { email: 'dev@example.com', displayName: 'Dev' },
};

describe('doctorCommand', () => {
  let mockExit: ReturnType<typeof vi.spyOn>;
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Default: everything passes
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(load).mockResolvedValue(mockConfig);
    vi.mocked(isLoggedIn).mockReturnValue(true);
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    vi.mocked(execFile).mockImplementation((_cmd, _args, cb) => {
      (cb as Function)(null, 'claude 1.0.0', '');
      return undefined as never;
    });
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({ mcpServers: { forge: {} } })
    );
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockConsoleLog.mockRestore();
  });

  it('exits 0 when all checks pass', async () => {
    await doctorCommand.parseAsync(['node', 'doctor']);

    expect(mockExit).toHaveBeenCalledWith(0);
    const output = mockConsoleLog.mock.calls.flat().join('\n');
    expect(output).toContain('All checks passed');
  });

  it('exits 1 when config file is missing', async () => {
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

    await doctorCommand.parseAsync(['node', 'doctor']);

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('exits 1 when not authenticated', async () => {
    vi.mocked(isLoggedIn).mockReturnValue(false);

    await doctorCommand.parseAsync(['node', 'doctor']);

    expect(mockExit).toHaveBeenCalledWith(1);
    const output = mockConsoleLog.mock.calls.flat().join('\n');
    expect(output).toContain('FAIL');
  });

  it('exits 1 when API is not reachable', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    await doctorCommand.parseAsync(['node', 'doctor']);

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('exits 1 when Claude CLI is not installed', async () => {
    vi.mocked(execFile).mockImplementation((_cmd, _args, cb) => {
      (cb as Function)(new Error('ENOENT'), '', '');
      return undefined as never;
    });

    await doctorCommand.parseAsync(['node', 'doctor']);

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('reports FAIL when .mcp.json is missing', async () => {
    // access for config path succeeds, but readFile for .mcp.json fails
    vi.mocked(fs.access)
      .mockResolvedValueOnce(undefined)  // config file exists
      .mockRejectedValueOnce(new Error('ENOENT')); // .mcp.json missing

    await doctorCommand.parseAsync(['node', 'doctor']);

    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
