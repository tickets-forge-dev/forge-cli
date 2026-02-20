import { Command } from 'commander';
import chalk from 'chalk';
import * as ConfigService from '../services/config.service';
import { isLoggedIn } from '../services/auth.service';
import * as ApiService from '../services/api.service';
import { printTicketDetail } from '../ui/pager';
import type { TicketDetail } from '../types/ticket';

export const showCommand = new Command('show')
  .description('Show full details of a ticket')
  .argument('<ticketId>', 'The ticket ID to display')
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

      printTicketDetail(ticket);
      process.exit(0);
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(2);
    }
  });
