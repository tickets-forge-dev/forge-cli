import { spawn } from 'child_process';

export function spawnClaude(action: 'execute' | 'review', ticketId: string): Promise<number> {
  const promptName = action === 'execute' ? 'forge-exec' : 'forge-review';
  const prompt = `Use the ${promptName} MCP prompt with ticketId "${ticketId}" to ${action} this ticket.`;

  // Windows: claude is installed as a .cmd shim which requires a shell to
  // execute.  Passing args *and* `shell: true` triggers DEP0190, so we
  // invoke cmd.exe explicitly with /c to run the .cmd, keeping args safe.
  // Unix/macOS: spawn the binary directly — no shell needed.
  const child = process.platform === 'win32'
    ? spawn('cmd', ['/c', 'claude', prompt], { stdio: 'inherit' })
    : spawn('claude', [prompt], { stdio: 'inherit' });

  return new Promise((resolve, reject) => {
    child.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT')
        reject(new Error('Claude CLI not found. Install: https://docs.anthropic.com/en/docs/claude-code'));
      else reject(err);
    });
    child.on('close', (code) => resolve(code ?? 0));
  });
}
