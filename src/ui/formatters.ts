import chalk from 'chalk';
import { AECStatus, type TicketListItem } from '../types/ticket';

const STATUS_ICONS: Record<AECStatus, string> = {
  [AECStatus.DRAFT]: '⬜',
  [AECStatus.VALIDATED]: '✅',
  [AECStatus.READY]: '🚀',
  [AECStatus.WAITING_FOR_APPROVAL]: '⏳',
  [AECStatus.CREATED]: '📝',
  [AECStatus.DRIFTED]: '⚠️ ',
  [AECStatus.COMPLETE]: '✅',
};

/** Human-readable display names for all backend statuses (not the lifecycle steps). */
export const STATUS_DISPLAY_NAMES: Record<AECStatus, string> = {
  [AECStatus.DRAFT]: 'Define',
  [AECStatus.VALIDATED]: 'Dev-Refine',
  [AECStatus.READY]: 'Execute',
  [AECStatus.WAITING_FOR_APPROVAL]: 'Approve',
  [AECStatus.CREATED]: 'Exported',
  [AECStatus.DRIFTED]: 'Drifted',
  [AECStatus.COMPLETE]: 'Done',
};

export function statusIcon(status: AECStatus): string {
  return STATUS_ICONS[status] ?? '❓';
}

export function formatTicketRow(
  ticket: TicketListItem,
  selected: boolean,
  memberNames?: Map<string, string>
): string {
  const pointer = selected ? chalk.cyan('▶') : ' ';
  const id = chalk.dim(`[${ticket.id}]`.padEnd(12));
  const title = ticket.title.substring(0, 40).padEnd(40);
  const displayTitle = selected ? chalk.bold.cyan(title) : title;
  const icon = statusIcon(ticket.status);
  const statusText = chalk.dim(
    (STATUS_DISPLAY_NAMES[ticket.status] ?? ticket.status).padEnd(24)
  );
  const rawAssignee = ticket.assignedTo;
  const assigneeName = rawAssignee
    ? memberNames?.get(rawAssignee) ?? rawAssignee
    : '';
  const assignee = assigneeName ? chalk.dim(assigneeName) : '';

  return `${pointer} ${id} ${displayTitle} ${icon}  ${statusText} ${assignee}`;
}
