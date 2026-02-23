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

vi.mock('../../ui/pager', () => ({
  printTicketDetail: vi.fn(),
}));

import { load } from '../../services/config.service';
import { isLoggedIn } from '../../services/auth.service';
import { get } from '../../services/api.service';
import { printTicketDetail } from '../../ui/pager';
import { showCommand } from '../show';
import { AECStatus } from '../../types/ticket';
import type { TicketDetail } from '../../types/ticket';

const mockConfig = {
  accessToken: 'tok',
  refreshToken: 'ref',
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  userId: 'u1',
  teamId: 't1',
  user: { email: 'dev@example.com', displayName: 'Dev' },
};

const mockTicket: TicketDetail = {
  id: 'T-001',
  title: 'Add rate limiting',
  status: AECStatus.READY,
  description: 'Prevent brute force',
  acceptanceCriteria: ['Rate limit 5/min'],
  createdAt: '2026-02-22T00:00:00.000Z',
  updatedAt: '2026-02-22T00:00:00.000Z',
  fileChanges: [],
};

describe('showCommand', () => {
  let mockExit: ReturnType<typeof vi.spyOn>;
  let mockConsoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(load).mockResolvedValue(mockConfig);
    vi.mocked(isLoggedIn).mockReturnValue(true);
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it('exits 1 when not logged in', async () => {
    vi.mocked(isLoggedIn).mockReturnValue(false);
    vi.mocked(get).mockResolvedValue(mockTicket); // prevent unhandled throw if code continues past exit

    await showCommand.parseAsync(['node', 'show', 'T-001']);

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('calls GET /tickets/T-001 with config', async () => {
    vi.mocked(get).mockResolvedValue(mockTicket);

    await showCommand.parseAsync(['node', 'show', 'T-001']);

    expect(get).toHaveBeenCalledWith('/tickets/T-001', mockConfig);
  });

  it('calls printTicketDetail with ticket data on success', async () => {
    vi.mocked(get).mockResolvedValue(mockTicket);

    await showCommand.parseAsync(['node', 'show', 'T-001']);

    expect(printTicketDetail).toHaveBeenCalledWith(mockTicket);
  });

  it('exits 0 on success', async () => {
    vi.mocked(get).mockResolvedValue(mockTicket);

    await showCommand.parseAsync(['node', 'show', 'T-001']);

    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('prints "Ticket not found" and exits 1 for 404 errors', async () => {
    vi.mocked(get).mockRejectedValue(new Error('API error 404: Not Found'));

    await showCommand.parseAsync(['node', 'show', 'T-001']);

    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Ticket not found: T-001')
    );
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(printTicketDetail).not.toHaveBeenCalled();
  });

  it('exits 2 for unexpected API errors', async () => {
    vi.mocked(get).mockRejectedValue(new Error('Network timeout'));

    await showCommand.parseAsync(['node', 'show', 'T-001']);

    expect(mockExit).toHaveBeenCalledWith(2);
  });
});
