// TODO: Replace with @forge/types when published (Epic 8)

export enum AECStatus {
  DRAFT = 'draft',
  VALIDATED = 'validated',
  READY = 'ready',
  WAITING_FOR_APPROVAL = 'waiting-for-approval',
  CREATED = 'created',
  DRIFTED = 'drifted',
  COMPLETE = 'complete',
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

export interface ReviewQAItem {
  question: string;
  answer: string;
}

export interface ReviewSession {
  qaItems: ReviewQAItem[];
  submittedAt: string;
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
  reviewSession?: ReviewSession | null;
}

// TicketContextResult is the shape returned by the get_ticket_context MCP tool.
// It maps directly to TicketDetail — the full ticket serialized for Claude.
export type TicketContextResult = TicketDetail;
