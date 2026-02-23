import chalk from 'chalk';
import { type TicketDetail } from '../types/ticket';
import { statusIcon, STATUS_DISPLAY_NAMES } from './formatters';

const DIVIDER = chalk.dim('─'.repeat(72));

const PRIORITY_COLOR: Record<string, (s: string) => string> = {
  urgent: chalk.red,
  high: chalk.yellow,
  medium: chalk.white,
  low: chalk.dim,
};

export function printTicketDetail(ticket: TicketDetail): void {
  console.log();

  // Header
  console.log(chalk.bold(`[${ticket.id}] ${ticket.title}`));
  console.log(DIVIDER);

  // Metadata
  const icon = statusIcon(ticket.status);
  const statusText = STATUS_DISPLAY_NAMES[ticket.status] ?? ticket.status;
  console.log(`${chalk.dim('Status:   ')} ${icon} ${chalk.bold(statusText)}`);

  if (ticket.priority) {
    const colorFn = PRIORITY_COLOR[ticket.priority] ?? chalk.white;
    console.log(
      `${chalk.dim('Priority: ')} ${colorFn(ticket.priority.toUpperCase())}`
    );
  }

  const assignee = ticket.assignedTo;
  if (assignee) {
    console.log(`${chalk.dim('Assignee: ')} ${assignee}`);
  }

  console.log(
    `${chalk.dim('Created:  ')} ${new Date(ticket.createdAt).toLocaleString()}`
  );
  console.log(
    `${chalk.dim('Updated:  ')} ${new Date(ticket.updatedAt).toLocaleString()}`
  );

  // Description
  if (ticket.description) {
    console.log();
    console.log(chalk.bold.underline('Description'));
    console.log(ticket.description);
  }

  // Acceptance Criteria
  if (ticket.acceptanceCriteria.length > 0) {
    console.log();
    console.log(chalk.bold.underline('Acceptance Criteria'));
    ticket.acceptanceCriteria.forEach((ac, i) => {
      console.log(`  ${chalk.dim(`${i + 1}.`)} ${ac}`);
    });
  }

  // Footer
  console.log();
  console.log(DIVIDER);
  console.log(chalk.dim(`forge review ${ticket.id}   # start AI-assisted review`));
  console.log(
    chalk.dim(`forge execute ${ticket.id}  # start AI-assisted execution`)
  );
  console.log();
}
