import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../agents/dev-implementer.md', () => ({
  default: '# Dev Implementer Agent\n## Persona\nYou are Forgy in build mode.\n## Principles\n## Process\n',
}));

vi.mock('../../../services/api.service', () => ({
  get: vi.fn(),
}));

import { get } from '../../../services/api.service';
import {
  forgeDevelopPromptDefinition,
  handleForgeDevelop,
} from '../forge-develop';
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
  status: AECStatus.FORGED,
  description: 'Add authentication to the API',
  problemStatement: 'No auth exists',
  solution: 'Add JWT middleware',
  acceptanceCriteria: ['Auth header validated', 'Invalid tokens rejected'],
  fileChanges: [
    { path: 'src/auth.ts', action: 'create' as const, notes: 'New auth module' },
    { path: 'src/app.ts', action: 'modify' as const },
  ],
  apiChanges: 'POST /auth/login returns JWT',
  testPlan: 'Unit test middleware, integration test login flow',
  createdAt: '2026-02-20T00:00:00.000Z',
  updatedAt: '2026-02-20T01:00:00.000Z',
};

describe('forgeDevelopPromptDefinition', () => {
  it('has the correct prompt name', () => {
    expect(forgeDevelopPromptDefinition.name).toBe('forge-develop');
  });

  it('has a non-empty description', () => {
    expect(forgeDevelopPromptDefinition.description.length).toBeGreaterThan(0);
  });

  it('requires ticketId argument', () => {
    const ticketIdArg = forgeDevelopPromptDefinition.arguments.find(
      (a) => a.name === 'ticketId'
    );
    expect(ticketIdArg).toBeDefined();
    expect(ticketIdArg?.required).toBe(true);
  });
});

describe('handleForgeDevelop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(get).mockResolvedValue(mockTicket);
  });

  describe('success path', () => {
    it('returns a user-role prompt message', async () => {
      const result = await handleForgeDevelop({ ticketId: 'T-001' }, mockConfig);

      expect(result.isError).toBeUndefined();
      expect(result.messages).toHaveLength(1);
      expect(result.messages![0].role).toBe('user');
      expect(result.messages![0].content.type).toBe('text');
    });

    it('includes agent_guide section with dev-implementer.md content', async () => {
      const result = await handleForgeDevelop({ ticketId: 'T-001' }, mockConfig);

      const text = result.messages![0].content.text;
      expect(text).toContain('<agent_guide>');
      expect(text).toContain('Dev Implementer Agent');
      expect(text).toContain('</agent_guide>');
    });

    it('includes ticket_context section with ticket XML', async () => {
      const result = await handleForgeDevelop({ ticketId: 'T-001' }, mockConfig);

      const text = result.messages![0].content.text;
      expect(text).toContain('<ticket_context>');
      expect(text).toContain('<ticket id="T-001"');
      expect(text).toContain('<title>Implement auth</title>');
      expect(text).toContain('</ticket_context>');
    });

    it('includes description in ticket XML', async () => {
      const result = await handleForgeDevelop({ ticketId: 'T-001' }, mockConfig);

      const text = result.messages![0].content.text;
      expect(text).toContain('<description>Add authentication to the API</description>');
    });

    it('includes problemStatement in ticket XML', async () => {
      const result = await handleForgeDevelop({ ticketId: 'T-001' }, mockConfig);

      const text = result.messages![0].content.text;
      expect(text).toContain('<problemStatement>No auth exists</problemStatement>');
    });

    it('includes solution in ticket XML', async () => {
      const result = await handleForgeDevelop({ ticketId: 'T-001' }, mockConfig);

      const text = result.messages![0].content.text;
      expect(text).toContain('<solution>Add JWT middleware</solution>');
    });

    it('includes acceptance criteria as <item> elements', async () => {
      const result = await handleForgeDevelop({ ticketId: 'T-001' }, mockConfig);

      const text = result.messages![0].content.text;
      expect(text).toContain('<item>Auth header validated</item>');
      expect(text).toContain('<item>Invalid tokens rejected</item>');
    });

    it('includes file changes as <change> elements', async () => {
      const result = await handleForgeDevelop({ ticketId: 'T-001' }, mockConfig);

      const text = result.messages![0].content.text;
      expect(text).toContain('<change path="src/auth.ts" action="create">New auth module</change>');
      expect(text).toContain('<change path="src/app.ts" action="modify">');
    });

    it('includes apiChanges in ticket XML', async () => {
      const result = await handleForgeDevelop({ ticketId: 'T-001' }, mockConfig);

      const text = result.messages![0].content.text;
      expect(text).toContain('<apiChanges>POST /auth/login returns JWT</apiChanges>');
    });

    it('includes testPlan in ticket XML', async () => {
      const result = await handleForgeDevelop({ ticketId: 'T-001' }, mockConfig);

      const text = result.messages![0].content.text;
      expect(text).toContain('<testPlan>Unit test middleware, integration test login flow</testPlan>');
    });

    it('calls ApiService.get with correct path and trims ticketId whitespace', async () => {
      await handleForgeDevelop({ ticketId: '  T-001  ' }, mockConfig);

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

      const result = await handleForgeDevelop({ ticketId: 'T-001' }, mockConfig);
      const text = result.messages![0].content.text;
      expect(text).toContain('Fix &lt;bug&gt; &amp; &quot;crash&quot;');
    });
  });

  describe('input validation', () => {
    it('returns error message for missing ticketId', async () => {
      const result = await handleForgeDevelop({}, mockConfig);

      expect(result.messages).toHaveLength(1);
      expect(result.messages![0].content.text).toContain('Missing required argument: ticketId');
    });

    it('returns error message for empty string ticketId', async () => {
      const result = await handleForgeDevelop({ ticketId: '' }, mockConfig);

      expect(result.messages).toHaveLength(1);
      expect(result.messages![0].content.text).toContain('Missing required argument: ticketId');
    });

    it('returns error message for whitespace-only ticketId', async () => {
      const result = await handleForgeDevelop({ ticketId: '   ' }, mockConfig);

      expect(result.messages).toHaveLength(1);
      expect(result.messages![0].content.text).toContain('Missing required argument: ticketId');
    });
  });

  describe('error paths', () => {
    it('returns "Ticket not found" for 404 errors', async () => {
      vi.mocked(get).mockRejectedValue(new Error('API error 404: Not Found'));

      const result = await handleForgeDevelop({ ticketId: 'T-999' }, mockConfig);

      expect(result.messages).toHaveLength(1);
      expect(result.messages![0].content.text).toContain('Ticket not found: T-999');
    });

    it('returns error message for auth errors', async () => {
      vi.mocked(get).mockRejectedValue(
        new Error('Session expired. Run `forge login` to re-authenticate.')
      );

      const result = await handleForgeDevelop({ ticketId: 'T-001' }, mockConfig);

      expect(result.messages).toHaveLength(1);
      expect(result.messages![0].content.text).toContain('Session expired');
    });

    it('returns error message for network errors', async () => {
      vi.mocked(get).mockRejectedValue(new Error('Cannot reach Forge server'));

      const result = await handleForgeDevelop({ ticketId: 'T-001' }, mockConfig);

      expect(result.messages).toHaveLength(1);
      expect(result.messages![0].content.text).toContain('Cannot reach Forge server');
    });
  });
});
