import devImplementerMd from '../../agents/dev-implementer.md';
import * as ApiService from '../../services/api.service.js';
import type { ForgeConfig } from '../../services/config.service.js';
import type { PromptResult } from '../types.js';
import type { TicketDetail } from '../../types/ticket.js';

export const forgeDevelopPromptDefinition = {
  name: 'forge-develop',
  description:
    'Load the Forge dev-implementer persona and full ticket context (XML) to begin a guided implementation preparation session.',
  arguments: [
    {
      name: 'ticketId',
      description: 'The ticket ID to develop (e.g., aec_abc123)',
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

function serializeTicketDevelopXml(ticket: TicketDetail): string {
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
  <apiChanges>${escapeXml(ticket.apiChanges ?? '')}</apiChanges>
  <testPlan>${escapeXml(ticket.testPlan ?? '')}</testPlan>
</ticket>`;
}

export async function handleForgeDevelop(
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

  const ticketXml = serializeTicketDevelopXml(ticket);

  return {
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `<agent_guide>\n${devImplementerMd}\n</agent_guide>\n<ticket_context>\n${ticketXml}\n</ticket_context>`,
        },
      },
    ],
  };
}
