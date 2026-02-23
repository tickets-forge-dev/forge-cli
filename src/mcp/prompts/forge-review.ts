import devReviewerMd from '../../agents/dev-reviewer.md';
import * as ApiService from '../../services/api.service.js';
import type { ForgeConfig } from '../../services/config.service.js';
import type { PromptResult } from '../types.js';
import type { TicketDetail } from '../../types/ticket.js';

export const forgeReviewPromptDefinition = {
  name: 'forge-review',
  description:
    'Load the Forge dev-reviewer persona and ticket summary to generate clarifying questions for the PM.',
  arguments: [
    {
      name: 'ticketId',
      description: 'The ticket ID to review (e.g., T-001)',
      required: true,
    },
  ],
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function serializeTicketSummaryXml(ticket: TicketDetail): string {
  const acItems = (ticket.acceptanceCriteria ?? [])
    .map((ac) => `    <item>${escapeXml(ac)}</item>`)
    .join('\n');

  return `<ticket id="${escapeXml(ticket.id)}" status="${ticket.status}">
  <title>${escapeXml(ticket.title)}</title>
  <description>${escapeXml(ticket.description ?? '')}</description>
  <problemStatement>${escapeXml(ticket.problemStatement ?? '')}</problemStatement>
  <solution>${escapeXml(ticket.solution ?? '')}</solution>
  <acceptanceCriteria>
${acItems}
  </acceptanceCriteria>
</ticket>`;
}

export async function handleForgeReview(
  args: Record<string, unknown>,
  config: ForgeConfig
): Promise<PromptResult> {
  const rawId = args.ticketId;
  if (typeof rawId !== 'string' || rawId.trim() === '') {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Missing required argument: ticketId' }],
    };
  }

  const ticketId = rawId.trim();

  let ticket: TicketDetail;
  try {
    ticket = await ApiService.get<TicketDetail>(`/tickets/${ticketId}`, config);
  } catch (err) {
    const message = (err as Error).message ?? 'Unknown error';
    if (message.includes('404')) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Ticket not found: ${ticketId}` }],
      };
    }
    return {
      isError: true,
      content: [{ type: 'text', text: message }],
    };
  }

  const ticketSummaryXml = serializeTicketSummaryXml(ticket);

  return {
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `<agent_guide>\n${devReviewerMd}\n</agent_guide>\n<ticket_context>\n${ticketSummaryXml}\n</ticket_context>`,
        },
      },
    ],
  };
}
