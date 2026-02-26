import { Command } from 'commander';
import chalk from 'chalk';
import { requireAuth } from '../middleware/auth-guard';
import * as ApiService from '../services/api.service';
import { ApiError } from '../services/api.service';
import { statusIcon } from '../ui/formatters';
import { AECStatus, type TicketDetail } from '../types/ticket';
import { spawnClaude } from '../services/claude.service';

const EXECUTE_VALID_STATUSES = new Set<AECStatus>([
  AECStatus.READY,
  AECStatus.VALIDATED,
]);

export const executeCommand = new Command('execute')
  .description('Start an AI-assisted execution session for a ticket')
  .argument('<ticketId>', 'The ticket ID to execute')
  .action(async (ticketId: string) => {
    try {
      const config = await requireAuth();

      let ticket: TicketDetail;
      try {
        ticket = await ApiService.get<TicketDetail>(
          `/tickets/${ticketId}`,
          config
        );
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 404) {
          console.error(chalk.red(`Ticket not found: ${ticketId}`));
          process.exit(1);
        }
        throw err;
      }

      if (!EXECUTE_VALID_STATUSES.has(ticket.status)) {
        console.error(
          chalk.yellow(
            `Ticket ${ticketId} has status ${ticket.status} which is not ready for execution.`
          )
        );
        console.error(
          chalk.dim(`Valid statuses for execute: READY, VALIDATED`)
        );
        console.error(
          chalk.dim(
            `Run \`forge review ${ticketId}\` first to prepare the ticket.`
          )
        );
        process.exit(1);
      }

      const icon = statusIcon(ticket.status);

      try {
        await ApiService.patch(`/tickets/${ticketId}`, { assignedTo: config.userId }, config);
      } catch {
        process.stderr.write(chalk.dim('  Warning: Could not auto-assign ticket.\n'));
      }

      process.stderr.write(
        `\n${icon} Executing [${ticket.id}] ${ticket.title} — launching Claude...\n\n`
      );
      const exitCode = await spawnClaude('execute', ticket.id);
      process.exit(exitCode);
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(2);
    }
  });
