import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../services/api.service', () => ({
  get: vi.fn(),
}));

import { get } from '../../../services/api.service';
import {
  handleGetTicketContext,
  getTicketContextToolDefinition,
} from '../get-ticket-context';
import { AECStatus } from '../../../types/ticket';
import type { ForgeConfig } from '../../../services/config.service';
import type { TicketDetail } from '../../../types/ticket';

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
  description: 'The auth token expires without a refresh',
  fileChanges: [
    { path: 'src/auth/token.ts', action: 'modify', notes: 'Add refresh logic' },
  ],
};

describe('getTicketContextToolDefinition', () => {
  it('has the correct tool name', () => {
    expect(getTicketContextToolDefinition.name).toBe('get_ticket_context');
  });

  it('requires ticketId in input schema', () => {
    expect(getTicketContextToolDefinition.inputSchema.required).toContain('ticketId');
  });

  it('has a description', () => {
    expect(getTicketContextToolDefinition.description.length).toBeGreaterThan(0);
  });
});

describe('handleGetTicketContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('success path', () => {
    it('returns ticket data as JSON text content', async () => {
      vi.mocked(get).mockResolvedValue(mockTicket);

      const result = await handleGetTicketContext({ ticketId: 'T-001' }, mockConfig);

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe('T-001');
      expect(parsed.title).toBe('Fix authentication timeout');
      expect(parsed.acceptanceCriteria).toEqual(['Auth token refreshes before expiry']);
    });

    it('calls ApiService.get with correct path and config', async () => {
      vi.mocked(get).mockResolvedValue(mockTicket);

      await handleGetTicketContext({ ticketId: 'T-001' }, mockConfig);

      expect(get).toHaveBeenCalledWith('/tickets/T-001', mockConfig);
    });

    it('includes rich fields (fileChanges) when present', async () => {
      vi.mocked(get).mockResolvedValue(mockTicket);

      const result = await handleGetTicketContext({ ticketId: 'T-001' }, mockConfig);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.fileChanges).toEqual([
        { path: 'src/auth/token.ts', action: 'modify', notes: 'Add refresh logic' },
      ]);
    });

    it('trims whitespace from ticketId before calling API', async () => {
      vi.mocked(get).mockResolvedValue(mockTicket);

      await handleGetTicketContext({ ticketId: '  T-001  ' }, mockConfig);

      expect(get).toHaveBeenCalledWith('/tickets/T-001', mockConfig);
    });
  });

  describe('error paths', () => {
    it('returns isError content when ticket not found (404)', async () => {
      vi.mocked(get).mockRejectedValue(new Error('API error 404: Not Found'));

      const result = await handleGetTicketContext({ ticketId: 'T-999' }, mockConfig);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
      expect(result.content[0].text).toContain('T-999');
      expect(get).toHaveBeenCalledOnce();
    });

    it('returns isError content when backend is unreachable', async () => {
      vi.mocked(get).mockRejectedValue(
        new Error('Cannot reach Forge server. Check your connection or try again later.')
      );

      const result = await handleGetTicketContext({ ticketId: 'T-001' }, mockConfig);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Cannot reach Forge server');
    });

    it('returns isError content for any unexpected error', async () => {
      vi.mocked(get).mockRejectedValue(new Error('Unexpected failure'));

      const result = await handleGetTicketContext({ ticketId: 'T-001' }, mockConfig);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Unexpected failure');
    });

    it('returns error without calling API when ticketId is missing', async () => {
      const result = await handleGetTicketContext({}, mockConfig);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('ticketId');
      expect(get).not.toHaveBeenCalled();
    });

    it('returns error without calling API when ticketId is empty string', async () => {
      const result = await handleGetTicketContext({ ticketId: '' }, mockConfig);

      expect(result.isError).toBe(true);
      expect(get).not.toHaveBeenCalled();
    });

    it('returns error without calling API when ticketId is whitespace only', async () => {
      const result = await handleGetTicketContext({ ticketId: '   ' }, mockConfig);

      expect(result.isError).toBe(true);
      expect(get).not.toHaveBeenCalled();
    });
  });
});
