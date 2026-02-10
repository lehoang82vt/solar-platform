/**
 * NTF-02: In-process event bus for notification and other handlers.
 */

export type EventType =
  | 'lead.created'
  | 'lead.assigned'
  | 'quote.created'
  | 'quote.approved'
  | 'quote.sent'
  | 'contract.created'
  | 'contract.signed'
  | 'installation.scheduled'
  | 'installation.completed'
  | 'commission.approved'
  | 'commission.paid'
  | 'partner.onboarding'
  | 'partner.lead_assigned';

export interface Event {
  type: EventType;
  organizationId: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export type EventHandler = (event: Event) => void | Promise<void>;

const WILDCARD = '*';

class EventBus {
  private handlers = new Map<EventType | typeof WILDCARD, EventHandler[]>();

  on(eventType: EventType | typeof WILDCARD, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }

  async emit(event: Event): Promise<void> {
    const specific = this.handlers.get(event.type) || [];
    const wildcard = this.handlers.get(WILDCARD) || [];
    const all = [...specific, ...wildcard];
    await Promise.all(all.map((h) => Promise.resolve(h(event))));
  }
}

export const eventBus = new EventBus();
