import * as ApiService from '../../services/api.service.js';
import type { ForgeConfig } from '../../services/config.service.js';
import type { TicketDetail } from '../../types/ticket.js';
import type { ToolResult } from '../types.js';

// MCP tool definition — returned by ListTools so Claude Code can discover it
export const getTicketContextToolDefinition = {
  name: 'get_ticket_context',
  description:
    'Fetch the full specification for a Forge ticket including problem statement, solution, acceptance criteria, and file changes. Use this to understand what to implement.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      ticketId: {
        type: 'string',
        description: 'The ticket ID to fetch (e.g., T-001)',
      },
    },
    required: ['ticketId'],
  },
};

/**
 * Handles the get_ticket_context MCP tool call.
 * Fetches the full ticket from the Forge backend and returns it as a JSON string.
 * Never throws — all errors are returned as isError content.
 */
export async function handleGetTicketContext(
  args: Record<string, unknown>,
  config: ForgeConfig
): Promise<ToolResult> {
  const ticketId = args['ticketId'];

  if (!ticketId || typeof ticketId !== 'string' || ticketId.trim() === '') {
    return {
      content: [{ type: 'text', text: 'Missing required argument: ticketId' }],
      isError: true,
    };
  }

  try {
    const ticket = await ApiService.get<TicketDetail>(
      `/tickets/${ticketId.trim()}`,
      config
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(ticket) }],
    };
  } catch (err) {
    const message = (err as Error).message ?? String(err);

    if (message.includes('404')) {
      return {
        content: [{ type: 'text', text: `Ticket not found: ${ticketId}` }],
        isError: true,
      };
    }

    return {
      content: [{ type: 'text', text: message }],
      isError: true,
    };
  }
}
