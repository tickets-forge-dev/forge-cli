import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../agents/dev-reviewer.md', () => ({
  default:
    '# Dev Reviewer Agent\n## Persona\nYou are a Forge dev reviewer.\n## Principles\n## Question Categories\n## Examples\n',
}));

vi.mock('../../../services/api.service', () => ({
  get: vi.fn(),
}));

import { get } from '../../../services/api.service';
import {
  forgeReviewPromptDefinition,
  handleForgeReview,
} from '../forge-review';
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
  title: 'Add auth middleware',
  status: AECStatus.READY,
  description: 'Protect API routes with JWT validation',
  problemStatement: 'Routes are publicly accessible',
  solution: 'Add JWT middleware to all protected routes',
  acceptanceCriteria: ['Unauthenticated requests get 401', 'Valid tokens proceed normally'],
  fileChanges: [
    { path: 'src/middleware/auth.ts', action: 'create' as const, notes: 'New auth middleware' },
  ],
  createdAt: '2026-02-21T00:00:00.000Z',
  updatedAt: '2026-02-21T01:00:00.000Z',
};

describe('forgeReviewPromptDefinition', () => {
  it('has the correct prompt name', () => {
    expect(forgeReviewPromptDefinition.name).toBe('forge-review');
  });

  it('has a non-empty description', () => {
    expect(forgeReviewPromptDefinition.description.length).toBeGreaterThan(0);
  });

  it('requires ticketId argument', () => {
    const ticketIdArg = forgeReviewPromptDefinition.arguments.find(
      (a) => a.name === 'ticketId'
    );
    expect(ticketIdArg).toBeDefined();
    expect(ticketIdArg?.required).toBe(true);
  });
});

describe('handleForgeReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(get).mockResolvedValue(mockTicket);
  });

  describe('success path', () => {
    it('returns a user-role prompt message', async () => {
      const result = await handleForgeReview({ ticketId: 'T-001' }, mockConfig);

      expect(result.isError).toBeUndefined();
      expect(result.messages).toHaveLength(1);
      expect(result.messages![0].role).toBe('user');
      expect(result.messages![0].content.type).toBe('text');
    });

    it('includes agent_guide section with dev-reviewer.md content', async () => {
      const result = await handleForgeReview({ ticketId: 'T-001' }, mockConfig);

      const text = result.messages![0].content.text;
      expect(text).toContain('<agent_guide>');
      expect(text).toContain('Dev Reviewer Agent');
      expect(text).toContain('</agent_guide>');
    });

    it('includes ticket_context section with ticket summary XML', async () => {
      const result = await handleForgeReview({ ticketId: 'T-001' }, mockConfig);

      const text = result.messages![0].content.text;
      expect(text).toContain('<ticket_context>');
      expect(text).toContain('<ticket id="T-001"');
      expect(text).toContain('<title>Add auth middleware</title>');
      expect(text).toContain('</ticket_context>');
    });

    it('includes acceptance criteria as <item> elements', async () => {
      const result = await handleForgeReview({ ticketId: 'T-001' }, mockConfig);

      const text = result.messages![0].content.text;
      expect(text).toContain('<item>Unauthenticated requests get 401</item>');
      expect(text).toContain('<item>Valid tokens proceed normally</item>');
    });

    it('does not include fileChanges in the ticket summary XML', async () => {
      const result = await handleForgeReview({ ticketId: 'T-001' }, mockConfig);

      const text = result.messages![0].content.text;
      expect(text).not.toContain('<fileChanges>');
      expect(text).not.toContain('<change ');
    });

    it('calls ApiService.get with correct path and trims ticketId whitespace', async () => {
      await handleForgeReview({ ticketId: '  T-001  ' }, mockConfig);

      expect(get).toHaveBeenCalledWith('/tickets/T-001', mockConfig);
    });

    it('escapes XML special characters in ticket fields', async () => {
      vi.mocked(get).mockResolvedValue({
        ...mockTicket,
        title: 'Fix <bug> & "crash"',
        description: '',
        problemStatement: '',
        solution: '',
        acceptanceCriteria: [],
        fileChanges: [],
      });

      const result = await handleForgeReview({ ticketId: 'T-001' }, mockConfig);
      const text = result.messages![0].content.text;
      expect(text).toContain('Fix &lt;bug&gt; &amp; &quot;crash&quot;');
    });
  });

  describe('input validation', () => {
    it('returns isError for missing ticketId', async () => {
      const result = await handleForgeReview({}, mockConfig);

      expect(result.isError).toBe(true);
      expect(result.content![0].text).toBe('Missing required argument: ticketId');
    });

    it('returns isError for empty string ticketId', async () => {
      const result = await handleForgeReview({ ticketId: '' }, mockConfig);

      expect(result.isError).toBe(true);
      expect(result.content![0].text).toBe('Missing required argument: ticketId');
    });

    it('returns isError for whitespace-only ticketId', async () => {
      const result = await handleForgeReview({ ticketId: '   ' }, mockConfig);

      expect(result.isError).toBe(true);
      expect(result.content![0].text).toBe('Missing required argument: ticketId');
    });
  });

  describe('error paths', () => {
    it('returns "Ticket not found" for 404 errors', async () => {
      vi.mocked(get).mockRejectedValue(new Error('API error 404: Not Found'));

      const result = await handleForgeReview({ ticketId: 'T-999' }, mockConfig);

      expect(result.isError).toBe(true);
      expect(result.content![0].text).toBe('Ticket not found: T-999');
    });

    it('returns raw error message for auth errors', async () => {
      vi.mocked(get).mockRejectedValue(
        new Error('Session expired. Run `forge login` to re-authenticate.')
      );

      const result = await handleForgeReview({ ticketId: 'T-001' }, mockConfig);

      expect(result.isError).toBe(true);
      expect(result.content![0].text).toContain('Session expired');
    });

    it('returns raw error message for network errors', async () => {
      vi.mocked(get).mockRejectedValue(new Error('Cannot reach Forge server'));

      const result = await handleForgeReview({ ticketId: 'T-001' }, mockConfig);

      expect(result.isError).toBe(true);
      expect(result.content![0].text).toContain('Cannot reach Forge server');
    });
  });
});
