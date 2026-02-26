import { createRequire } from 'module';
import { Command } from 'commander';
import { loginCommand } from './commands/login';
import { logoutCommand } from './commands/logout';
import { listCommand } from './commands/list';
import { showCommand } from './commands/show';
import { reviewCommand } from './commands/review';
import { executeCommand } from './commands/execute';
import { mcpCommand } from './commands/mcp';
import { whoamiCommand } from './commands/whoami';
import { doctorCommand } from './commands/doctor';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const program = new Command();

program
  .name('forge')
  .version(version)
  .description('CLI for Forge — authenticate, browse tickets, and execute AI-assisted implementations via MCP');

program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(listCommand, { hidden: true });
program.addCommand(showCommand);
program.addCommand(reviewCommand);
program.addCommand(executeCommand);
program.addCommand(mcpCommand);
program.addCommand(whoamiCommand);
program.addCommand(doctorCommand);

program.addHelpText('after', `
Getting started:
  $ forge login          Authenticate with your Forge account
  $ forge execute T-001  Start an AI-assisted execution session
  $ forge mcp install    Set up MCP server for Claude Code

Troubleshooting:
  $ forge doctor         Run diagnostic checks on your setup
  $ forge whoami         Show current user and token status
`);

program.parse(process.argv);
