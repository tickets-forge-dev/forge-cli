import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/config.service', () => ({
  load: vi.fn(),
}));

vi.mock('../../services/auth.service', () => ({
  isLoggedIn: vi.fn(),
}));

vi.mock('../../services/api.service', () => ({
  get: vi.fn(),
}));

import { load } from '../../services/config.service';
import { isLoggedIn } from '../../services/auth.service';
import { get } from '../../services/api.service';
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

    vi.mocked(load).mockResolvedValue(mockConfig);
    vi.mocked(isLoggedIn).mockReturnValue(true);
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockStderrWrite.mockRestore();
    mockConsoleError.mockRestore();
  });

  it('exits 1 when not logged in', async () => {
    vi.mocked(isLoggedIn).mockReturnValue(false);
    vi.mocked(get).mockResolvedValue(makeTicket(AECStatus.READY)); // prevent unhandled throw if code continues past exit

    await reviewCommand.parseAsync(['node', 'review', 'T-001']);

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('exits 1 with "Ticket not found" message for 404', async () => {
    vi.mocked(get).mockRejectedValue(new Error('API error 404: Not Found'));

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

  it('exits 0 and writes MCP instruction block when ticket is READY', async () => {
    vi.mocked(get).mockResolvedValue(makeTicket(AECStatus.READY));

    await reviewCommand.parseAsync(['node', 'review', 'T-001']);

    expect(mockExit).toHaveBeenCalledWith(0);

    // Verify stderr contains ticket ID and prompt name
    const stderrOutput = mockStderrWrite.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(stderrOutput).toContain('T-001');
    expect(stderrOutput).toContain('forge_review');
  });

  it('exits 0 for VALIDATED status (valid for review)', async () => {
    vi.mocked(get).mockResolvedValue(makeTicket(AECStatus.VALIDATED));

    await reviewCommand.parseAsync(['node', 'review', 'T-001']);

    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('exits 0 for CREATED status (valid for review)', async () => {
    vi.mocked(get).mockResolvedValue(makeTicket(AECStatus.CREATED));

    await reviewCommand.parseAsync(['node', 'review', 'T-001']);

    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('exits 0 for DRIFTED status (valid for review)', async () => {
    vi.mocked(get).mockResolvedValue(makeTicket(AECStatus.DRIFTED));

    await reviewCommand.parseAsync(['node', 'review', 'T-001']);

    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('includes the ticket title in the instruction block output', async () => {
    vi.mocked(get).mockResolvedValue(makeTicket(AECStatus.READY));

    await reviewCommand.parseAsync(['node', 'review', 'T-001']);

    const stderrOutput = mockStderrWrite.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(stderrOutput).toContain('Add rate limiting');
  });

  it('exits 2 for unexpected API errors', async () => {
    vi.mocked(get).mockRejectedValue(new Error('Network timeout'));

    await reviewCommand.parseAsync(['node', 'review', 'T-001']);

    expect(mockExit).toHaveBeenCalledWith(2);
  });
});
