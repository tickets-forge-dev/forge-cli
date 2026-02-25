/**
 * MCP Integration Tests (Story 6-10)
 *
 * These tests verify the complete chain from ForgeMCPServer dispatch
 * through to the actual tool handlers, with only the lowest-level
 * external dependencies mocked (ApiService and git).
 *
 * Unlike server.test.ts (which mocks the handlers), these tests let
 * the real handlers run — validating the wiring is correct end-to-end.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── MCP SDK mocks (structural only, same as unit tests) ──────────────────────

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn(function (this: Record<string, unknown>) {
    this.connect = vi.fn().mockResolvedValue(undefined);
    this.close = vi.fn().mockResolvedValue(undefined);
    this.setRequestHandler = vi.fn();
  }),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(function (this: Record<string, unknown>) {}),
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  ListToolsRequestSchema: { method: 'tools/list' },
  ListPromptsRequestSchema: { method: 'prompts/list' },
  GetPromptRequestSchema: { method: 'prompts/get' },
  CallToolRequestSchema: { method: 'tools/call' },
}));

// ── External service mocks (lowest-level boundary) ───────────────────────────

vi.mock('../../services/api.service', () => ({
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
}));

vi.mock('simple-git', () => ({
  default: vi.fn(() => ({
    // GitService.getBranch() uses branchLocal()
    branchLocal: vi.fn().mockResolvedValue({ current: 'feat/my-feature' }),
    // GitService.getStatus() uses status()
    status: vi.fn().mockResolvedValue({
      modified: [],
      staged: [],
      not_added: [],
    }),
    // GitService.getFileTree() uses raw(['ls-tree', ...])
    raw: vi.fn().mockResolvedValue('src/auth/login.ts\nsrc/middleware/rate-limit.ts\n'),
  })),
}));

// ── Prompt agent-guide mocks (file reads, not under test here) ───────────────

vi.mock('../../agents/dev-executor.md?raw', () => ({ default: '# Dev Executor Guide' }));
vi.mock('../../agents/dev-reviewer.md?raw', () => ({ default: '# Dev Reviewer Guide' }));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { get, patch, post } from '../../services/api.service';
import { ForgeMCPServer } from '../server';
import { AECStatus } from '../../types/ticket';
import type { ForgeConfig } from '../../services/config.service';
import type { TicketDetail } from '../../types/ticket';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const mockConfig: ForgeConfig = {
  accessToken: 'test-token',
  refreshToken: 'test-refresh',
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  userId: 'user-1',
  teamId: 'team-1',
  user: { email: 'dev@example.com', displayName: 'Dev' },
};

const mockTicket: TicketDetail = {
  id: 'T-001',
  title: 'Add login rate limiting',
  status: AECStatus.READY,
  description: 'Prevent brute force on login endpoint',
  acceptanceCriteria: ['Rate limit to 5 attempts per minute', 'Return 429 on excess'],
  createdAt: '2026-02-21T00:00:00.000Z',
  updatedAt: '2026-02-21T00:00:00.000Z',
  fileChanges: [
    { path: 'src/auth/login.ts', action: 'modify', notes: 'Add rate limit middleware' },
  ],
};

// ── Helper: extract registered CallTool handler from the server instance ──────

function getCallToolHandler() {
  const instance = vi.mocked(Server).mock.instances[0] as unknown as {
    setRequestHandler: ReturnType<typeof vi.fn>;
  };
  // CallTool is registered 4th (index 3): ListTools, ListPrompts, GetPrompt, CallTool
  return vi.mocked(instance.setRequestHandler).mock.calls[3][1] as (
    req: unknown
  ) => Promise<unknown>;
}

function getListToolsHandler() {
  const instance = vi.mocked(Server).mock.instances[0] as unknown as {
    setRequestHandler: ReturnType<typeof vi.fn>;
  };
  return vi.mocked(instance.setRequestHandler).mock.calls[0][1] as (
    req: unknown
  ) => Promise<unknown>;
}

function getGetPromptHandler() {
  const instance = vi.mocked(Server).mock.instances[0] as unknown as {
    setRequestHandler: ReturnType<typeof vi.fn>;
  };
  return vi.mocked(instance.setRequestHandler).mock.calls[2][1] as (
    req: unknown
  ) => Promise<unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('MCP Integration: server → real handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Tool listing ────────────────────────────────────────────────────────────

  describe('ListTools', () => {
    it('lists all 6 registered tools with correct metadata', async () => {
      new ForgeMCPServer(mockConfig);
      const handler = getListToolsHandler();

      const result = await handler({}) as { tools: Array<{ name: string; description: string; inputSchema: unknown }> };

      expect(result.tools).toHaveLength(6);
      const names = result.tools.map(t => t.name);
      expect(names).toContain('get_ticket_context');
      expect(names).toContain('get_file_changes');
      expect(names).toContain('get_repository_context');
      expect(names).toContain('update_ticket_status');
      expect(names).toContain('submit_review_session');
      expect(names).toContain('list_tickets');
    });

    it('each tool has a non-empty description', async () => {
      new ForgeMCPServer(mockConfig);
      const handler = getListToolsHandler();

      const result = await handler({}) as { tools: Array<{ description: string }> };
      for (const tool of result.tools) {
        expect(tool.description.length).toBeGreaterThan(0);
      }
    });

    it('each tool has an inputSchema with type=object', async () => {
      new ForgeMCPServer(mockConfig);
      const handler = getListToolsHandler();

      const result = await handler({}) as { tools: Array<{ inputSchema: { type: string } }> };
      for (const tool of result.tools) {
        expect(tool.inputSchema.type).toBe('object');
      }
    });
  });

  // ── get_ticket_context ──────────────────────────────────────────────────────

  describe('get_ticket_context → real handler', () => {
    it('fetches ticket and returns JSON text via real handler', async () => {
      vi.mocked(get).mockResolvedValue(mockTicket);
      new ForgeMCPServer(mockConfig);
      const callTool = getCallToolHandler();

      const result = await callTool({
        params: { name: 'get_ticket_context', arguments: { ticketId: 'T-001' } },
      }) as { content: Array<{ type: string; text: string }>; isError?: boolean };

      expect(result.isError).toBeUndefined();
      expect(result.content[0].type).toBe('text');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe('T-001');
      expect(parsed.title).toBe('Add login rate limiting');
      expect(get).toHaveBeenCalledWith('/tickets/T-001', mockConfig);
    });

    it('propagates API errors as isError responses', async () => {
      vi.mocked(get).mockRejectedValue(new Error('API error 404: Not Found'));
      new ForgeMCPServer(mockConfig);
      const callTool = getCallToolHandler();

      const result = await callTool({
        params: { name: 'get_ticket_context', arguments: { ticketId: 'T-999' } },
      }) as { isError: boolean; content: Array<{ text: string }> };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });

    it('returns validation error (no API call) when ticketId missing', async () => {
      new ForgeMCPServer(mockConfig);
      const callTool = getCallToolHandler();

      const result = await callTool({
        params: { name: 'get_ticket_context', arguments: {} },
      }) as { isError: boolean; content: Array<{ text: string }> };

      expect(result.isError).toBe(true);
      expect(get).not.toHaveBeenCalled();
    });
  });

  // ── get_file_changes ────────────────────────────────────────────────────────

  describe('get_file_changes → real handler', () => {
    it('fetches ticket file changes and returns formatted text', async () => {
      vi.mocked(get).mockResolvedValue(mockTicket);
      new ForgeMCPServer(mockConfig);
      const callTool = getCallToolHandler();

      const result = await callTool({
        params: { name: 'get_file_changes', arguments: { ticketId: 'T-001' } },
      }) as { content: Array<{ type: string; text: string }>; isError?: boolean };

      expect(result.isError).toBeUndefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('src/auth/login.ts');
    });

    it('returns error when ticketId is blank', async () => {
      new ForgeMCPServer(mockConfig);
      const callTool = getCallToolHandler();

      const result = await callTool({
        params: { name: 'get_file_changes', arguments: { ticketId: '  ' } },
      }) as { isError: boolean };

      expect(result.isError).toBe(true);
      expect(get).not.toHaveBeenCalled();
    });
  });

  // ── get_repository_context ──────────────────────────────────────────────────

  describe('get_repository_context → real handler', () => {
    it('returns repository metadata with branch info', async () => {
      new ForgeMCPServer(mockConfig);
      const callTool = getCallToolHandler();

      // Use '.' (cwd) — path traversal protection blocks absolute paths outside cwd
      const result = await callTool({
        params: { name: 'get_repository_context', arguments: { path: '.' } },
      }) as { content: Array<{ text: string }>; isError?: boolean };

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveProperty('branch');
      expect(parsed).toHaveProperty('workingDirectory');
      expect(parsed).toHaveProperty('status');
    });

    it('rejects paths outside current working directory', async () => {
      new ForgeMCPServer(mockConfig);
      const callTool = getCallToolHandler();

      const result = await callTool({
        params: { name: 'get_repository_context', arguments: { path: '/etc/passwd' } },
      }) as { content: Array<{ text: string }>; isError?: boolean };

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('Path must be within the current working directory');
    });
  });

  // ── update_ticket_status ────────────────────────────────────────────────────

  describe('update_ticket_status → real handler', () => {
    it('patches ticket status and returns success response', async () => {
      vi.mocked(patch).mockResolvedValue({
        id: 'T-001',
        status: 'created',
        title: 'Add login rate limiting',
        updatedAt: '2026-02-21T01:00:00.000Z',
      });
      new ForgeMCPServer(mockConfig);
      const callTool = getCallToolHandler();

      const result = await callTool({
        params: {
          name: 'update_ticket_status',
          arguments: { ticketId: 'T-001', status: 'created' },
        },
      }) as { content: Array<{ text: string }>; isError?: boolean };

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.ticketId).toBe('T-001');
      expect(parsed.newStatus).toBe('created');
    });

    it('returns validation error when status is invalid', async () => {
      new ForgeMCPServer(mockConfig);
      const callTool = getCallToolHandler();

      const result = await callTool({
        params: {
          name: 'update_ticket_status',
          arguments: { ticketId: 'T-001', status: 'INVALID_STATUS' },
        },
      }) as { isError: boolean; content: Array<{ text: string }> };

      expect(result.isError).toBe(true);
      expect(patch).not.toHaveBeenCalled();
    });
  });

  // ── submit_review_session ───────────────────────────────────────────────────

  describe('submit_review_session → real handler', () => {
    const qaItems = [
      { question: 'What is the rate limit threshold?', answer: '5 attempts per minute' },
      { question: 'Should we track by IP or user?', answer: 'By IP address' },
    ];

    it('posts Q&A to backend and returns success response', async () => {
      vi.mocked(post).mockResolvedValue({
        success: true,
        ticketId: 'T-001',
        status: 'waiting-for-approval',
      });
      new ForgeMCPServer(mockConfig);
      const callTool = getCallToolHandler();

      const result = await callTool({
        params: {
          name: 'submit_review_session',
          arguments: { ticketId: 'T-001', qaItems },
        },
      }) as { content: Array<{ text: string }>; isError?: boolean };

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.ticketId).toBe('T-001');
      expect(post).toHaveBeenCalledWith(
        '/tickets/T-001/review-session',
        { qaItems },
        mockConfig
      );
    });

    it('returns validation error when qaItems is empty array', async () => {
      new ForgeMCPServer(mockConfig);
      const callTool = getCallToolHandler();

      const result = await callTool({
        params: {
          name: 'submit_review_session',
          arguments: { ticketId: 'T-001', qaItems: [] },
        },
      }) as { isError: boolean; content: Array<{ text: string }> };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('qaItems');
      expect(post).not.toHaveBeenCalled();
    });

    it('returns validation error when a Q&A item has non-string answer', async () => {
      new ForgeMCPServer(mockConfig);
      const callTool = getCallToolHandler();

      // answer is a number, not a string — should fail type validation
      const result = await callTool({
        params: {
          name: 'submit_review_session',
          arguments: {
            ticketId: 'T-001',
            qaItems: [{ question: 'What?', answer: 42 }],
          },
        },
      }) as { isError: boolean; content: Array<{ text: string }> };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('string fields');
      expect(post).not.toHaveBeenCalled();
    });

    it('propagates backend error as isError response', async () => {
      vi.mocked(post).mockRejectedValue(new Error('API error 403: Forbidden'));
      new ForgeMCPServer(mockConfig);
      const callTool = getCallToolHandler();

      const result = await callTool({
        params: {
          name: 'submit_review_session',
          arguments: { ticketId: 'T-001', qaItems },
        },
      }) as { isError: boolean; content: Array<{ text: string }> };

      expect(result.isError).toBe(true);
    });
  });

  // ── Unknown tool / edge cases ───────────────────────────────────────────────

  describe('unknown tool names', () => {
    it('returns isError for completely unknown tool names', async () => {
      new ForgeMCPServer(mockConfig);
      const callTool = getCallToolHandler();

      const result = await callTool({
        params: { name: 'nonexistent_tool', arguments: {} },
      }) as { isError: boolean; content: Array<{ text: string }> };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown tool: nonexistent_tool');
    });

    it('handles missing arguments field gracefully', async () => {
      vi.mocked(get).mockResolvedValue(mockTicket);
      new ForgeMCPServer(mockConfig);
      const callTool = getCallToolHandler();

      // Missing arguments field — server defaults to {} and handler validates
      const result = await callTool({
        params: { name: 'get_ticket_context' },
      }) as { isError: boolean };

      // Should error (ticketId required) but not throw
      expect(result.isError).toBe(true);
      expect(get).not.toHaveBeenCalled();
    });
  });

  // ── Prompt dispatch ─────────────────────────────────────────────────────────

  describe('GetPrompt dispatch → real handlers', () => {
    it('forge-execute returns messages array with agent guide', async () => {
      new ForgeMCPServer(mockConfig);
      const getPrompt = getGetPromptHandler();

      const result = await getPrompt({
        params: { name: 'forge-execute', arguments: { ticketId: 'T-001' } },
      }) as { messages: Array<{ role: string; content: { type: string; text: string } }> };

      expect(Array.isArray(result.messages)).toBe(true);
      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.messages[0].role).toBe('user');
    });

    it('review returns messages array with reviewer guide', async () => {
      new ForgeMCPServer(mockConfig);
      const getPrompt = getGetPromptHandler();

      const result = await getPrompt({
        params: { name: 'review', arguments: { ticketId: 'T-001' } },
      }) as { messages: Array<{ role: string }> };

      expect(Array.isArray(result.messages)).toBe(true);
      expect(result.messages[0].role).toBe('user');
    });

    it('returns error message for unknown prompt name', async () => {
      new ForgeMCPServer(mockConfig);
      const getPrompt = getGetPromptHandler();

      const result = await getPrompt({
        params: { name: 'forge_unknown', arguments: {} },
      }) as { messages: Array<{ role: string; content: { type: string; text: string } }> };

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content.text).toContain('Error: Unknown prompt: forge_unknown');
    });
  });
});
