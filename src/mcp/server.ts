import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { ForgeConfig } from '../services/config.service.js';
import {
  getTicketContextToolDefinition,
  handleGetTicketContext,
} from './tools/get-ticket-context.js';
import {
  getFileChangesToolDefinition,
  handleGetFileChanges,
} from './tools/get-file-changes.js';
import {
  getRepositoryContextToolDefinition,
  handleGetRepositoryContext,
} from './tools/get-repository-context.js';
import {
  updateTicketStatusToolDefinition,
  handleUpdateTicketStatus,
} from './tools/update-ticket-status.js';

export class ForgeMCPServer {
  private server: Server;
  private transport: StdioServerTransport | null = null;

  constructor(private config: ForgeConfig) {
    this.server = new Server(
      { name: 'forge', version: '0.1.0' },
      { capabilities: { tools: {}, prompts: {} } }
    );

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [getTicketContextToolDefinition, getFileChangesToolDefinition, getRepositoryContextToolDefinition, updateTicketStatusToolDefinition],
    }));

    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: [],
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<any> => {
      const { name, arguments: args = {} } = request.params;

      switch (name) {
        case 'get_ticket_context':
          return handleGetTicketContext(
            args as Record<string, unknown>,
            this.config
          );
        case 'get_file_changes':
          return handleGetFileChanges(
            args as Record<string, unknown>,
            this.config
          );
        case 'get_repository_context':
          return handleGetRepositoryContext(
            args as Record<string, unknown>,
            this.config
          );
        case 'update_ticket_status':
          return handleUpdateTicketStatus(
            args as Record<string, unknown>,
            this.config
          );
        default:
          return {
            content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    });
  }

  async start(): Promise<void> {
    this.transport = new StdioServerTransport();
    await this.server.connect(this.transport);
    process.stderr.write('[forge:mcp] server started\n');
  }

  async stop(): Promise<void> {
    if (!this.transport) return;
    try {
      await this.server.close();
    } catch {
      // Ignore errors during graceful shutdown
    }
    this.transport = null;
    process.stderr.write('[forge:mcp] server stopped\n');
  }
}
