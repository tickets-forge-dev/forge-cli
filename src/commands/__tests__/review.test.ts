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
import { reviewCommand } from '../review';
import { AECStatus, type TicketDetail } from '../../types/ticket';

const mockConfig = {
  accessToken: 'tok',
  refreshToken: 'ref',
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  userId: 'u1',
  teamId: 't1',
  user: { email: 'dev@example.com', displayName: 'Dev' },
};

function makeTicket(status: AECStatus): TicketDetail {
  return {
    id: 'T-001',
    title: 'Add rate limiting',
    status,
    description: 'Prevent brute force',
    acceptanceCriteria: ['Rate limit 5/min'],
    createdAt: '2026-02-22T00:00:00.000Z',
    updatedAt: '2026-02-22T00:00:00.000Z',
    fileChanges: [],
  };
}

describe('reviewCommand', () => {
  let mockExit: ReturnType<typeof vi.spyOn>;
  let mockStderrWrite: ReturnType<typeof vi.spyOn>;
  let mockConsoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    mockStderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation((() => true) as never);
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(requireAuth).mockResolvedValue(mockConfig);
    vi.mocked(patch).mockResolvedValue({});
    vi.mocked(spawnClaude).mockResolvedValue(0);
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockStderrWrite.mockRestore();
    mockConsoleError.mockRestore();
  });

  it('exits 1 when not logged in (requireAuth exits)', async () => {
    vi.mocked(requireAuth).mockImplementation(async () => {
      process.exit(1);
      return undefined as never;
    });

    await reviewCommand.parseAsync(['node', 'review', 'T-001']);

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('exits 1 with "Ticket not found" message for ApiError 404', async () => {
    vi.mocked(get).mockRejectedValue(new ApiError(404, 'Resource not found.'));

    await reviewCommand.parseAsync(['node', 'review', 'T-001']);

    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Ticket not found: T-001')
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('exits 1 with status-not-ready message when ticket has DRAFT status', async () => {
    vi.mocked(get).mockResolvedValue(makeTicket(AECStatus.DRAFT));

    await reviewCommand.parseAsync(['node', 'review', 'T-001']);

    expect(mockExit).toHaveBeenCalledWith(1);
    // Should mention the invalid status
    const calls = mockConsoleError.mock.calls.flat().join(' ');
    expect(calls).toContain('draft');
  });

  it('spawns Claude with review action when ticket is READY', async () => {
    vi.mocked(get).mockResolvedValue(makeTicket(AECStatus.READY));

    await reviewCommand.parseAsync(['node', 'review', 'T-001']);

    expect(spawnClaude).toHaveBeenCalledWith('review', 'T-001');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('spawns Claude for VALIDATED status (valid for review)', async () => {
    vi.mocked(get).mockResolvedValue(makeTicket(AECStatus.VALIDATED));

    await reviewCommand.parseAsync(['node', 'review', 'T-001']);

    expect(spawnClaude).toHaveBeenCalledWith('review', 'T-001');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('spawns Claude for CREATED status (valid for review)', async () => {
    vi.mocked(get).mockResolvedValue(makeTicket(AECStatus.CREATED));

    await reviewCommand.parseAsync(['node', 'review', 'T-001']);

    expect(spawnClaude).toHaveBeenCalledWith('review', 'T-001');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('spawns Claude for DRIFTED status (valid for review)', async () => {
    vi.mocked(get).mockResolvedValue(makeTicket(AECStatus.DRIFTED));

    await reviewCommand.parseAsync(['node', 'review', 'T-001']);

    expect(spawnClaude).toHaveBeenCalledWith('review', 'T-001');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('prints the ticket title to stderr before launching Claude', async () => {
    vi.mocked(get).mockResolvedValue(makeTicket(AECStatus.READY));

    await reviewCommand.parseAsync(['node', 'review', 'T-001']);

    const stderrOutput = mockStderrWrite.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(stderrOutput).toContain('Add rate limiting');
  });

  it('auto-assigns the ticket before launching Claude', async () => {
    vi.mocked(get).mockResolvedValue(makeTicket(AECStatus.READY));

    await reviewCommand.parseAsync(['node', 'review', 'T-001']);

    expect(patch).toHaveBeenCalledWith(
      '/tickets/T-001',
      { assignedTo: 'u1' },
      mockConfig
    );
  });

  it('exits 2 for unexpected API errors', async () => {
    vi.mocked(get).mockRejectedValue(new Error('Network timeout'));

    await reviewCommand.parseAsync(['node', 'review', 'T-001']);

    expect(mockExit).toHaveBeenCalledWith(2);
  });
});
