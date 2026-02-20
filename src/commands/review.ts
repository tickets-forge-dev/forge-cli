import { Command } from 'commander';
import chalk from 'chalk';
import * as ConfigService from '../services/config.service';
import { isLoggedIn } from '../services/auth.service';
import * as ApiService from '../services/api.service';
import { statusIcon } from '../ui/formatters';
import { AECStatus, type TicketDetail } from '../types/ticket';

const REVIEW_VALID_STATUSES = new Set<AECStatus>([
  AECStatus.READY,
  AECStatus.VALIDATED,
  AECStatus.CREATED,
  AECStatus.DRIFTED,
]);

const DIVIDER = chalk.dim('─'.repeat(72));

export const reviewCommand = new Command('review')
  .description('Start an AI-assisted review session for a ticket')
  .argument('<ticketId>', 'The ticket ID to review')
  .action(async (ticketId: string) => {
    try {
      const config = await ConfigService.load();
      if (!isLoggedIn(config)) {
        console.error(chalk.red('Not logged in. Run `forge login` first.'));
        process.exit(1);
      }

      let ticket: TicketDetail;
      try {
        ticket = await ApiService.get<TicketDetail>(
          `/tickets/${ticketId}`,
          config!
        );
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes('404')) {
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
      console.log();
      console.log(DIVIDER);
      console.log(
        ` Ticket: ${chalk.bold(`[${ticket.id}]`)} ${ticket.title}`
      );
      console.log(` Status: ${icon} ${ticket.status.replace(/_/g, ' ')}`);
      console.log();
      console.log(
        chalk.bold(` forge review — Coming in Epic 6 (MCP Integration)`)
      );
      console.log(chalk.dim(' ' + '─'.repeat(50)));
      console.log(` When available, this will start an AI-assisted review session that:`);
      console.log(`   ${chalk.cyan('•')} Loads your ticket context into your AI coding assistant`);
      console.log(`   ${chalk.cyan('•')} Asks dynamic questions to clarify implementation details`);
      console.log(`   ${chalk.cyan('•')} Enriches the ticket with technical decisions`);
      console.log();
      console.log(
        chalk.dim(` For now, view the full ticket with: forge show ${ticketId}`)
      );
      console.log(DIVIDER);
      console.log();
      process.exit(0);
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(2);
    }
  });
