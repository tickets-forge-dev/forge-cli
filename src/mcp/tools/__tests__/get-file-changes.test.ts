import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../services/api.service', () => ({
  get: vi.fn(),
}));

import { get } from '../../../services/api.service';
import {
  handleGetFileChanges,
  getFileChangesToolDefinition,
} from '../get-file-changes';
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

const mockTicketWithChanges: TicketDetail = {
  id: 'T-001',
  title: 'Fix authentication timeout',
  status: AECStatus.READY,
  acceptanceCriteria: ['Auth token refreshes before expiry'],
  createdAt: '2026-02-20T00:00:00.000Z',
  updatedAt: '2026-02-20T00:00:00.000Z',
  fileChanges: [
    { path: 'src/auth/token.ts', action: 'modify', notes: 'Add refresh logic' },
    { path: 'src/auth/middleware.ts', action: 'create' },
    { path: 'src/auth/legacy.ts', action: 'delete' },
  ],
};

const mockTicketNoChanges: TicketDetail = {
  id: 'T-002',
  title: 'Update docs',
  status: AECStatus.READY,
  acceptanceCriteria: ['Docs updated'],
  createdAt: '2026-02-20T00:00:00.000Z',
  updatedAt: '2026-02-20T00:00:00.000Z',
  // fileChanges intentionally omitted
};

const mockTicketEmptyChanges: TicketDetail = {
  ...mockTicketNoChanges,
  id: 'T-003',
  fileChanges: [],
};

describe('getFileChangesToolDefinition', () => {
  it('has the correct tool name', () => {
    expect(getFileChangesToolDefinition.name).toBe('get_file_changes');
  });

  it('requires ticketId in input schema', () => {
    expect(getFileChangesToolDefinition.inputSchema.required).toContain('ticketId');
  });

  it('has a description', () => {
    expect(getFileChangesToolDefinition.description.length).toBeGreaterThan(0);
  });
});

describe('handleGetFileChanges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('success path', () => {
    it('returns fileChanges as JSON array when present', async () => {
      vi.mocked(get).mockResolvedValue(mockTicketWithChanges);

      const result = await handleGetFileChanges({ ticketId: 'T-001' }, mockConfig);

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(3);
      expect(parsed[0]).toEqual({ path: 'src/auth/token.ts', action: 'modify', notes: 'Add refresh logic' });
      expect(parsed[1]).toEqual({ path: 'src/auth/middleware.ts', action: 'create' });
      expect(parsed[2]).toEqual({ path: 'src/auth/legacy.ts', action: 'delete' });
    });

    it('calls ApiService.get with correct path and config', async () => {
      vi.mocked(get).mockResolvedValue(mockTicketWithChanges);

      await handleGetFileChanges({ ticketId: 'T-001' }, mockConfig);

      expect(get).toHaveBeenCalledWith('/tickets/T-001', mockConfig);
    });

    it('returns empty array when ticket has no fileChanges field', async () => {
      vi.mocked(get).mockResolvedValue(mockTicketNoChanges);

      const result = await handleGetFileChanges({ ticketId: 'T-002' }, mockConfig);

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toEqual([]);
    });

    it('returns empty array when ticket has empty fileChanges array', async () => {
      vi.mocked(get).mockResolvedValue(mockTicketEmptyChanges);

      const result = await handleGetFileChanges({ ticketId: 'T-003' }, mockConfig);

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toEqual([]);
    });

    it('trims whitespace from ticketId before calling API', async () => {
      vi.mocked(get).mockResolvedValue(mockTicketWithChanges);

      await handleGetFileChanges({ ticketId: '  T-001  ' }, mockConfig);

      expect(get).toHaveBeenCalledWith('/tickets/T-001', mockConfig);
    });
  });

  describe('error paths', () => {
    it('returns isError content when ticket not found (404)', async () => {
      vi.mocked(get).mockRejectedValue(new Error('API error 404: Not Found'));

      const result = await handleGetFileChanges({ ticketId: 'T-999' }, mockConfig);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
      expect(result.content[0].text).toContain('T-999');
      expect(get).toHaveBeenCalledOnce();
    });

    it('returns isError content when backend is unreachable', async () => {
      vi.mocked(get).mockRejectedValue(
        new Error('Cannot reach Forge server. Check your connection or try again later.')
      );

      const result = await handleGetFileChanges({ ticketId: 'T-001' }, mockConfig);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Cannot reach Forge server');
    });

    it('returns isError content for any unexpected error', async () => {
      vi.mocked(get).mockRejectedValue(new Error('Unexpected failure'));

      const result = await handleGetFileChanges({ ticketId: 'T-001' }, mockConfig);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Unexpected failure');
    });

    it('returns error without calling API when ticketId is missing', async () => {
      const result = await handleGetFileChanges({}, mockConfig);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('ticketId');
      expect(get).not.toHaveBeenCalled();
    });

    it('returns error without calling API when ticketId is empty string', async () => {
      const result = await handleGetFileChanges({ ticketId: '' }, mockConfig);

      expect(result.isError).toBe(true);
      expect(get).not.toHaveBeenCalled();
    });

    it('returns error without calling API when ticketId is whitespace only', async () => {
      const result = await handleGetFileChanges({ ticketId: '   ' }, mockConfig);

      expect(result.isError).toBe(true);
      expect(get).not.toHaveBeenCalled();
    });
  });
});
