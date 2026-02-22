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

export function statusIcon(status: AECStatus): string {
  return STATUS_ICONS[status] ?? '❓';
}

export function formatTicketRow(
  ticket: TicketListItem,
  selected: boolean
): string {
  const pointer = selected ? chalk.cyan('▶') : ' ';
  const id = chalk.dim(`[${ticket.id}]`.padEnd(12));
  const title = ticket.title.substring(0, 40).padEnd(40);
  const displayTitle = selected ? chalk.bold.cyan(title) : title;
  const icon = statusIcon(ticket.status);
  const statusText = chalk.dim(
    ticket.status.replace(/-/g, ' ').padEnd(24)
  );
  const assignee = ticket.assignedTo ? chalk.dim(ticket.assignedTo) : '';

  return `${pointer} ${id} ${displayTitle} ${icon}  ${statusText} ${assignee}`;
}
