import type { ForgeConfig } from '../../services/config.service.js';
import type { PromptResult } from '../types.js';
import { handleForgeExecute } from './forge-execute.js';

export const forgeExecPromptDefinition = {
  name: 'forge-exec',
  description:
    'Execute a Forge ticket — loads the dev-executor persona and full ticket context to begin implementation.',
  arguments: [
    {
      name: 'ticketId',
      description: 'The ticket ID to implement (e.g., "aec_57f97f8c-...")',
      required: true,
    },
  ],
};

export async function handleForgeExec(
  args: Record<string, unknown>,
  config: ForgeConfig
): Promise<PromptResult> {
  return handleForgeExecute(args, config);
}
