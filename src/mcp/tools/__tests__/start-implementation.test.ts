import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../services/api.service', () => ({
  post: vi.fn(),
}));

import { post } from '../../../services/api.service';
import {
  handleStartImplementation,
  startImplementationToolDefinition,
} from '../start-implementation';
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
  { question: 'Which pattern should we follow?', answer: 'Repository pattern' },
  { question: 'Unit or integration tests?', answer: 'Both' },
];

const mockResponse = {
  success: true,
  ticketId: 'aec_abc123',
  branchName: 'forge/aec_abc123-add-auth',
  status: 'executing',
};

describe('startImplementationToolDefinition', () => {
  it('has the correct tool name', () => {
    expect(startImplementationToolDefinition.name).toBe('start_implementation');
  });

  it('has a non-empty description', () => {
    expect(startImplementationToolDefinition.description.length).toBeGreaterThan(0);
  });

  it('requires ticketId and branchName', () => {
    expect(startImplementationToolDefinition.inputSchema.required).toContain('ticketId');
    expect(startImplementationToolDefinition.inputSchema.required).toContain('branchName');
  });

  it('does not require qaItems', () => {
    expect(startImplementationToolDefinition.inputSchema.required).not.toContain('qaItems');
  });
});

describe('handleStartImplementation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(post).mockResolvedValue(mockResponse);
  });

  describe('success path', () => {
    it('returns human-readable success message with ticketId and status', async () => {
      const result = await handleStartImplementation(
        { ticketId: 'aec_abc123', branchName: 'forge/aec_abc123-add-auth' },
        mockConfig
      );

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      expect(text).toContain('aec_abc123');
      expect(text).toContain('forge/aec_abc123-add-auth');
      expect(text).toContain('executing');
    });

    it('calls ApiService.post with correct path and body', async () => {
      await handleStartImplementation(
        { ticketId: 'aec_abc123', branchName: 'forge/aec_abc123-add-auth', qaItems: mockQAItems },
        mockConfig
      );

      expect(post).toHaveBeenCalledWith(
        '/tickets/aec_abc123/start-implementation',
        { branchName: 'forge/aec_abc123-add-auth', qaItems: mockQAItems },
        mockConfig
      );
    });

    it('works without qaItems', async () => {
      await handleStartImplementation(
        { ticketId: 'aec_abc123', branchName: 'forge/aec_abc123-add-auth' },
        mockConfig
      );

      expect(post).toHaveBeenCalledWith(
        '/tickets/aec_abc123/start-implementation',
        { branchName: 'forge/aec_abc123-add-auth', qaItems: undefined },
        mockConfig
      );
    });

    it('works with empty qaItems array', async () => {
      await handleStartImplementation(
        { ticketId: 'aec_abc123', branchName: 'forge/aec_abc123-add-auth', qaItems: [] },
        mockConfig
      );

      // Empty array passes Array.isArray check, map returns []
      expect(post).toHaveBeenCalledWith(
        '/tickets/aec_abc123/start-implementation',
        { branchName: 'forge/aec_abc123-add-auth', qaItems: [] },
        mockConfig
      );
    });

    it('trims whitespace from ticketId', async () => {
      await handleStartImplementation(
        { ticketId: '  aec_abc123  ', branchName: 'forge/aec_abc123-add-auth' },
        mockConfig
      );

      expect(post).toHaveBeenCalledWith(
        '/tickets/aec_abc123/start-implementation',
        { branchName: 'forge/aec_abc123-add-auth', qaItems: undefined },
        mockConfig
      );
    });
  });

  describe('input validation', () => {
    it('returns isError for missing ticketId', async () => {
      const result = await handleStartImplementation(
        { branchName: 'forge/test' },
        mockConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Missing required argument: ticketId');
    });

    it('returns isError for empty string ticketId', async () => {
      const result = await handleStartImplementation(
        { ticketId: '', branchName: 'forge/test' },
        mockConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Missing required argument: ticketId');
    });

    it('returns isError for missing branchName', async () => {
      const result = await handleStartImplementation(
        { ticketId: 'aec_abc123' },
        mockConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Missing required argument: branchName');
    });

    it('returns isError for empty string branchName', async () => {
      const result = await handleStartImplementation(
        { ticketId: 'aec_abc123', branchName: '' },
        mockConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Missing required argument: branchName');
    });

    it('returns isError for branchName not starting with "forge/"', async () => {
      const result = await handleStartImplementation(
        { ticketId: 'aec_abc123', branchName: 'feature/my-branch' },
        mockConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Branch name must start with "forge/"');
    });

    it('returns isError for invalid qaItem shape (missing answer)', async () => {
      const result = await handleStartImplementation(
        {
          ticketId: 'aec_abc123',
          branchName: 'forge/test',
          qaItems: [{ question: 'What is X?' }],
        },
        mockConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('qaItem');
    });

    it('returns isError for invalid qaItem shape (non-string answer)', async () => {
      const result = await handleStartImplementation(
        {
          ticketId: 'aec_abc123',
          branchName: 'forge/test',
          qaItems: [{ question: 'What?', answer: 42 }],
        },
        mockConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('string fields');
    });

    it('does not call API when validation fails', async () => {
      await handleStartImplementation(
        { ticketId: '', branchName: 'forge/test' },
        mockConfig
      );

      expect(post).not.toHaveBeenCalled();
    });
  });

  describe('error paths', () => {
    it('returns "Ticket not found" for 404 errors', async () => {
      vi.mocked(post).mockRejectedValue(new Error('API error 404: Not Found'));

      const result = await handleStartImplementation(
        { ticketId: 'aec_notexist', branchName: 'forge/aec_notexist-test' },
        mockConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Ticket not found: aec_notexist');
    });

    it('returns raw error message for auth errors', async () => {
      vi.mocked(post).mockRejectedValue(
        new Error('Session expired. Run `forge login` to re-authenticate.')
      );

      const result = await handleStartImplementation(
        { ticketId: 'aec_abc123', branchName: 'forge/aec_abc123-test' },
        mockConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Session expired');
    });

    it('returns raw error message for network errors', async () => {
      vi.mocked(post).mockRejectedValue(new Error('Cannot reach Forge server'));

      const result = await handleStartImplementation(
        { ticketId: 'aec_abc123', branchName: 'forge/aec_abc123-test' },
        mockConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Cannot reach Forge server');
    });
  });
});
