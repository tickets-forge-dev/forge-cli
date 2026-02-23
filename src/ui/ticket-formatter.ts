import { type TicketDetail } from '../types/ticket';
import { STATUS_DISPLAY_NAMES } from './formatters';

/**
 * Format a TicketDetail as plain text for clipboard copying.
 * No chalk colors — just structured plain text.
 */
export function formatTicketPlainText(
  ticket: TicketDetail,
  memberNames?: Map<string, string>
): string {
  const lines: string[] = [];

  // Header
  lines.push(`[${ticket.id}] ${ticket.title}`);
  lines.push('-'.repeat(72));

  // Metadata
  const statusName = STATUS_DISPLAY_NAMES[ticket.status] ?? ticket.status;
  lines.push(`Status:    ${statusName}`);
  if (ticket.priority) {
    lines.push(`Priority:  ${ticket.priority.toUpperCase()}`);
  }
  if (ticket.assignedTo) {
    const name = memberNames?.get(ticket.assignedTo) ?? ticket.assignedTo;
    lines.push(`Assignee:  ${name}`);
  }

  // Description
  if (ticket.description) {
    lines.push('', '## Description', ticket.description);
  }

  // Problem Statement
  if (ticket.problemStatement) {
    lines.push('', '## Problem Statement', ticket.problemStatement);
  }

  // Solution
  if (ticket.solution) {
    lines.push('', '## Solution', ticket.solution);
  }

  // Acceptance Criteria
  if (ticket.acceptanceCriteria.length > 0) {
    lines.push('', '## Acceptance Criteria');
    ticket.acceptanceCriteria.forEach((ac, i) => {
      lines.push(`  ${i + 1}. ${ac}`);
    });
  }

  // File Changes
  if (ticket.fileChanges && ticket.fileChanges.length > 0) {
    lines.push('', '## File Changes');
    for (const fc of ticket.fileChanges) {
      const notes = fc.notes ? ` - ${fc.notes}` : '';
      lines.push(`  ${fc.action.toUpperCase()}  ${fc.path}${notes}`);
    }
  }

  // API Changes
  if (ticket.apiChanges) {
    lines.push('', '## API Changes', ticket.apiChanges);
  }

  // Test Plan
  if (ticket.testPlan) {
    lines.push('', '## Test Plan', ticket.testPlan);
  }

  // Design References
  if (ticket.designRefs && ticket.designRefs.length > 0) {
    lines.push('', '## Design References');
    for (const ref of ticket.designRefs) {
      lines.push(`  - ${ref}`);
    }
  }

  return lines.join('\n');
}
