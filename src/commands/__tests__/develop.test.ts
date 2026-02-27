import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../middleware/auth-guard', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('../../services/api.service', () => ({
  get: vi.fn(),
  patch: vi.fn(),
  ApiError: class ApiError extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.name = 'ApiError';
      this.statusCode = statusCode;
    }
  },
}));

vi.mock('../../services/claude.service', () => ({
  spawnClaude: vi.fn(),
}));

import { requireAuth } from '../../middleware/auth-guard';
import { get, patch, ApiError } from '../../services/api.service';
import { spawnClaude } from '../../services/claude.service';
import { developCommand } from '../develop';
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
  title: 'Implement feature flag system',
  status: AECStatus.FORGED,
  acceptanceCriteria: ['Feature flags can be toggled at runtime'],
  createdAt: '2026-02-20T00:00:00.000Z',
  updatedAt: '2026-02-20T00:00:00.000Z',
};

describe('developCommand', () => {
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

    vi.mocked(requireAuth).mockResolvedValue(mockConfig);
    vi.mocked(get).mockResolvedValue(mockTicket);
    vi.mocked(patch).mockResolvedValue(mockTicket);
    vi.mocked(spawnClaude).mockResolvedValue(0);
  });

  afterEach(() => {
    mockStderrWrite.mockRestore();
    mockExit.mockRestore();
  });

  it('spawns Claude with develop action and ticketId', async () => {
    await developCommand.parseAsync(['node', 'develop', 'T-001']);

    expect(spawnClaude).toHaveBeenCalledWith('develop', 'T-001');
  });

  it('exits with code 0 when spawnClaude succeeds', async () => {
    vi.mocked(spawnClaude).mockResolvedValue(0);
    await developCommand.parseAsync(['node', 'develop', 'T-001']);

    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('exits with non-zero code when spawnClaude returns non-zero', async () => {
    vi.mocked(spawnClaude).mockResolvedValue(3);
    await developCommand.parseAsync(['node', 'develop', 'T-001']);

    expect(mockExit).toHaveBeenCalledWith(3);
  });

  it('prints the ticket title to stderr before launching Claude', async () => {
    await developCommand.parseAsync(['node', 'develop', 'T-001']);

    const output = stderrChunks.join('');
    expect(output).toContain('Implement feature flag system');
  });

  it('exits 1 when auth fails', async () => {
    vi.mocked(requireAuth).mockImplementation(async () => {
      process.exit(1);
      return undefined as never;
    });

    await developCommand.parseAsync(['node', 'develop', 'T-001']);

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('prints "Ticket not found" and exits 1 for ApiError 404', async () => {
    vi.mocked(get).mockRejectedValue(new ApiError(404, 'Resource not found.'));
    const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await developCommand.parseAsync(['node', 'develop', 'T-001']);

    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Ticket not found: T-001')
    );
    expect(mockExit).toHaveBeenCalledWith(1);
    mockConsoleError.mockRestore();
  });

  it('accepts FORGED status', async () => {
    vi.mocked(get).mockResolvedValue({ ...mockTicket, status: AECStatus.FORGED });
    await developCommand.parseAsync(['node', 'develop', 'T-001']);

    expect(spawnClaude).toHaveBeenCalledWith('develop', 'T-001');
  });

  it('accepts READY status (legacy alias)', async () => {
    vi.mocked(get).mockResolvedValue({ ...mockTicket, status: AECStatus.READY });
    await developCommand.parseAsync(['node', 'develop', 'T-001']);

    expect(spawnClaude).toHaveBeenCalledWith('develop', 'T-001');
  });

  it.each([
    AECStatus.DRAFT,
    AECStatus.EXECUTING,
    AECStatus.COMPLETE,
    AECStatus.VALIDATED,
  ])('rejects tickets with %s status and exits 1', async (status) => {
    vi.mocked(get).mockResolvedValue({ ...mockTicket, status });

    await developCommand.parseAsync(['node', 'develop', 'T-001']);

    // First exit call must be code 1 (invalid status path)
    expect(mockExit.mock.calls[0][0]).toBe(1);
  });

  it('calls patch to auto-assign the ticket to the logged-in user', async () => {
    await developCommand.parseAsync(['node', 'develop', 'T-001']);

    expect(patch).toHaveBeenCalledWith(
      '/tickets/T-001',
      { assignedTo: 'user-1' },
      mockConfig
    );
  });

  it('continues and spawns Claude even when auto-assign patch fails', async () => {
    vi.mocked(patch).mockRejectedValue(new Error('Network error'));

    await developCommand.parseAsync(['node', 'develop', 'T-001']);

    expect(spawnClaude).toHaveBeenCalledWith('develop', 'T-001');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('exits 2 for unexpected errors', async () => {
    vi.mocked(get).mockRejectedValue(new Error('Connection refused'));
    const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await developCommand.parseAsync(['node', 'develop', 'T-001']);

    expect(mockExit).toHaveBeenCalledWith(2);
    mockConsoleError.mockRestore();
  });
});
