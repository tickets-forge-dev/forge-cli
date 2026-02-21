import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { execSync } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import { tryRegisterMcpServer, writeMcpJson } from '../install';

describe('tryRegisterMcpServer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns registered when claude CLI succeeds (user scope)', async () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from(''));
    const result = await tryRegisterMcpServer('user');

    expect(result).toBe('registered');
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('--scope user'),
      expect.any(Object)
    );
  });

  it('returns registered when claude CLI succeeds (project scope)', async () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from(''));
    const result = await tryRegisterMcpServer('project');

    expect(result).toBe('registered');
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('--scope project'),
      expect.any(Object)
    );
  });

  it('returns skipped when claude CLI is not found (ENOENT)', async () => {
    const err = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });
    vi.mocked(execSync).mockImplementation(() => { throw err; });

    const result = await tryRegisterMcpServer('user');
    expect(result).toBe('skipped');
  });

  it('returns skipped on any execSync failure', async () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error('non-zero exit'); });

    const result = await tryRegisterMcpServer('project');
    expect(result).toBe('skipped');
  });

  it('includes "forge mcp" in the claude command', async () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from(''));
    await tryRegisterMcpServer('user');

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('forge mcp'),
      expect.any(Object)
    );
  });
});

describe('writeMcpJson', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates .mcp.json with forge entry when file does not exist', async () => {
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    await writeMcpJson('/tmp/test-project');

    expect(writeFile).toHaveBeenCalledOnce();
    const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
    const written = JSON.parse(writtenContent);

    expect(written.mcpServers.forge).toEqual({
      type: 'stdio',
      command: 'forge',
      args: ['mcp'],
    });
  });

  it('merges forge entry without overwriting existing entries', async () => {
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          other: { type: 'stdio', command: 'other-tool', args: ['serve'] },
        },
      })
    );

    await writeMcpJson('/tmp/test-project');

    const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
    const written = JSON.parse(writtenContent);

    expect(written.mcpServers.other).toEqual({
      type: 'stdio',
      command: 'other-tool',
      args: ['serve'],
    });
    expect(written.mcpServers.forge).toEqual({
      type: 'stdio',
      command: 'forge',
      args: ['mcp'],
    });
  });

  it('overwrites a stale forge entry with correct config', async () => {
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          forge: { type: 'stdio', command: 'forge', args: ['old-command'] },
        },
      })
    );

    await writeMcpJson('/tmp/test-project');

    const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
    const written = JSON.parse(writtenContent);

    expect(written.mcpServers.forge.args).toEqual(['mcp']);
  });

  it('writes to correct path', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

    await writeMcpJson('/my/project');

    expect(writeFile).toHaveBeenCalledWith(
      '/my/project/.mcp.json',
      expect.any(String),
      'utf-8'
    );
  });
});
