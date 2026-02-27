import * as ApiService from '../../services/api.service.js';
import type { ForgeConfig } from '../../services/config.service.js';
import type { ReviewQAItem } from '../../types/ticket.js';
import type { ToolResult } from '../types.js';

// MCP tool definition — returned by ListTools so Claude Code can discover it
export const startImplementationToolDefinition = {
  name: 'start_implementation',
  description:
    'Record the implementation branch and optional Q&A from the developer agent, transitioning the ticket from FORGED to EXECUTING. Call this after the developer has answered implementation questions and the branch name has been generated.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      ticketId: {
        type: 'string',
        description: 'The ticket ID (e.g., "aec_abc123")',
      },
      branchName: {
        type: 'string',
        description: 'The branch name (must start with "forge/")',
      },
      qaItems: {
        type: 'array',
        description: 'Optional Q&A pairs collected during the implementation preparation session',
        items: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'The implementation question that was asked',
            },
            answer: {
              type: 'string',
              description: "The developer's answer",
            },
          },
          required: ['question', 'answer'],
        },
      },
    },
    required: ['ticketId', 'branchName'],
  },
};

interface StartImplementationResponse {
  success: boolean;
  ticketId: string;
  branchName: string;
  status: string;
}

/**
 * Handles the start_implementation MCP tool call.
 * Posts branch + Q&A to POST /tickets/:id/start-implementation.
 * The backend transitions the ticket FORGED → EXECUTING.
 * Never throws — all errors are returned as isError content.
 */
export async function handleStartImplementation(
  args: Record<string, unknown>,
  config: ForgeConfig
): Promise<ToolResult> {
  const ticketId = args['ticketId'];
  const branchName = args['branchName'];
  const qaItems = args['qaItems'];

  // Validate ticketId
  if (!ticketId || typeof ticketId !== 'string' || ticketId.trim() === '') {
    return {
      content: [{ type: 'text', text: 'Missing required argument: ticketId' }],
      isError: true,
    };
  }

  // Validate branchName
  if (!branchName || typeof branchName !== 'string' || branchName.trim() === '') {
    return {
      content: [{ type: 'text', text: 'Missing required argument: branchName' }],
      isError: true,
    };
  }

  if (!branchName.startsWith('forge/')) {
    return {
      content: [{ type: 'text', text: 'Branch name must start with "forge/"' }],
      isError: true,
    };
  }

  // Validate qaItems if provided
  let validatedItems: ReviewQAItem[] | undefined;
  if (qaItems && Array.isArray(qaItems)) {
    for (const item of qaItems) {
      if (
        typeof item !== 'object' ||
        item === null ||
        typeof (item as any).question !== 'string' ||
        typeof (item as any).answer !== 'string'
      ) {
        return {
          content: [{ type: 'text', text: 'Each qaItem must have string fields: question and answer' }],
          isError: true,
        };
      }
    }
    validatedItems = (qaItems as any[]).map((item) => ({
      question: item.question,
      answer: item.answer,
    }));
  }

  try {
    const result = await ApiService.post<StartImplementationResponse>(
      `/tickets/${ticketId.trim()}/start-implementation`,
      { branchName: branchName.trim(), qaItems: validatedItems },
      config
    );

    return {
      content: [
        {
          type: 'text',
          text: `Implementation started for ${result.ticketId} on branch "${result.branchName}". Status is now "${result.status}".`,
        },
      ],
    };
  } catch (err) {
    const message = (err as Error).message ?? String(err);

    if (message.includes('404')) {
      return {
        content: [{ type: 'text', text: `Ticket not found: ${ticketId}` }],
        isError: true,
      };
    }

    return {
      content: [{ type: 'text', text: message }],
      isError: true,
    };
  }
}
