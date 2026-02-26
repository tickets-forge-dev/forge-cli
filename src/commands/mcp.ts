import { Command } from 'commander';
import chalk from 'chalk';
import { requireAuth } from '../middleware/auth-guard';
import { ForgeMCPServer } from '../mcp/server.js';
import { tryRegisterMcpServer, writeMcpJson } from '../mcp/install.js';

const DIVIDER = '─'.repeat(72);

export const mcpCommand = new Command('mcp')
  .description('Forge MCP server — run as daemon or install for Claude Code')
  .action(async () => {
    // forge mcp — persistent daemon. Claude Code spawns this process from
    // .mcp.json / ~/.claude.json config and keeps it running as an MCP server.
    // All output MUST go to stderr — stdout is reserved for MCP protocol frames.
    try {
      const config = await requireAuth();

      const server = new ForgeMCPServer(config);
      await server.start();

      process.once('SIGINT', () => {
        server.stop().then(() => process.exit(0));
      });

      // Block indefinitely — Claude Code kills this process when done
      await new Promise<void>(() => {
        // intentionally never resolves
      });
    } catch (err) {
      process.stderr.write(
        chalk.red(`[forge:mcp] Fatal error: ${(err as Error).message}\n`)
      );
      process.exit(1);
    }
  });

mcpCommand
  .command('install')
  .description('Write .mcp.json and register forge as a project-scoped MCP server')
  .action(async () => {
    console.log();
    console.log(chalk.dim(DIVIDER));
    console.log(' Forge MCP Server — Project Setup');
    console.log(chalk.dim(DIVIDER));
    console.log();

    // Write / merge .mcp.json in project root
    try {
      await writeMcpJson();
      console.log(
        ` ${chalk.green('✅')}  Written ${chalk.bold('.mcp.json')} ` +
        chalk.dim('(project scope — commit this file for your team)')
      );
    } catch (err) {
      console.error(
        chalk.red(` ✗  Failed to write .mcp.json: ${(err as Error).message}`)
      );
      process.exit(1);
    }

    // Attempt claude mcp add (project scope)
    const result = await tryRegisterMcpServer('project');
    if (result === 'registered') {
      console.log(
        ` ${chalk.green('✅')}  Registered via: ` +
        chalk.dim('claude mcp add --scope project ...')
      );
    } else {
      console.log(
        ` ${chalk.dim('ℹ')}   claude CLI not found — .mcp.json is ready but not auto-registered`
      );
    }

    console.log();
    console.log(' Restart Claude Code to apply. Per-ticket usage:');
    console.log(chalk.dim('   forge execute T-001   → invoke forge-exec prompt in Claude Code'));
    console.log(chalk.dim('   forge review T-001    → invoke review prompt in Claude Code'));
    console.log();
    console.log(chalk.dim(DIVIDER));
    console.log();
  });
