import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../services/api.service', () => ({
  post: vi.fn(),
}));

import { post } from '../../../services/api.service';
import {
  handleSubmitReviewSession,
  submitReviewSessionToolDefinition,
} from '../submit-review-session';
import type { ForgeConfig } from '../../../services/config.service';

const mockConfig: ForgeConfig = {
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  userId: 'user-1',
  teamId: 'team-1',
  user: { email: 'dev@example.com', displayName: 'Dev' },
};

const mockQAItems = [
  { question: 'Should this apply to all roles?', answer: 'Yes, all roles' },
  { question: 'What is the timeout?', answer: '30 seconds' },
];

const mockResponse = {
  success: true,
  ticketId: 'aec_abc123',
  status: 'waiting-for-approval',
};

describe('submitReviewSessionToolDefinition', () => {
  it('has the correct tool name', () => {
    expect(submitReviewSessionToolDefinition.name).toBe('submit_review_session');
  });

  it('has a description', () => {
    expect(submitReviewSessionToolDefinition.description.length).toBeGreaterThan(0);
  });

  it('requires ticketId and qaItems', () => {
    expect(submitReviewSessionToolDefinition.inputSchema.required).toContain('ticketId');
    expect(submitReviewSessionToolDefinition.inputSchema.required).toContain('qaItems');
  });
});

describe('handleSubmitReviewSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(post).mockResolvedValue(mockResponse);
  });

  describe('success path', () => {
    it('returns human-readable success message with ticketId and status', async () => {
      const result = await handleSubmitReviewSession(
        { ticketId: 'aec_abc123', qaItems: mockQAItems },
        mockConfig
      );

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      expect(text).toContain('Review session submitted');
      expect(text).toContain('aec_abc123');
      expect(text).toContain('waiting for approval');
    });

    it('calls ApiService.post with correct path and body', async () => {
      await handleSubmitReviewSession(
        { ticketId: 'aec_abc123', qaItems: mockQAItems },
        mockConfig
      );

      expect(post).toHaveBeenCalledWith(
        '/tickets/aec_abc123/review-session',
        { qaItems: mockQAItems },
        mockConfig
      );
    });

    it('trims whitespace from ticketId', async () => {
      await handleSubmitReviewSession(
        { ticketId: '  aec_abc123  ', qaItems: mockQAItems },
        mockConfig
      );

      expect(post).toHaveBeenCalledWith(
        '/tickets/aec_abc123/review-session',
        { qaItems: mockQAItems },
        mockConfig
      );
    });

    it('includes confirmation message mentioning PM in response', async () => {
      const result = await handleSubmitReviewSession(
        { ticketId: 'aec_abc123', qaItems: mockQAItems },
        mockConfig
      );

      expect(result.content[0].text).toContain('PM');
    });
  });

  describe('input validation', () => {
    it('returns isError for missing ticketId', async () => {
      const result = await handleSubmitReviewSession(
        { qaItems: mockQAItems },
        mockConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Missing required argument: ticketId');
    });

    it('returns isError for empty string ticketId', async () => {
      const result = await handleSubmitReviewSession(
        { ticketId: '', qaItems: mockQAItems },
        mockConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Missing required argument: ticketId');
    });

    it('returns isError for missing qaItems', async () => {
      const result = await handleSubmitReviewSession(
        { ticketId: 'aec_abc123' },
        mockConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('qaItems');
    });

    it('returns isError for empty qaItems array', async () => {
      const result = await handleSubmitReviewSession(
        { ticketId: 'aec_abc123', qaItems: [] },
        mockConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('qaItems');
    });

    it('returns isError for invalid qaItem shape (missing answer)', async () => {
      const result = await handleSubmitReviewSession(
        {
          ticketId: 'aec_abc123',
          qaItems: [{ question: 'What is X?' }],
        },
        mockConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('qaItem');
    });
  });

  describe('error paths', () => {
    it('returns "Ticket not found" for 404 errors', async () => {
      vi.mocked(post).mockRejectedValue(new Error('API error 404: Not Found'));

      const result = await handleSubmitReviewSession(
        { ticketId: 'aec_notexist', qaItems: mockQAItems },
        mockConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Ticket not found: aec_notexist');
    });

    it('returns raw error message for auth errors', async () => {
      vi.mocked(post).mockRejectedValue(
        new Error('Session expired. Run `forge login` to re-authenticate.')
      );

      const result = await handleSubmitReviewSession(
        { ticketId: 'aec_abc123', qaItems: mockQAItems },
        mockConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Session expired');
    });

    it('returns raw error message for network errors', async () => {
      vi.mocked(post).mockRejectedValue(new Error('Cannot reach Forge server'));

      const result = await handleSubmitReviewSession(
        { ticketId: 'aec_abc123', qaItems: mockQAItems },
        mockConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Cannot reach Forge server');
    });
  });
});
