import { Command } from 'commander';
import chalk from 'chalk';
import * as ConfigService from '../services/config.service';
import type { ForgeConfig } from '../services/config.service';
import { isLoggedIn } from '../services/auth.service';
import * as ApiService from '../services/api.service';
import { formatTicketRow, statusIcon, STATUS_DISPLAY_NAMES } from '../ui/formatters';
import { AECStatus, type TicketListItem, type TicketDetail } from '../types/ticket';
import { spawnClaude } from '../services/claude.service';
import { copyToClipboard } from '../services/clipboard.service';
import { formatTicketPlainText } from '../ui/ticket-formatter';

const EXECUTE_VALID = new Set<AECStatus>([AECStatus.READY, AECStatus.VALIDATED]);
const REVIEW_VALID = new Set<AECStatus>([
  AECStatus.READY,
  AECStatus.VALIDATED,
  AECStatus.CREATED,
  AECStatus.DRIFTED,
]);

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

      const [tickets, memberNames] = await Promise.all([
        ApiService.get<TicketListItem[]>('/tickets', config!, params),
        fetchMemberNames(config!),
      ]);

      // Non-TTY: plain output for piping/scripting
      if (!process.stdout.isTTY) {
        if (tickets.length === 0) {
          const hint = options.all ? '' : ' Try `forge list --all` to see all team tickets.';
          console.log(`No tickets assigned to you.${hint}`);
        } else {
          tickets.forEach((t) => {
            const assignee = t.assignedTo
              ? memberNames.get(t.assignedTo) ?? t.assignedTo
              : '';
            console.log(`${t.id}\t${t.status}\t${t.title}\t${assignee}`);
          });
        }
        process.exit(0);
      }

      await renderInteractiveList(tickets, options.all ?? false, memberNames, config!);
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(2);
    }
  });

interface TeamMemberResponse {
  userId: string;
  displayName: string;
}

async function fetchMemberNames(config: ForgeConfig): Promise<Map<string, string>> {
  try {
    const res = await ApiService.get<{ members: TeamMemberResponse[] }>(
      `/teams/${config.teamId}/members`,
      config
    );
    const map = new Map<string, string>();
    for (const m of res.members) {
      if (m.displayName) map.set(m.userId, m.displayName);
    }
    return map;
  } catch {
    return new Map();
  }
}

const DIVIDER = chalk.dim('─'.repeat(72));

const PRIORITY_COLOR: Record<string, (s: string) => string> = {
  urgent: chalk.red,
  high: chalk.yellow,
  medium: chalk.white,
  low: chalk.dim,
};

type Screen = 'list' | 'detail';

async function renderInteractiveList(
  tickets: TicketListItem[],
  showAll: boolean,
  memberNames: Map<string, string>,
  config: ForgeConfig
): Promise<void> {
  if (tickets.length === 0) {
    const hint = showAll ? '' : ' Try `forge list --all` to see all team tickets.';
    console.log(chalk.dim(`No tickets found.${hint}`));
    process.exit(0);
  }

  let selected = 0;
  let screen: Screen = 'list';
  let detailTicket: TicketDetail | null = null;
  let loading = false;

  function renderList(): void {
    process.stdout.write('\u001b[2J\u001b[H');
    const label = showAll ? 'All Team Tickets' : 'My Tickets';
    console.log(chalk.bold(`forge — ${label} (${tickets.length})`));
    console.log(DIVIDER);
    tickets.forEach((ticket, i) => {
      console.log(formatTicketRow(ticket, i === selected, memberNames));
    });
    console.log(DIVIDER);
    console.log(chalk.dim('↑↓ navigate  Enter details  e execute  r review  q quit'));
  }

  function renderDetail(): void {
    if (!detailTicket) return;
    process.stdout.write('\u001b[2J\u001b[H');

    const icon = statusIcon(detailTicket.status);
    const statusName = STATUS_DISPLAY_NAMES[detailTicket.status] ?? detailTicket.status;

    console.log(chalk.bold(`[${detailTicket.id}] ${detailTicket.title}`));
    console.log(DIVIDER);
    console.log(`${chalk.dim('Status:   ')} ${icon} ${chalk.bold(statusName)}`);

    if (detailTicket.priority) {
      const colorFn = PRIORITY_COLOR[detailTicket.priority] ?? chalk.white;
      console.log(`${chalk.dim('Priority: ')} ${colorFn(detailTicket.priority.toUpperCase())}`);
    }

    if (detailTicket.assignedTo) {
      const name = memberNames.get(detailTicket.assignedTo) ?? detailTicket.assignedTo;
      console.log(`${chalk.dim('Assignee: ')} ${name}`);
    }

    if (detailTicket.description) {
      console.log();
      console.log(chalk.bold.underline('Description'));
      console.log(detailTicket.description);
    }

    if (detailTicket.acceptanceCriteria.length > 0) {
      console.log();
      console.log(chalk.bold.underline('Acceptance Criteria'));
      detailTicket.acceptanceCriteria.forEach((ac, i) => {
        console.log(`  ${chalk.dim(`${i + 1}.`)} ${ac}`);
      });
    }

    console.log();
    console.log(DIVIDER);

    // Build help bar based on valid actions for this ticket's status
    const actions: string[] = [];
    if (EXECUTE_VALID.has(detailTicket.status)) actions.push('e execute');
    if (REVIEW_VALID.has(detailTicket.status)) actions.push('r review');
    actions.push('c copy', 'Esc back', 'q quit');
    console.log(chalk.dim(actions.join('  ')));
  }

  function render(): void {
    if (screen === 'list') renderList();
    else renderDetail();
  }

  function cleanup(): void {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write('\u001b[2J\u001b[H');
  }

  async function launchAction(
    action: 'execute' | 'review',
    ticket: TicketListItem | TicketDetail
  ): Promise<void> {
    const validSet = action === 'execute' ? EXECUTE_VALID : REVIEW_VALID;
    if (!validSet.has(ticket.status)) {
      const validNames = [...validSet].map((s) => STATUS_DISPLAY_NAMES[s] ?? s).join(', ');
      process.stdout.write(
        chalk.yellow(`\n  Cannot ${action}: status "${STATUS_DISPLAY_NAMES[ticket.status] ?? ticket.status}" is not valid. Valid: ${validNames}\n`)
      );
      await new Promise((r) => setTimeout(r, 1500));
      render();
      return;
    }

    cleanup();
    process.stdin.removeListener('data', onData);

    try {
      await ApiService.patch(`/tickets/${ticket.id}`, { assignedTo: config.userId }, config);
    } catch {
      process.stderr.write(chalk.dim('  Warning: Could not auto-assign ticket.\n'));
    }

    const icon = statusIcon(ticket.status);
    process.stderr.write(
      `\n${icon} ${action === 'execute' ? 'Executing' : 'Reviewing'} [${ticket.id}] ${ticket.title} — launching Claude...\n\n`
    );

    try {
      const exitCode = await spawnClaude(action, ticket.id);
      process.exit(exitCode);
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  }

  async function onData(key: string): Promise<void> {
    if (loading) return;

    if (screen === 'list') {
      if (key === '\u001b[A') {
        selected = Math.max(0, selected - 1);
        render();
      } else if (key === '\u001b[B') {
        selected = Math.min(tickets.length - 1, selected + 1);
        render();
      } else if (key === '\r' || key === '\n') {
        // Enter — fetch detail and switch to detail screen
        loading = true;
        const ticket = tickets[selected];
        process.stdout.write('\u001b[2J\u001b[H');
        console.log(chalk.dim(`Loading ${ticket.id}...`));
        try {
          detailTicket = await ApiService.get<TicketDetail>(
            `/tickets/${ticket.id}`,
            config
          );
          screen = 'detail';
        } catch (err) {
          process.stdout.write('\u001b[2J\u001b[H');
          console.log(chalk.red(`Error loading ticket: ${(err as Error).message}`));
          await new Promise((r) => setTimeout(r, 1500));
        }
        loading = false;
        render();
      } else if (key === 'e' || key === 'E') {
        loading = true;
        await launchAction('execute', tickets[selected]);
        loading = false;
      } else if (key === 'r' || key === 'R') {
        loading = true;
        await launchAction('review', tickets[selected]);
        loading = false;
      } else if (key === 'q' || key === 'Q' || key === '\u0003') {
        cleanup();
        process.exit(0);
      }
    } else if (screen === 'detail') {
      if (key === '\u001b' && key.length === 1) {
        // Bare Escape — back to list
        screen = 'list';
        detailTicket = null;
        render();
      } else if (key === '\u007f' || key === '\b') {
        // Backspace — back to list
        screen = 'list';
        detailTicket = null;
        render();
      } else if (key === 'e' || key === 'E') {
        if (detailTicket) {
          loading = true;
          await launchAction('execute', detailTicket);
          loading = false;
        }
      } else if (key === 'r' || key === 'R') {
        if (detailTicket) {
          loading = true;
          await launchAction('review', detailTicket);
          loading = false;
        }
      } else if (key === 'c' || key === 'C') {
        if (detailTicket) {
          const plain = formatTicketPlainText(detailTicket, memberNames);
          try {
            copyToClipboard(plain);
            process.stdout.write(chalk.green('\n  Copied to clipboard!\n'));
          } catch {
            process.stdout.write(
              chalk.yellow('\n  Could not copy — install xclip or xsel on Linux.\n')
            );
          }
          await new Promise((r) => setTimeout(r, 800));
          render();
        }
      } else if (key === 'q' || key === 'Q' || key === '\u0003') {
        cleanup();
        process.exit(0);
      }
    }
  }

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf-8');
  render();

  return new Promise<void>(() => {
    process.stdin.on('data', onData);

    process.once('SIGINT', () => {
      cleanup();
      process.exit(0);
    });
  });
}
