import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../services/api.service', () => ({
  patch: vi.fn(),
}));

import { patch } from '../../../services/api.service';
import {
  handleUpdateTicketStatus,
  updateTicketStatusToolDefinition,
} from '../update-ticket-status';
import { AECStatus } from '../../../types/ticket';
import type { ForgeConfig } from '../../../services/config.service';

const mockConfig: ForgeConfig = {
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  userId: 'user-1',
  teamId: 'team-1',
  user: { email: 'dev@example.com', displayName: 'Dev' },
};

const mockTicket = {
  id: 'T-001',
  title: 'Implement auth',
  status: AECStatus.CREATED,
  acceptanceCriteria: [],
  createdAt: '2026-02-20T00:00:00.000Z',
  updatedAt: '2026-02-20T01:00:00.000Z',
};

describe('updateTicketStatusToolDefinition', () => {
  it('has the correct tool name', () => {
    expect(updateTicketStatusToolDefinition.name).toBe('update_ticket_status');
  });

  it('has a description', () => {
    expect(updateTicketStatusToolDefinition.description.length).toBeGreaterThan(0);
  });

  it('requires ticketId and status', () => {
    expect(updateTicketStatusToolDefinition.inputSchema.required).toContain('ticketId');
    expect(updateTicketStatusToolDefinition.inputSchema.required).toContain('status');
  });
});

describe('handleUpdateTicketStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(patch).mockResolvedValue(mockTicket);
  });

  describe('success path', () => {
    it('returns { success, ticketId, newStatus } on success', async () => {
      const result = await handleUpdateTicketStatus(
        { ticketId: 'T-001', status: 'CREATED' },
        mockConfig
      );

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.ticketId).toBe('T-001');
      expect(parsed.newStatus).toBe(AECStatus.CREATED);
    });

    it('calls ApiService.patch with correct path and body', async () => {
      await handleUpdateTicketStatus(
        { ticketId: 'T-001', status: 'CREATED' },
        mockConfig
      );

      expect(patch).toHaveBeenCalledWith(
        '/tickets/T-001',
        { status: 'CREATED' },
        mockConfig
      );
    });

    it('trims whitespace from ticketId before calling patch', async () => {
      await handleUpdateTicketStatus(
        { ticketId: '  T-001  ', status: 'CREATED' },
        mockConfig
      );

      expect(patch).toHaveBeenCalledWith(
        '/tickets/T-001',
        { status: 'CREATED' },
        mockConfig
      );
    });
  });

  describe('input validation', () => {
    it('returns isError for missing ticketId', async () => {
      const result = await handleUpdateTicketStatus({ status: 'CREATED' }, mockConfig);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Missing required argument: ticketId');
    });

    it('returns isError for empty string ticketId', async () => {
      const result = await handleUpdateTicketStatus(
        { ticketId: '', status: 'CREATED' },
        mockConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Missing required argument: ticketId');
    });

    it('returns isError for whitespace-only ticketId', async () => {
      const result = await handleUpdateTicketStatus(
        { ticketId: '   ', status: 'CREATED' },
        mockConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Missing required argument: ticketId');
    });

    it('returns isError for invalid status value', async () => {
      const result = await handleUpdateTicketStatus(
        { ticketId: 'T-001', status: 'BOGUS_STATUS' },
        mockConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid status: BOGUS_STATUS');
      expect(result.content[0].text).toContain('Must be one of:');
    });

    it('returns isError for missing status', async () => {
      const result = await handleUpdateTicketStatus(
        { ticketId: 'T-001' },
        mockConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid status:');
    });
  });

  describe('error paths', () => {
    it('returns "Ticket not found" for 404 errors', async () => {
      vi.mocked(patch).mockRejectedValue(new Error('API error 404: Not Found'));

      const result = await handleUpdateTicketStatus(
        { ticketId: 'T-999', status: 'CREATED' },
        mockConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Ticket not found: T-999');
    });

    it('returns raw error message for auth errors', async () => {
      vi.mocked(patch).mockRejectedValue(
        new Error('Session expired. Run `forge login` to re-authenticate.')
      );

      const result = await handleUpdateTicketStatus(
        { ticketId: 'T-001', status: 'CREATED' },
        mockConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Session expired');
    });

    it('returns raw error message for network errors', async () => {
      vi.mocked(patch).mockRejectedValue(new Error('Cannot reach Forge server'));

      const result = await handleUpdateTicketStatus(
        { ticketId: 'T-001', status: 'CREATED' },
        mockConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Cannot reach Forge server');
    });
  });
});
