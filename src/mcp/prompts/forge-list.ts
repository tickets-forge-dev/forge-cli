import * as ApiService from '../../services/api.service.js';
import type { ForgeConfig } from '../../services/config.service.js';
import type { PromptResult } from '../types.js';
import type { TicketListItem } from '../../types/ticket.js';
import { AECStatus } from '../../types/ticket.js';

export const forgeListPromptDefinition = {
  name: 'list',
  description:
    'List your Forge tickets with status, priority, and assignee names. Use this to browse tickets before executing or reviewing one.',
  arguments: [
    {
      name: 'filter',
      description: 'Show "all" team tickets (default) or "mine" for only assigned to me',
      required: false,
    },
  ],
};

const STATUS_ICONS: Record<AECStatus, string> = {
  [AECStatus.DRAFT]: '⬜',
  [AECStatus.VALIDATED]: '✅',
  [AECStatus.READY]: '🚀',
  [AECStatus.WAITING_FOR_APPROVAL]: '⏳',
  [AECStatus.CREATED]: '📝',
  [AECStatus.DRIFTED]: '⚠️',
  [AECStatus.COMPLETE]: '✅',
};

/** Human-readable display names for all backend statuses (not the lifecycle steps). */
const STATUS_DISPLAY_NAMES: Record<AECStatus, string> = {
  [AECStatus.DRAFT]: 'Define',
  [AECStatus.VALIDATED]: 'Dev-Refine',
  [AECStatus.READY]: 'Execute',
  [AECStatus.WAITING_FOR_APPROVAL]: 'Approve',
  [AECStatus.CREATED]: 'Exported',
  [AECStatus.DRIFTED]: 'Drifted',
  [AECStatus.COMPLETE]: 'Done',
};

interface TeamMemberResponse {
  userId: string;
  displayName: string;
}

async function fetchMemberNames(
  config: ForgeConfig
): Promise<Map<string, string>> {
  try {
    const res = await ApiService.get<{ members: TeamMemberResponse[] }>(
      `/teams/${config.teamId}/members`,
      config
    );
    const map = new Map<string, string>();
    for (const m of res.members) {
      if (m.displayName) map.set(m.userId, m.displayName);
    }
    return map;
  } catch {
    return new Map();
  }
}

export async function handleForgeList(
  args: Record<string, unknown>,
  config: ForgeConfig
): Promise<PromptResult> {
  const filter = typeof args.filter === 'string' ? args.filter.trim() : 'all';

  const params: Record<string, string> = {
    teamId: config.teamId,
  };

  if (filter === 'all') {
    params.all = 'true';
  } else {
    params.assignedToMe = 'true';
  }

  let tickets: TicketListItem[];
  let memberNames: Map<string, string>;

  try {
    [tickets, memberNames] = await Promise.all([
      ApiService.get<TicketListItem[]>('/tickets', config, params),
      fetchMemberNames(config),
    ]);
  } catch (err) {
    const message = (err as Error).message ?? 'Unknown error';
    return {
      messages: [{ role: 'user', content: { type: 'text', text: `Error: Failed to fetch tickets: ${message}` } }],
    };
  }

  if (tickets.length === 0) {
    const hint =
      filter !== 'all'
        ? '\n\nTry `/forge:forge_list` with filter `all` to see all team tickets.'
        : '';
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `No tickets found.${hint}`,
          },
        },
      ],
    };
  }

  const label = filter === 'all' ? 'All Team Tickets' : 'My Tickets';

  const header = '| ID | Title | Status | Assignee | Priority |';
  const divider = '|-----|-------|--------|----------|----------|';
  const rows = tickets.map((t) => {
    const icon = STATUS_ICONS[t.status] ?? '❓';
    const assignee = t.assignedTo
      ? memberNames.get(t.assignedTo) ?? t.assignedTo
      : '—';
    const priority = t.priority ?? '—';
    const title = t.title.length > 50 ? t.title.substring(0, 47) + '...' : t.title;
    const label = STATUS_DISPLAY_NAMES[t.status] ?? t.status;
    return `| \`${t.id}\` | ${title} | ${icon} ${label} | ${assignee} | ${priority} |`;
  });

  const table = [header, divider, ...rows].join('\n');
  const text = `## ${label} (${tickets.length})\n\n${table}\n\n> To execute a ticket: \`/forge:exec\` with the ticket ID\n> To review a ticket: \`/forge:review\` with the ticket ID`;

  return {
    messages: [
      {
        role: 'user',
        content: { type: 'text', text },
      },
    ],
  };
}
