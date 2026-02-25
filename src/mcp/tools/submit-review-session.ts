import * as ApiService from '../../services/api.service.js';
import type { ForgeConfig } from '../../services/config.service.js';
import type { ReviewQAItem } from '../../types/ticket.js';
import type { ToolResult } from '../types.js';

// MCP tool definition — returned by ListTools so Claude Code can discover it
export const submitReviewSessionToolDefinition = {
  name: 'submit_review_session',
  description:
    'Submit the Q&A pairs collected during a forge review session back to Forge. Call this after the developer has answered all clarifying questions. The ticket status will transition to WAITING_FOR_APPROVAL and the PM will see the answers in the web UI.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      ticketId: {
        type: 'string',
        description: 'The ticket ID being reviewed (e.g., "aec_abc123")',
      },
      qaItems: {
        type: 'array',
        description: 'The Q&A pairs collected during the review session',
        items: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'The clarifying question that was asked',
            },
            answer: {
              type: 'string',
              description: "The developer's answer to the question",
            },
          },
          required: ['question', 'answer'],
        },
        minItems: 1,
      },
    },
    required: ['ticketId', 'qaItems'],
  },
};

interface SubmitReviewSessionResponse {
  success: boolean;
  ticketId: string;
  status: string;
}

/**
 * Handles the submit_review_session MCP tool call.
 * Posts Q&A pairs to POST /tickets/:id/review-session.
 * The backend transitions the ticket to WAITING_FOR_APPROVAL.
 * Never throws — all errors are returned as isError content.
 */
export async function handleSubmitReviewSession(
  args: Record<string, unknown>,
  config: ForgeConfig
): Promise<ToolResult> {
  const ticketId = args['ticketId'];
  const qaItems = args['qaItems'];

  // Validate ticketId
  if (!ticketId || typeof ticketId !== 'string' || ticketId.trim() === '') {
    return {
      content: [{ type: 'text', text: 'Missing required argument: ticketId' }],
      isError: true,
    };
  }

  // Validate qaItems
  if (!qaItems || !Array.isArray(qaItems) || qaItems.length === 0) {
    return {
      content: [{ type: 'text', text: 'qaItems must be a non-empty array of {question, answer} objects' }],
      isError: true,
    };
  }

  // Validate each Q&A item
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

  const validatedItems: ReviewQAItem[] = (qaItems as any[]).map((item) => ({
    question: item.question,
    answer: item.answer,
  }));

  try {
    const result = await ApiService.post<SubmitReviewSessionResponse>(
      `/tickets/${ticketId.trim()}/review-session`,
      { qaItems: validatedItems },
      config
    );

    const displayStatus = result.status.replace(/-/g, ' ');
    return {
      content: [
        {
          type: 'text',
          text: `Review session submitted for ${result.ticketId}. Status is now "${displayStatus}". The PM will see your answers and can re-bake the ticket.`,
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
