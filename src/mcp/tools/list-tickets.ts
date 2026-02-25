import * as ApiService from '../../services/api.service.js';
import type { ForgeConfig } from '../../services/config.service.js';
import type { TicketListItem } from '../../types/ticket.js';
import type { ToolResult } from '../types.js';

export const listTicketsToolDefinition = {
  name: 'list_tickets',
  description:
    'List all Forge tickets for the current team. Returns ticket IDs, titles, statuses, priorities, and assignees. Use this to find ticket IDs before calling get_ticket_context or review prompts.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      filter: {
        type: 'string',
        description: 'Show "all" team tickets (default) or "mine" for only tickets assigned to me',
        enum: ['all', 'mine'],
      },
    },
    required: [],
  },
};

export async function handleListTickets(
  args: Record<string, unknown>,
  config: ForgeConfig
): Promise<ToolResult> {
  const filter = typeof args.filter === 'string' ? args.filter.trim() : 'all';

  const params: Record<string, string> = {
    teamId: config.teamId,
  };

  if (filter === 'all') {
    params.all = 'true';
  } else {
    params.assignedToMe = 'true';
  }

  try {
    const tickets = await ApiService.get<TicketListItem[]>('/tickets', config, params);

    if (tickets.length === 0) {
      return {
        content: [{ type: 'text', text: `No tickets found (filter: ${filter}).` }],
      };
    }

    const lines = tickets.map((t) => {
      const status = t.status.replace(/-/g, ' ');
      const priority = t.priority ? ` [${t.priority}]` : '';
      const assignee = t.assignedTo ? ` (${t.assignedTo})` : '';
      return `${t.id}  ${status.padEnd(20)} ${t.title}${priority}${assignee}`;
    });

    const header = `${tickets.length} ticket${tickets.length === 1 ? '' : 's'} (filter: ${filter}):\n`;
    const hint = '\n\nTo review a ticket: /forge:review <ticketId>\nTo execute a ticket: /forge:exec <ticketId>';

    return {
      content: [{ type: 'text', text: header + lines.join('\n') + hint }],
    };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    return {
      content: [{ type: 'text', text: `Failed to list tickets: ${message}` }],
      isError: true,
    };
  }
}
