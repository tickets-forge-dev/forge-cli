import * as ApiService from '../../services/api.service.js';
import type { ForgeConfig } from '../../services/config.service.js';
import type { TicketDetail } from '../../types/ticket.js';
import type { ToolResult } from '../types.js';

// MCP tool definition — returned by ListTools so Claude Code can discover it
export const getFileChangesToolDefinition = {
  name: 'get_file_changes',
  description:
    'Fetch the list of files to create, modify, or delete for a Forge ticket. Returns a JSON array of file change objects with path, action, and optional notes. Use this to understand what files need to be touched during implementation.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      ticketId: {
        type: 'string',
        description: 'The ticket ID to fetch file changes for (e.g., T-001)',
      },
    },
    required: ['ticketId'],
  },
};

/**
 * Handles the get_file_changes MCP tool call.
 * Fetches the ticket from the Forge backend and returns only its fileChanges array.
 * Returns an empty array when the ticket has no fileChanges.
 * Never throws — all errors are returned as isError content.
 */
export async function handleGetFileChanges(
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
    const changes = ticket.fileChanges ?? [];
    if (changes.length === 0) {
      return {
        content: [{ type: 'text', text: 'No file changes specified for this ticket.' }],
      };
    }
    const lines = changes.map((fc) => {
      const note = fc.notes ? ` — ${fc.notes}` : '';
      return `[${fc.action}] ${fc.path}${note}`;
    });
    return {
      content: [{ type: 'text', text: `File changes for ${ticketId}:\n${lines.join('\n')}` }],
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
