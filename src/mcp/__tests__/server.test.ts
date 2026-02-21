import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  // Must use regular function (not arrow) so `new Server()` works as a constructor
  Server: vi.fn(function (this: Record<string, unknown>) {
    this.connect = vi.fn().mockResolvedValue(undefined);
    this.close = vi.fn().mockResolvedValue(undefined);
    this.setRequestHandler = vi.fn();
  }),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  // Must use regular function (not arrow) so `new StdioServerTransport()` works
  StdioServerTransport: vi.fn(function (this: Record<string, unknown>) {}),
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  ListToolsRequestSchema: { method: 'tools/list' },
  ListPromptsRequestSchema: { method: 'prompts/list' },
  GetPromptRequestSchema: { method: 'prompts/get' },
  CallToolRequestSchema: { method: 'tools/call' },
}));

vi.mock('../tools/get-ticket-context.js', () => ({
  getTicketContextToolDefinition: {
    name: 'get_ticket_context',
    description: 'Fetch ticket context',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  handleGetTicketContext: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"id":"T-001"}' }],
  }),
}));

vi.mock('../tools/get-file-changes.js', () => ({
  getFileChangesToolDefinition: {
    name: 'get_file_changes',
    description: 'Fetch file changes for a ticket',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  handleGetFileChanges: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '[{"path":"src/auth.ts","action":"modify"}]' }],
  }),
}));

vi.mock('../tools/get-repository-context.js', () => ({
  getRepositoryContextToolDefinition: {
    name: 'get_repository_context',
    description: 'Fetch repository context',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  handleGetRepositoryContext: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"branch":"main","workingDirectory":"/repo","status":{},"fileTree":""}' }],
  }),
}));

vi.mock('../tools/update-ticket-status.js', () => ({
  updateTicketStatusToolDefinition: {
    name: 'update_ticket_status',
    description: 'Update ticket status',
    inputSchema: { type: 'object', properties: {}, required: ['ticketId', 'status'] },
  },
  handleUpdateTicketStatus: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"success":true,"ticketId":"T-001","newStatus":"CREATED"}' }],
  }),
}));

vi.mock('../prompts/forge-execute.js', () => ({
  forgeExecutePromptDefinition: {
    name: 'forge_execute',
    description: 'Load executor persona and ticket context',
    arguments: [{ name: 'ticketId', description: 'Ticket ID', required: true }],
  },
  handleForgeExecute: vi.fn().mockResolvedValue({
    messages: [{ role: 'user', content: { type: 'text', text: '<agent_guide>...</agent_guide>' } }],
  }),
}));

vi.mock('../prompts/forge-review.js', () => ({
  forgeReviewPromptDefinition: {
    name: 'forge_review',
    description: 'Load reviewer persona and ticket summary',
    arguments: [{ name: 'ticketId', description: 'Ticket ID', required: true }],
  },
  handleForgeReview: vi.fn().mockResolvedValue({
    messages: [{ role: 'user', content: { type: 'text', text: '<agent_guide>...</agent_guide>' } }],
  }),
}));

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { handleGetTicketContext } from '../tools/get-ticket-context.js';
import { handleGetFileChanges } from '../tools/get-file-changes.js';
import { handleGetRepositoryContext } from '../tools/get-repository-context.js';
import { handleUpdateTicketStatus } from '../tools/update-ticket-status.js';
import { handleForgeExecute } from '../prompts/forge-execute.js';
import { handleForgeReview } from '../prompts/forge-review.js';
import { ForgeMCPServer } from '../server';
import type { ForgeConfig } from '../../services/config.service';

const mockConfig: ForgeConfig = {
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  userId: 'user-1',
  teamId: 'team-1',
  user: { email: 'dev@example.com', displayName: 'Dev' },
};

function getServerInstance() {
  return vi.mocked(Server).mock.instances[0] as unknown as {
    connect: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    setRequestHandler: ReturnType<typeof vi.fn>;
  };
}

describe('ForgeMCPServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('start()', () => {
    it('connects the stdio transport to the server', async () => {
      const forgeMcp = new ForgeMCPServer(mockConfig);
      await forgeMcp.start();

      const instance = getServerInstance();
      expect(instance.connect).toHaveBeenCalledOnce();
    });

    it('registers ListTools, ListPrompts, GetPrompt, and CallTool request handlers', () => {
      new ForgeMCPServer(mockConfig);

      const instance = getServerInstance();
      expect(instance.setRequestHandler).toHaveBeenCalledTimes(4);
    });

    it('returns tool list with all three tools from ListTools handler', async () => {
      new ForgeMCPServer(mockConfig);
      const instance = getServerInstance();

      // ListTools is the first handler registered
      const handler = vi.mocked(instance.setRequestHandler).mock.calls[0][1];
      const result = await handler({});
      expect(result.tools).toHaveLength(5);
      const names = result.tools.map((t: { name: string }) => t.name);
      expect(names).toContain('get_ticket_context');
      expect(names).toContain('get_file_changes');
      expect(names).toContain('get_repository_context');
      expect(names).toContain('update_ticket_status');
      expect(names).toContain('submit_review_session');
    });

    it('returns both prompts from ListPrompts handler', async () => {
      new ForgeMCPServer(mockConfig);
      const instance = getServerInstance();

      // ListPrompts is the second handler registered
      const handler = vi.mocked(instance.setRequestHandler).mock.calls[1][1];
      const result = await handler({});
      expect(result.prompts).toHaveLength(2);
      const names = result.prompts.map((p: { name: string }) => p.name);
      expect(names).toContain('forge_execute');
      expect(names).toContain('forge_review');
    });
  });

  describe('GetPrompt dispatch', () => {
    it('dispatches forge_execute to its handler', async () => {
      new ForgeMCPServer(mockConfig);
      const instance = getServerInstance();

      // GetPrompt is the third handler registered (index 2)
      const handler = vi.mocked(instance.setRequestHandler).mock.calls[2][1];
      const result = await handler({
        params: { name: 'forge_execute', arguments: { ticketId: 'T-001' } },
      });

      expect(handleForgeExecute).toHaveBeenCalledWith(
        { ticketId: 'T-001' },
        mockConfig
      );
      expect(result.messages[0].content.text).toContain('agent_guide');
    });

    it('dispatches forge_review to its handler', async () => {
      new ForgeMCPServer(mockConfig);
      const instance = getServerInstance();

      // GetPrompt is the third handler registered (index 2)
      const handler = vi.mocked(instance.setRequestHandler).mock.calls[2][1];
      const result = await handler({
        params: { name: 'forge_review', arguments: { ticketId: 'T-001' } },
      });

      expect(handleForgeReview).toHaveBeenCalledWith(
        { ticketId: 'T-001' },
        mockConfig
      );
      expect(result.messages[0].content.text).toContain('agent_guide');
    });

    it('returns unknown prompt error for unrecognized prompt names', async () => {
      new ForgeMCPServer(mockConfig);
      const instance = getServerInstance();

      const handler = vi.mocked(instance.setRequestHandler).mock.calls[2][1];
      const result = await handler({
        params: { name: 'nonexistent_prompt', arguments: {} },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown prompt: nonexistent_prompt');
    });

    it('handles missing arguments gracefully (defaults to empty object)', async () => {
      new ForgeMCPServer(mockConfig);
      const instance = getServerInstance();

      const handler = vi.mocked(instance.setRequestHandler).mock.calls[2][1];
      await expect(
        handler({ params: { name: 'forge_execute' } })
      ).resolves.not.toThrow();
    });
  });

  describe('CallTool dispatch', () => {
    it('dispatches get_ticket_context to its handler', async () => {
      new ForgeMCPServer(mockConfig);
      const instance = getServerInstance();

      // CallTool is the fourth handler registered (index 3)
      const handler = vi.mocked(instance.setRequestHandler).mock.calls[3][1];
      const result = await handler({
        params: { name: 'get_ticket_context', arguments: { ticketId: 'T-001' } },
      });

      expect(handleGetTicketContext).toHaveBeenCalledWith(
        { ticketId: 'T-001' },
        mockConfig
      );
      expect(result.content[0].text).toBe('{"id":"T-001"}');
    });

    it('dispatches get_file_changes to its handler', async () => {
      new ForgeMCPServer(mockConfig);
      const instance = getServerInstance();

      const handler = vi.mocked(instance.setRequestHandler).mock.calls[3][1];
      const result = await handler({
        params: { name: 'get_file_changes', arguments: { ticketId: 'T-001' } },
      });

      expect(handleGetFileChanges).toHaveBeenCalledWith(
        { ticketId: 'T-001' },
        mockConfig
      );
      expect(result.content[0].text).toBe('[{"path":"src/auth.ts","action":"modify"}]');
    });

    it('dispatches get_repository_context to its handler', async () => {
      new ForgeMCPServer(mockConfig);
      const instance = getServerInstance();

      const handler = vi.mocked(instance.setRequestHandler).mock.calls[3][1];
      const result = await handler({
        params: { name: 'get_repository_context', arguments: { path: '/my/repo' } },
      });

      expect(handleGetRepositoryContext).toHaveBeenCalledWith(
        { path: '/my/repo' },
        mockConfig
      );
      expect(result.content[0].text).toContain('branch');
    });

    it('dispatches update_ticket_status to its handler', async () => {
      new ForgeMCPServer(mockConfig);
      const instance = getServerInstance();

      const handler = vi.mocked(instance.setRequestHandler).mock.calls[3][1];
      const result = await handler({
        params: { name: 'update_ticket_status', arguments: { ticketId: 'T-001', status: 'CREATED' } },
      });

      expect(handleUpdateTicketStatus).toHaveBeenCalledWith(
        { ticketId: 'T-001', status: 'CREATED' },
        mockConfig
      );
      expect(result.content[0].text).toContain('success');
    });

    it('returns unknown tool error for unrecognized tool names', async () => {
      new ForgeMCPServer(mockConfig);
      const instance = getServerInstance();

      const handler = vi.mocked(instance.setRequestHandler).mock.calls[3][1];
      const result = await handler({
        params: { name: 'nonexistent_tool', arguments: {} },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown tool: nonexistent_tool');
    });

    it('handles missing arguments gracefully (defaults to empty object)', async () => {
      new ForgeMCPServer(mockConfig);
      const instance = getServerInstance();

      const handler = vi.mocked(instance.setRequestHandler).mock.calls[3][1];
      // No arguments field in params
      await expect(
        handler({ params: { name: 'get_ticket_context' } })
      ).resolves.not.toThrow();
    });
  });

  describe('stop()', () => {
    it('closes the server gracefully after start', async () => {
      const forgeMcp = new ForgeMCPServer(mockConfig);
      await forgeMcp.start();
      await forgeMcp.stop();

      const instance = getServerInstance();
      expect(instance.close).toHaveBeenCalledOnce();
    });

    it('is a safe noop when called before start', async () => {
      const forgeMcp = new ForgeMCPServer(mockConfig);
      await expect(forgeMcp.stop()).resolves.toBeUndefined();

      const instance = getServerInstance();
      expect(instance.close).not.toHaveBeenCalled();
    });

    it('handles close() throwing without re-throwing', async () => {
      const forgeMcp = new ForgeMCPServer(mockConfig);
      await forgeMcp.start();

      const instance = getServerInstance();
      vi.mocked(instance.close).mockRejectedValueOnce(new Error('transport already closed'));

      await expect(forgeMcp.stop()).resolves.toBeUndefined();
    });
  });
});
