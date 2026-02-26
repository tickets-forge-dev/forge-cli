import { Command } from 'commander';
import chalk from 'chalk';
import { requireAuth } from '../middleware/auth-guard';
import * as ApiService from '../services/api.service';
import { ApiError } from '../services/api.service';
import { statusIcon } from '../ui/formatters';
import { AECStatus, type TicketDetail } from '../types/ticket';
import { spawnClaude } from '../services/claude.service';

const REVIEW_VALID_STATUSES = new Set<AECStatus>([
  AECStatus.READY,
  AECStatus.VALIDATED,
  AECStatus.CREATED,
  AECStatus.DRIFTED,
]);

export const reviewCommand = new Command('review')
  .description('Start an AI-assisted review session for a ticket')
  .argument('<ticketId>', 'The ticket ID to review')
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

      if (!REVIEW_VALID_STATUSES.has(ticket.status)) {
        console.error(
          chalk.yellow(
            `Ticket ${ticketId} has status ${ticket.status} which is not ready for review.`
          )
        );
        console.error(
          chalk.dim(
            `Valid statuses for review: READY, VALIDATED, CREATED, DRIFTED`
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
        `\n${icon} Reviewing [${ticket.id}] ${ticket.title} — launching Claude...\n\n`
      );
      const exitCode = await spawnClaude('review', ticket.id);
      process.exit(exitCode);
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(2);
    }
  });
