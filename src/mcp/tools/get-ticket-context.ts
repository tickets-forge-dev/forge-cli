import * as ApiService from '../../services/api.service.js';
import type { ForgeConfig } from '../../services/config.service.js';
import type { TicketDetail, FileChange } from '../../types/ticket.js';
import type { ToolResult } from '../types.js';

function formatTicket(t: TicketDetail): string {
  const lines: string[] = [
    `Ticket: ${t.id}`,
    `Title: ${t.title}`,
    `Status: ${t.status}`,
  ];
  if (t.priority) lines.push(`Priority: ${t.priority}`);
  if (t.assignedTo) lines.push(`Assigned to: ${t.assignedTo}`);
  lines.push('');
  if (t.description) lines.push(`Description:\n${t.description}\n`);
  if (t.problemStatement) lines.push(`Problem Statement:\n${t.problemStatement}\n`);
  if (t.solution) lines.push(`Solution:\n${t.solution}\n`);
  if (t.acceptanceCriteria?.length) {
    lines.push('Acceptance Criteria:');
    t.acceptanceCriteria.forEach((ac, i) => lines.push(`  ${i + 1}. ${ac}`));
    lines.push('');
  }
  if (t.fileChanges?.length) {
    lines.push('File Changes:');
    t.fileChanges.forEach((fc: FileChange) => {
      const note = fc.notes ? ` — ${fc.notes}` : '';
      lines.push(`  [${fc.action}] ${fc.path}${note}`);
    });
    lines.push('');
  }
  if (t.apiChanges) lines.push(`API Changes:\n${t.apiChanges}\n`);
  if (t.testPlan) lines.push(`Test Plan:\n${t.testPlan}\n`);
  if (t.reviewSession?.qaItems?.length) {
    lines.push('Review Q&A:');
    t.reviewSession.qaItems.forEach((qa, i) => {
      lines.push(`  Q${i + 1}: ${qa.question}`);
      lines.push(`  A${i + 1}: ${qa.answer}`);
    });
    lines.push('');
  }
  return lines.join('\n');
}

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
      content: [{ type: 'text', text: formatTicket(ticket) }],
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
