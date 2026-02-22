import { Command } from 'commander';
import chalk from 'chalk';
import * as ConfigService from '../services/config.service';
import { isLoggedIn } from '../services/auth.service';
import * as ApiService from '../services/api.service';
import { statusIcon } from '../ui/formatters';
import { AECStatus, type TicketDetail } from '../types/ticket';

const EXECUTE_VALID_STATUSES = new Set<AECStatus>([
  AECStatus.READY,
  AECStatus.VALIDATED,
]);

const DIVIDER = chalk.dim('─'.repeat(72));

export const executeCommand = new Command('execute')
  .description('Start an AI-assisted execution session for a ticket')
  .argument('<ticketId>', 'The ticket ID to execute')
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
        await ApiService.patch(`/tickets/${ticketId}`, { assignedTo: config!.userId }, config!);
      } catch {
        process.stderr.write(chalk.dim('  Warning: Could not auto-assign ticket.\n'));
      }

      // All output to stderr — stdout reserved for future scripting use
      process.stderr.write('\n');
      process.stderr.write(DIVIDER + '\n');
      process.stderr.write(` Ticket: [${ticket.id}] ${ticket.title}\n`);
      process.stderr.write(` Status: ${icon} ${ticket.status.replace(/-/g, ' ')}\n`);
      process.stderr.write('\n');
      process.stderr.write(` Ready to execute. In Claude Code, invoke:\n`);
      process.stderr.write('\n');
      process.stderr.write(`   forge_execute prompt  →  ticketId: ${ticket.id}\n`);
      process.stderr.write('\n');
      process.stderr.write(` (Forge MCP server is running in the background via .mcp.json)\n`);
      process.stderr.write(` If not set up yet, run: forge mcp install\n`);
      process.stderr.write(DIVIDER + '\n');
      process.stderr.write('\n');
      process.exit(0);
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(2);
    }
  });
