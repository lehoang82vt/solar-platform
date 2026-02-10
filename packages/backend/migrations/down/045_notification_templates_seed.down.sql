-- NTF-01: Remove seeded notification templates (by event_type)
DELETE FROM notification_templates
WHERE event_type IN (
  'lead.created', 'lead.assigned', 'quote.created', 'quote.approved', 'quote.sent',
  'contract.created', 'contract.signed', 'installation.scheduled', 'installation.completed',
  'commission.approved', 'commission.paid', 'partner.onboarding', 'partner.lead_assigned'
);
