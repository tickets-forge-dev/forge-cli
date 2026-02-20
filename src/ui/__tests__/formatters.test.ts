import { describe, it, expect } from 'vitest';
import { statusIcon, formatTicketRow } from '../formatters';
import { AECStatus, type TicketListItem } from '../../types/ticket';

const ticket: TicketListItem = {
  id: 'T-001',
  title: 'Fix the login bug',
  status: AECStatus.READY,
  assignedTo: 'dev@example.com',
};

describe('formatters', () => {
  describe('statusIcon', () => {
    it('returns rocket for READY', () => {
      expect(statusIcon(AECStatus.READY)).toBe('🚀');
    });

    it('returns checkmark for COMPLETE', () => {
      expect(statusIcon(AECStatus.COMPLETE)).toBe('✅');
    });

    it('returns chat bubble for question rounds', () => {
      expect(statusIcon(AECStatus.IN_QUESTION_ROUND_1)).toBe('💬');
      expect(statusIcon(AECStatus.IN_QUESTION_ROUND_2)).toBe('💬');
      expect(statusIcon(AECStatus.IN_QUESTION_ROUND_3)).toBe('💬');
    });

    it('returns warning for DRIFTED', () => {
      expect(statusIcon(AECStatus.DRIFTED)).toContain('⚠️');
    });
  });

  describe('formatTicketRow', () => {
    it('includes ticket id, title, and assignee', () => {
      const row = formatTicketRow(ticket, false);
      expect(row).toContain('T-001');
      expect(row).toContain('Fix the login bug');
      expect(row).toContain('dev@example.com');
    });

    it('shows pointer for selected row', () => {
      const selected = formatTicketRow(ticket, true);
      const unselected = formatTicketRow(ticket, false);
      expect(selected).toContain('▶');
      expect(unselected).not.toContain('▶');
    });

    it('truncates long titles to 40 chars', () => {
      const longTitle = ticket.title.padEnd(80, 'x');
      const row = formatTicketRow({ ...ticket, title: longTitle }, false);
      // Title is padEnd(40) after substring(0,40) — check the output doesn't contain the full long title
      expect(row).not.toContain(longTitle);
    });
  });
});
