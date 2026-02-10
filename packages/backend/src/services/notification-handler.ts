/**
 * NTF-02: Notification handler – template lookup, recipient resolution, log creation.
 * NTF-05: Content validation before sending.
 */
import { withOrgContext } from '../config/database';
import { eventBus, type Event, type EventType } from './event-bus';
import { resolveRecipients } from './recipient-resolver';
import { validateNotificationContent, type RecipientType } from './content-validator';

export interface NotificationTemplate {
  id: string;
  organization_id: string;
  event_type: string;
  channel: string;
  body: string;
  active: boolean;
}

export async function getTemplate(
  organizationId: string,
  eventType: string,
  channel: string
): Promise<NotificationTemplate | null> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query<NotificationTemplate>(
      `SELECT id, organization_id, event_type, channel, body, active
       FROM notification_templates
       WHERE organization_id = $1 AND event_type = $2 AND channel = $3`,
      [organizationId, eventType, channel]
    );
    const row = result.rows[0];
    return row ?? null;
  });
}

export async function createNotificationLog(
  organizationId: string,
  params: {
    event_type: string;
    channel: string;
    recipient: string;
    template_id: string | null;
    payload: Record<string, unknown>;
    status: string;
  }
): Promise<void> {
  await withOrgContext(organizationId, async (client) => {
    await client.query(
      `INSERT INTO notification_logs (organization_id, event_type, channel, recipient, template_id, payload, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        organizationId,
        params.event_type,
        params.channel,
        params.recipient,
        params.template_id,
        JSON.stringify(params.payload),
        params.status,
      ]
    );
  });
}

const DEFAULT_CHANNEL = 'ZALO_ZNS';

export async function handleNotificationEvent(event: Event): Promise<void> {
  const { type, organizationId, data } = event;

  const template = await getTemplate(organizationId, type, DEFAULT_CHANNEL);
  if (!template || !template.active) return;

  const recipientType: RecipientType =
    type.startsWith('partner.') ? 'PARTNER'
      : type.startsWith('quote.') || type.startsWith('contract.') ? 'CUSTOMER'
      : 'CUSTOMER';

  const validation = validateNotificationContent(template.body, recipientType);
  if (!validation.safe) {
    console.warn(`Content validation failed for ${type}:`, validation.flagged_keywords);
    return;
  }

  const recipients = await resolveRecipients(organizationId, type as EventType, data);
  if (recipients.length === 0) return;

  for (const recipient of recipients) {
    await createNotificationLog(organizationId, {
      event_type: type,
      channel: DEFAULT_CHANNEL,
      recipient,
      template_id: template.id,
      payload: data,
      status: 'PENDING',
    });
  }
}

export function registerNotificationHandler(): void {
  eventBus.on('*', handleNotificationEvent);
}

registerNotificationHandler();
