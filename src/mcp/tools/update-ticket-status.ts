import * as ApiService from '../../services/api.service.js';
import type { ForgeConfig } from '../../services/config.service.js';
import { AECStatus, type TicketDetail } from '../../types/ticket.js';
import type { ToolResult } from '../types.js';

// MCP tool definition — returned by ListTools so Claude Code can discover it
export const updateTicketStatusToolDefinition = {
  name: 'update_ticket_status',
  description:
    'Update the status of a Forge ticket. Call this after completing implementation to mark the ticket as CREATED, or to transition it to another valid status.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      ticketId: {
        type: 'string',
        description: 'The ticket ID to update (e.g., "T-001")',
      },
      status: {
        type: 'string',
        description: `New status value. Must be one of: ${Object.values(AECStatus).join(', ')}`,
      },
    },
    required: ['ticketId', 'status'],
  },
};

/**
 * Handles the update_ticket_status MCP tool call.
 * Validates inputs then calls PATCH /tickets/:id with the new status.
 * Returns { success: true, ticketId, newStatus } on success.
 * Never throws — all errors are returned as isError content.
 */
export async function handleUpdateTicketStatus(
  args: Record<string, unknown>,
  config: ForgeConfig
): Promise<ToolResult> {
  const ticketId = args['ticketId'];
  const status = args['status'];

  // Validate ticketId
  if (!ticketId || typeof ticketId !== 'string' || ticketId.trim() === '') {
    return {
      content: [{ type: 'text', text: 'Missing required argument: ticketId' }],
      isError: true,
    };
  }

  // Validate status
  const validStatuses = Object.values(AECStatus) as string[];
  if (!status || typeof status !== 'string' || !validStatuses.includes(status)) {
    return {
      content: [
        {
          type: 'text',
          text: `Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`,
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await ApiService.patch<TicketDetail>(
      `/tickets/${ticketId.trim()}`,
      { status },
      config
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            ticketId: ticketId.trim(),
            newStatus: result.status,
          }),
        },
      ],
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
