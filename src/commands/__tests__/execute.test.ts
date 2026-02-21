import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/config.service', () => ({
  load: vi.fn(),
}));

vi.mock('../../services/auth.service', () => ({
  isLoggedIn: vi.fn(),
}));

vi.mock('../../services/api.service', () => ({
  get: vi.fn(),
  patch: vi.fn(),
}));

import { load } from '../../services/config.service';
import { isLoggedIn } from '../../services/auth.service';
import { get, patch } from '../../services/api.service';
import { executeCommand } from '../execute';
import { AECStatus } from '../../types/ticket';
import type { ForgeConfig } from '../../services/config.service';
import type { TicketDetail } from '../../types/ticket';

const mockConfig: ForgeConfig = {
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  userId: 'user-1',
  teamId: 'team-1',
  user: { email: 'dev@example.com', displayName: 'Dev' },
};

const mockTicket: TicketDetail = {
  id: 'T-001',
  title: 'Fix authentication timeout',
  status: AECStatus.READY,
  acceptanceCriteria: ['Auth token refreshes before expiry'],
  createdAt: '2026-02-20T00:00:00.000Z',
  updatedAt: '2026-02-20T00:00:00.000Z',
};

describe('executeCommand', () => {
  let stderrChunks: string[];
  let mockExit: ReturnType<typeof vi.spyOn>;
  let mockStderrWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    stderrChunks = [];
    mockStderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrChunks.push(chunk.toString());
      return true;
    });
    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    vi.mocked(load).mockResolvedValue(mockConfig);
    vi.mocked(isLoggedIn).mockReturnValue(true);
    vi.mocked(get).mockResolvedValue(mockTicket);
    vi.mocked(patch).mockResolvedValue(mockTicket);
  });

  afterEach(() => {
    mockStderrWrite.mockRestore();
    mockExit.mockRestore();
  });

  it('prints instruction block to stderr with ticketId and prompt name', async () => {
    await executeCommand.parseAsync(['node', 'execute', 'T-001']);

    const output = stderrChunks.join('');
    expect(output).toContain('forge_execute prompt');
    expect(output).toContain('T-001');
    expect(output).toContain('forge mcp install');
  });

  it('exits with code 0 after printing the instruction block', async () => {
    await executeCommand.parseAsync(['node', 'execute', 'T-001']);

    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('prints the ticket title in the instruction block', async () => {
    await executeCommand.parseAsync(['node', 'execute', 'T-001']);

    const output = stderrChunks.join('');
    expect(output).toContain('Fix authentication timeout');
  });

  it('rejects tickets with DRAFT status and exits 1 before the instruction block', async () => {
    vi.mocked(get).mockResolvedValue({ ...mockTicket, status: AECStatus.DRAFT });

    await executeCommand.parseAsync(['node', 'execute', 'T-001']);

    // First exit call must be code 1 (invalid status path)
    expect(mockExit.mock.calls[0][0]).toBe(1);
  });

  it('exits 1 and prints error when not logged in', async () => {
    vi.mocked(isLoggedIn).mockReturnValue(false);

    await executeCommand.parseAsync(['node', 'execute', 'T-001']);

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('calls patch to auto-assign the ticket to the logged-in user', async () => {
    await executeCommand.parseAsync(['node', 'execute', 'T-001']);

    expect(patch).toHaveBeenCalledWith(
      '/tickets/T-001',
      { assignedTo: 'user-1' },
      mockConfig
    );
  });

  it('continues and prints instruction block even when auto-assign patch fails', async () => {
    vi.mocked(patch).mockRejectedValue(new Error('Network error'));

    await executeCommand.parseAsync(['node', 'execute', 'T-001']);

    // Should still exit 0 (success) and print the instruction block
    expect(mockExit).toHaveBeenCalledWith(0);
    const output = stderrChunks.join('');
    expect(output).toContain('forge_execute prompt');
  });
});
