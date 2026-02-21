// TODO: Replace with @forge/types when published (Epic 8)

export enum AECStatus {
  DRAFT = 'DRAFT',
  IN_QUESTION_ROUND_1 = 'IN_QUESTION_ROUND_1',
  IN_QUESTION_ROUND_2 = 'IN_QUESTION_ROUND_2',
  IN_QUESTION_ROUND_3 = 'IN_QUESTION_ROUND_3',
  QUESTIONS_COMPLETE = 'QUESTIONS_COMPLETE',
  VALIDATED = 'VALIDATED',
  READY = 'READY',
  CREATED = 'CREATED',
  DRIFTED = 'DRIFTED',
  COMPLETE = 'COMPLETE',
}

export type TicketType = 'feature' | 'bug' | 'task';

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface TicketListItem {
  id: string;
  title: string;
  status: AECStatus;
  priority?: TicketPriority;
  assignedTo?: string | null;
}

export interface FileChange {
  path: string;
  action: 'create' | 'modify' | 'delete';
  notes?: string;
}

export interface TicketDetail extends TicketListItem {
  description?: string;
  acceptanceCriteria: string[];
  createdAt: string;
  updatedAt: string;
  // Rich fields returned by the backend for full ticket context
  fileChanges?: FileChange[];
  problemStatement?: string;
  solution?: string;
  apiChanges?: string;
  testPlan?: string;
  designRefs?: string[];
}

// TicketContextResult is the shape returned by the get_ticket_context MCP tool.
// It maps directly to TicketDetail — the full ticket serialized for Claude.
export type TicketContextResult = TicketDetail;
