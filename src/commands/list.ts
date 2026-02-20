import { Command } from 'commander';
import chalk from 'chalk';
import * as ConfigService from '../services/config.service';
import { isLoggedIn } from '../services/auth.service';
import * as ApiService from '../services/api.service';
import { formatTicketRow, statusIcon } from '../ui/formatters';
import type { TicketListItem } from '../types/ticket';

export const listCommand = new Command('list')
  .description('List tickets assigned to you')
  .option('--all', 'Show all team tickets, not just assigned to me')
  .action(async (options: { all?: boolean }) => {
    try {
      const config = await ConfigService.load();

      if (!isLoggedIn(config)) {
        console.error(chalk.red('Not logged in. Run `forge login` first.'));
        process.exit(1);
      }

      const params: Record<string, string> = {
        teamId: config!.teamId,
      };

      if (options.all) {
        params.all = 'true';
      } else {
        params.assignedToMe = 'true';
      }

      const tickets = await ApiService.get<TicketListItem[]>(
        '/tickets',
        config!,
        params
      );

      // Non-TTY: plain output for piping/scripting
      if (!process.stdout.isTTY) {
        if (tickets.length === 0) {
          const hint = options.all ? '' : ' Try `forge list --all` to see all team tickets.';
          console.log(`No tickets assigned to you.${hint}`);
        } else {
          tickets.forEach((t) => {
            const assignee = t.assignedTo ?? '';
            console.log(`${t.id}\t${t.status}\t${t.title}\t${assignee}`);
          });
        }
        process.exit(0);
      }

      await renderInteractiveList(tickets, options.all ?? false);
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(2);
    }
  });

const DIVIDER = chalk.dim('─'.repeat(72));

async function renderInteractiveList(
  tickets: TicketListItem[],
  showAll: boolean
): Promise<void> {
  if (tickets.length === 0) {
    const hint = showAll ? '' : ' Try `forge list --all` to see all team tickets.';
    console.log(chalk.dim(`No tickets found.${hint}`));
    process.exit(0);
  }

  let selected = 0;

  function render(): void {
    process.stdout.write('\u001b[2J\u001b[H'); // clear screen, cursor to top
    const label = showAll ? 'All Team Tickets' : 'My Tickets';
    console.log(chalk.bold(`forge — ${label} (${tickets.length})`));
    console.log(DIVIDER);
    tickets.forEach((ticket, i) => {
      console.log(formatTicketRow(ticket, i === selected));
    });
    console.log(DIVIDER);
    console.log(chalk.dim('↑↓ navigate  Enter view  q quit'));
  }

  function cleanup(): void {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write('\u001b[2J\u001b[H');
  }

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf-8');
  render();

  return new Promise<void>((resolve) => {
    function onData(key: string): void {
      if (key === '\u001b[A') {
        // Up arrow
        selected = Math.max(0, selected - 1);
        render();
      } else if (key === '\u001b[B') {
        // Down arrow
        selected = Math.min(tickets.length - 1, selected + 1);
        render();
      } else if (key === '\r' || key === '\n') {
        // Enter — show inline summary
        cleanup();
        const ticket = tickets[selected];
        console.log(chalk.bold(`\nTicket: [${ticket.id}]`));
        console.log(`Title:    ${ticket.title}`);
        console.log(`Status:   ${statusIcon(ticket.status)} ${ticket.status}`);
        if (ticket.assignedTo) console.log(`Assignee: ${ticket.assignedTo}`);
        console.log(
          chalk.dim(`\nRun \`forge show ${ticket.id}\` for full details.`)
        );
        resolve();
      } else if (key === 'q' || key === 'Q' || key === '\u0003') {
        // q, Q, or Ctrl+C
        cleanup();
        resolve();
      }
    }

    process.stdin.on('data', onData);

    process.once('SIGINT', () => {
      cleanup();
      resolve();
    });
  });
}
