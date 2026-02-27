import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
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
import {
  submitReviewSessionToolDefinition,
  handleSubmitReviewSession,
} from './tools/submit-review-session.js';
import {
  listTicketsToolDefinition,
  handleListTickets,
} from './tools/list-tickets.js';
import {
  forgeExecutePromptDefinition,
  handleForgeExecute,
} from './prompts/forge-execute.js';
import {
  forgeReviewPromptDefinition,
  handleForgeReview,
} from './prompts/forge-review.js';
import {
  forgeListPromptDefinition,
  handleForgeList,
} from './prompts/forge-list.js';
import {
  forgeExecPromptDefinition,
  handleForgeExec,
} from './prompts/forge-exec.js';
import {
  forgeDevelopPromptDefinition,
  handleForgeDevelop,
} from './prompts/forge-develop.js';
import {
  startImplementationToolDefinition,
  handleStartImplementation,
} from './tools/start-implementation.js';

export class ForgeMCPServer {
  private server: Server;
  private transport: StdioServerTransport | null = null;

  constructor(private config: ForgeConfig) {
    this.server = new Server(
      { name: 'forge', version: '1.0.0' },
      { capabilities: { tools: {}, prompts: {} } }
    );

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [getTicketContextToolDefinition, getFileChangesToolDefinition, getRepositoryContextToolDefinition, updateTicketStatusToolDefinition, submitReviewSessionToolDefinition, listTicketsToolDefinition, startImplementationToolDefinition],
    }));

    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: [forgeListPromptDefinition, forgeExecPromptDefinition, forgeExecutePromptDefinition, forgeReviewPromptDefinition, forgeDevelopPromptDefinition],
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.server.setRequestHandler(GetPromptRequestSchema, async (request): Promise<any> => {
      const { name, arguments: args = {} } = request.params;
      switch (name) {
        case 'forge-execute':
          return handleForgeExecute(args as Record<string, unknown>, this.config);
        case 'review':
          return handleForgeReview(args as Record<string, unknown>, this.config);
        case 'list':
          return handleForgeList(args as Record<string, unknown>, this.config);
        case 'forge-exec':
          return handleForgeExec(args as Record<string, unknown>, this.config);
        case 'forge-develop':
          return handleForgeDevelop(args as Record<string, unknown>, this.config);
        default:
          return {
            messages: [{ role: 'user' as const, content: { type: 'text' as const, text: `Error: Unknown prompt: ${name}` } }],
          };
      }
    });

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
        case 'submit_review_session':
          return handleSubmitReviewSession(
            args as Record<string, unknown>,
            this.config
          );
        case 'list_tickets':
          return handleListTickets(
            args as Record<string, unknown>,
            this.config
          );
        case 'start_implementation':
          return handleStartImplementation(
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
