import { execSync } from 'child_process';

export function copyToClipboard(text: string): void {
  const platform = process.platform;
  if (platform === 'darwin') {
    execSync('pbcopy', { input: text });
  } else if (platform === 'win32') {
    execSync(
      'powershell -NoProfile -Command "$input | Set-Clipboard"',
      { input: text }
    );
  } else {
    // Linux: try xclip, fall back to xsel
    try {
      execSync('xclip -selection clipboard', { input: text });
    } catch {
      execSync('xsel --clipboard --input', { input: text });
    }
  }
}
