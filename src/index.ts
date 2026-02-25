import { Command } from 'commander';
import { loginCommand } from './commands/login';
import { logoutCommand } from './commands/logout';
import { listCommand } from './commands/list';
import { showCommand } from './commands/show';
import { reviewCommand } from './commands/review';
import { executeCommand } from './commands/execute';
import { mcpCommand } from './commands/mcp';

const program = new Command();

program
  .name('forge')
  .version('1.0.0')
  .description('CLI for Forge — authenticate, browse tickets, and execute AI-assisted implementations via MCP');

program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(listCommand);
program.addCommand(showCommand);
program.addCommand(reviewCommand);
program.addCommand(executeCommand);
program.addCommand(mcpCommand);

program.parse(process.argv);
