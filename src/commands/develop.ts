import { Command } from 'commander';
import chalk from 'chalk';
import { requireAuth } from '../middleware/auth-guard';
import * as ApiService from '../services/api.service';
import { ApiError } from '../services/api.service';
import { statusIcon } from '../ui/formatters';
import { AECStatus, type TicketDetail } from '../types/ticket';
import { spawnClaude } from '../services/claude.service';

const DEVELOP_VALID_STATUSES = new Set<AECStatus>([
  AECStatus.FORGED,
  AECStatus.READY, // Legacy name for FORGED
]);

export const developCommand = new Command('develop')
  .description('Start an AI-assisted implementation preparation session for a ticket')
  .argument('<ticketId>', 'The ticket ID to develop')
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

      if (!DEVELOP_VALID_STATUSES.has(ticket.status)) {
        console.error(
          chalk.yellow(
            `Ticket ${ticketId} has status "${ticket.status}" — must be in FORGED status to start implementation.`
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
        `\n${icon} Developing [${ticket.id}] ${ticket.title} — launching Claude...\n\n`
      );
      const exitCode = await spawnClaude('develop', ticket.id);
      process.exit(exitCode);
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(2);
    }
  });
