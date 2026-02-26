import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../middleware/auth-guard', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('../../services/api.service', () => ({
  get: vi.fn(),
}));

// Mock formatters to avoid chalk dependency in assertions
vi.mock('../../ui/formatters', () => ({
  formatTicketRow: vi.fn((ticket: { id: string }, selected: boolean) =>
    `${selected ? '>' : ' '} ${ticket.id}`
  ),
  statusIcon: vi.fn(() => '●'),
}));

import { requireAuth } from '../../middleware/auth-guard';
import { get } from '../../services/api.service';
import { listCommand } from '../list';
import type { TicketListItem } from '../../types/ticket';
import { AECStatus } from '../../types/ticket';

const mockConfig = {
  accessToken: 'tok',
  refreshToken: 'ref',
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  userId: 'u1',
  teamId: 'team-42',
  user: { email: 'dev@example.com', displayName: 'Dev' },
};

const mockTickets: TicketListItem[] = [
  { id: 'T-001', title: 'Rate limiting', status: AECStatus.READY, assignedTo: 'dev@example.com' },
  { id: 'T-002', title: 'Auth flow', status: AECStatus.DRAFT, assignedTo: undefined },
];

describe('listCommand (non-TTY path)', () => {
  let mockExit: ReturnType<typeof vi.spyOn>;
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;
  let mockConsoleError: ReturnType<typeof vi.spyOn>;
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Force non-TTY mode so we test the plain output path
    originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

    vi.mocked(requireAuth).mockResolvedValue(mockConfig);
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });
  });

  it('exits 1 when not logged in (requireAuth exits)', async () => {
    vi.mocked(requireAuth).mockImplementation(async () => {
      process.exit(1);
      return undefined as never;
    });
    vi.mocked(get).mockResolvedValue([]); // prevent unhandled throw if code continues past exit

    await listCommand.parseAsync(['node', 'list']);

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('passes assignedToMe=true and teamId query params by default', async () => {
    vi.mocked(get).mockResolvedValue([]);

    await listCommand.parseAsync(['node', 'list']);

    expect(get).toHaveBeenCalledWith('/tickets', mockConfig, {
      teamId: 'team-42',
      assignedToMe: 'true',
    });
  });

  it('passes all=true and teamId when --all flag is provided', async () => {
    vi.mocked(get).mockResolvedValue([]);

    await listCommand.parseAsync(['node', 'list', '--all']);

    expect(get).toHaveBeenCalledWith('/tickets', mockConfig, {
      teamId: 'team-42',
      all: 'true',
    });
  });

  it('prints no-tickets message and exits 0 when list is empty', async () => {
    vi.mocked(get).mockResolvedValue([]);

    await listCommand.parseAsync(['node', 'list']);

    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('No tickets')
    );
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('prints tab-separated rows for each ticket and exits 0', async () => {
    vi.mocked(get).mockResolvedValue(mockTickets);

    await listCommand.parseAsync(['node', 'list']);

    // Each ticket should be printed as a tab-separated line
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('T-001')
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('T-002')
    );
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('includes ticket status in each row output', async () => {
    vi.mocked(get).mockResolvedValue(mockTickets);

    await listCommand.parseAsync(['node', 'list']);

    const allOutput = mockConsoleLog.mock.calls.flat().join('\n');
    expect(allOutput).toContain(AECStatus.READY);
  });

  it('renders ticket with no assignee as empty string in tab-separated output', async () => {
    const ticketWithNoAssignee: TicketListItem[] = [
      { id: 'T-003', title: 'Unassigned task', status: AECStatus.DRAFT, assignedTo: undefined },
    ];
    vi.mocked(get).mockResolvedValue(ticketWithNoAssignee);

    await listCommand.parseAsync(['node', 'list']);

    // Row should be: id \t status \t title \t (empty assignee)
    const allOutput = mockConsoleLog.mock.calls.flat().join('\n');
    expect(allOutput).toContain('T-003');
    expect(allOutput).toContain('Unassigned task');
  });

  it('exits 2 on API error', async () => {
    vi.mocked(get).mockRejectedValue(new Error('network failure'));

    await listCommand.parseAsync(['node', 'list']);

    expect(mockExit).toHaveBeenCalledWith(2);
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('network failure')
    );
  });
});
