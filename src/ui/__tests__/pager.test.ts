import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { printTicketDetail } from '../pager';
import { AECStatus, type TicketDetail } from '../../types/ticket';

const ticket: TicketDetail = {
  id: 'T-001',
  title: 'Fix login on mobile',
  status: AECStatus.READY,
  priority: 'high',
  assignedTo: 'dev@example.com',
  acceptanceCriteria: [
    'Works on iOS Safari 16+',
    'Error shown on redirect failure',
  ],
  description: 'Fix the OAuth redirect on iOS.',
  createdAt: '2026-02-20T09:00:00.000Z',
  updatedAt: '2026-02-20T11:30:00.000Z',
};

describe('pager', () => {
  describe('printTicketDetail', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;
    let allOutput: string;

    beforeEach(() => {
      logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
        allOutput += args.join(' ') + '\n';
      });
      allOutput = '';
    });

    it('prints ticket id and title', () => {
      printTicketDetail(ticket);
      expect(allOutput).toContain('T-001');
      expect(allOutput).toContain('Fix login on mobile');
    });

    it('prints status', () => {
      printTicketDetail(ticket);
      expect(allOutput).toContain('READY');
      expect(allOutput).toContain('🚀');
    });

    it('prints priority', () => {
      printTicketDetail(ticket);
      expect(allOutput).toContain('HIGH');
    });

    it('prints assignee', () => {
      printTicketDetail(ticket);
      expect(allOutput).toContain('dev@example.com');
    });

    it('prints description', () => {
      printTicketDetail(ticket);
      expect(allOutput).toContain('Fix the OAuth redirect on iOS.');
    });

    it('prints numbered acceptance criteria', () => {
      printTicketDetail(ticket);
      expect(allOutput).toContain('Works on iOS Safari 16+');
      expect(allOutput).toContain('Error shown on redirect failure');
    });

    it('prints footer with review and execute hints', () => {
      printTicketDetail(ticket);
      expect(allOutput).toContain('forge review T-001');
      expect(allOutput).toContain('forge execute T-001');
    });

    it('skips description section when not present', () => {
      const noDesc = { ...ticket, description: undefined };
      printTicketDetail(noDesc);
      expect(allOutput).not.toContain('Description');
    });

    afterEach(() => {
      logSpy.mockRestore();
    });
  });
});
