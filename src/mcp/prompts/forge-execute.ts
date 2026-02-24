import devExecutorMd from '../../agents/dev-executor.md';
import * as ApiService from '../../services/api.service.js';
import type { ForgeConfig } from '../../services/config.service.js';
import type { PromptResult } from '../types.js';
import type { TicketDetail } from '../../types/ticket.js';

export const forgeExecutePromptDefinition = {
  name: 'forge-execute',
  description:
    'Load the Forge dev-executor persona and full ticket context (XML) to begin implementing a ticket with Claude Code.',
  arguments: [
    {
      name: 'ticketId',
      description: 'The ticket ID to implement (e.g., T-001)',
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

function serializeTicketXml(ticket: TicketDetail): string {
  const acItems = (ticket.acceptanceCriteria ?? [])
    .map((ac) => `    <item>${escapeXml(ac)}</item>`)
    .join('\n');

  const fcItems = (ticket.fileChanges ?? [])
    .map(
      (fc) =>
        `    <change path="${escapeXml(fc.path)}" action="${escapeXml(fc.action)}">${
          fc.notes ? escapeXml(fc.notes) : ''
        }</change>`
    )
    .join('\n');

  return `<ticket id="${escapeXml(ticket.id)}" status="${ticket.status}">
  <title>${escapeXml(ticket.title)}</title>
  <description>${escapeXml(ticket.description ?? '')}</description>
  <problemStatement>${escapeXml(ticket.problemStatement ?? '')}</problemStatement>
  <solution>${escapeXml(ticket.solution ?? '')}</solution>
  <acceptanceCriteria>
${acItems}
  </acceptanceCriteria>
  <fileChanges>
${fcItems}
  </fileChanges>
</ticket>`;
}

export async function handleForgeExecute(
  args: Record<string, unknown>,
  config: ForgeConfig
): Promise<PromptResult> {
  const rawId = args.ticketId;
  if (typeof rawId !== 'string' || rawId.trim() === '') {
    return {
      messages: [{ role: 'user', content: { type: 'text', text: 'Error: Missing required argument: ticketId' } }],
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
        messages: [{ role: 'user', content: { type: 'text', text: `Error: Ticket not found: ${ticketId}` } }],
      };
    }
    return {
      messages: [{ role: 'user', content: { type: 'text', text: `Error: ${message}` } }],
    };
  }

  const ticketXml = serializeTicketXml(ticket);

  return {
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `<agent_guide>\n${devExecutorMd}\n</agent_guide>\n<ticket_context>\n${ticketXml}\n</ticket_context>`,
        },
      },
    ],
  };
}
