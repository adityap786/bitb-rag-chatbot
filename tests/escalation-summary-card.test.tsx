// @vitest-environment jsdom
import '@testing-library/jest-dom';
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EscalationSummaryCard } from '@/components/chatbot/EscalationSummaryCard';
import type { EscalationContext } from '@/components/chatbot/EscalationSummaryCard';

const baseContext: EscalationContext = {
  userGoal: 'Process refund for order #12345',
  attemptedSolutions: [
    { action: 'Checked order status', outcome: 'failed', timestamp: '2025-11-19T10:00:00Z' },
    { action: 'Offered store credit', outcome: 'partial', timestamp: '2025-11-19T10:05:00Z' },
  ],
  frustrationLevel: 4,
  urgency: 'high',
  collectedDetails: {
    order_id: '12345',
    issue_category: 'refund_request',
    customer_account_age: '3 years',
  },
  conversationHistory: [
    { role: 'user', content: 'I need a refund', timestamp: '2025-11-19T09:58:00Z' },
    { role: 'assistant', content: 'I can help with that', timestamp: '2025-11-19T09:59:00Z' },
    { role: 'user', content: 'Why is this taking so long?', timestamp: '2025-11-19T10:01:00Z' },
  ],
  metadata: {
    sessionId: 'test-session-123',
    tenantId: 'tenant-a',
    startedAt: '2025-11-19T09:50:00Z',
    escalatedAt: '2025-11-19T10:00:00Z',
    totalMessages: 3,
    averageResponseTime: 2.5,
  },
};

describe('EscalationSummaryCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders header, user goal and urgency badge', () => {
    render(<EscalationSummaryCard context={baseContext} />);

    expect(screen.getByRole('heading', { name: /Escalation Summary/i })).toBeInTheDocument();
    expect(screen.getByText(baseContext.userGoal)).toBeInTheDocument();
    expect(screen.getByText(baseContext.urgency.toUpperCase())).toBeInTheDocument();
  });

  it('shows frustration level label for high frustration', () => {
    render(<EscalationSummaryCard context={baseContext} />);

    expect(screen.getByText(/Frustration Level/i)).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('renders attempted solutions and collected details', () => {
    render(<EscalationSummaryCard context={baseContext} />);

    baseContext.attemptedSolutions.forEach((s) => {
      expect(screen.getByText(s.action)).toBeInTheDocument();
    });

    // Check collected detail values show up
    Object.values(baseContext.collectedDetails).forEach((val) => {
      expect(screen.getByText(String(val))).toBeInTheDocument();
    });
  });

  it('displays session metadata correctly', () => {
    render(<EscalationSummaryCard context={baseContext} />);

    // 10 minutes difference between startedAt and escalatedAt
    expect(screen.getByText(/Session Duration/i)).toBeInTheDocument();
    expect(screen.getByText('10 min')).toBeInTheDocument();
    expect(screen.getByText(String(baseContext.metadata.totalMessages))).toBeInTheDocument();
    expect(screen.getByText('2.5s')).toBeInTheDocument();
  });

  it('toggles full conversation history when `showFullHistory` is true', async () => {
    const user = userEvent.setup();
    render(<EscalationSummaryCard context={baseContext} showFullHistory={true} />);

    const toggle = screen.getByRole('button', { name: /Full Conversation History/i });

    // Conversation messages should be hidden initially
    expect(screen.queryByText(baseContext.conversationHistory[0].content)).not.toBeInTheDocument();

    await user.click(toggle);

    await waitFor(() => {
      expect(screen.getByText(baseContext.conversationHistory[0].content)).toBeInTheDocument();
    });
  });

  it('calls onAcknowledge when acknowledgement button is clicked', async () => {
    const user = userEvent.setup();
    const onAck = vi.fn();

    render(<EscalationSummaryCard context={baseContext} onAcknowledge={onAck} />);

    const ackButton = screen.getByRole('button', { name: /Acknowledge/i });
    await user.click(ackButton);

    await waitFor(() => {
      expect(onAck).toHaveBeenCalled();
    });
  });

  it('has at least one semantic heading', () => {
    render(<EscalationSummaryCard context={baseContext} />);

    const headings = screen.getAllByRole('heading');
    expect(headings.length).toBeGreaterThan(0);
  });
});
