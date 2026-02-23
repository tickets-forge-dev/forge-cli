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

vi.mock('../../services/claude.service', () => ({
  spawnClaude: vi.fn(),
}));

import { load } from '../../services/config.service';
import { isLoggedIn } from '../../services/auth.service';
import { get, patch } from '../../services/api.service';
import { spawnClaude } from '../../services/claude.service';
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
    vi.mocked(spawnClaude).mockResolvedValue(0);
  });

  afterEach(() => {
    mockStderrWrite.mockRestore();
    mockExit.mockRestore();
  });

  it('spawns Claude with execute action and ticketId', async () => {
    await executeCommand.parseAsync(['node', 'execute', 'T-001']);

    expect(spawnClaude).toHaveBeenCalledWith('execute', 'T-001');
  });

  it('exits with the code returned by spawnClaude', async () => {
    vi.mocked(spawnClaude).mockResolvedValue(0);
    await executeCommand.parseAsync(['node', 'execute', 'T-001']);

    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('prints the ticket title to stderr before launching Claude', async () => {
    await executeCommand.parseAsync(['node', 'execute', 'T-001']);

    const output = stderrChunks.join('');
    expect(output).toContain('Fix authentication timeout');
  });

  it('rejects tickets with DRAFT status and exits 1', async () => {
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

  it('continues and spawns Claude even when auto-assign patch fails', async () => {
    vi.mocked(patch).mockRejectedValue(new Error('Network error'));

    await executeCommand.parseAsync(['node', 'execute', 'T-001']);

    expect(spawnClaude).toHaveBeenCalledWith('execute', 'T-001');
    expect(mockExit).toHaveBeenCalledWith(0);
  });
});
