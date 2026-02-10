-- NTF-01: Seed 13 default notification templates for first organization

INSERT INTO notification_templates (organization_id, event_type, channel, body, variables)
SELECT o.id, ev.event_type, ev.channel, ev.body, ev.variables::jsonb
FROM (SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1) o
CROSS JOIN (VALUES
  ('lead.created', 'ZALO_ZNS', 'Cảm ơn {{customer_name}} đã quan tâm. Chúng tôi sẽ liên hệ sớm.', '{"customer_name": "string"}'),
  ('lead.assigned', 'ZALO_ZNS', 'Dự án {{project_id}} đã được giao cho tư vấn. Chúng tôi sẽ liên hệ.', '{"project_id": "string"}'),
  ('quote.created', 'ZALO_ZNS', 'Báo giá {{quote_number}} đã được tạo. Chi tiết sẽ gửi qua email.', '{"quote_number": "string"}'),
  ('quote.approved', 'ZALO_ZNS', 'Báo giá đã được duyệt. Vui lòng xác nhận để tiến hành hợp đồng.', '{"quote_number": "string"}'),
  ('quote.sent', 'EMAIL', 'Báo giá {{quote_number}} gửi đến quý khách. Vui lòng kiểm tra email.', '{"quote_number": "string"}'),
  ('contract.created', 'ZALO_ZNS', 'Hợp đồng {{contract_number}} đã được tạo. Vui lòng ký và xác nhận.', '{"contract_number": "string"}'),
  ('contract.signed', 'ZALO_ZNS', 'Hợp đồng đã ký. Cảm ơn quý khách. Chúng tôi sẽ sắp xếp lắp đặt.', '{"contract_number": "string"}'),
  ('installation.scheduled', 'ZALO_ZNS', 'Lịch lắp đặt đã được sắp xếp vào {{date}}. Nhân viên sẽ liên hệ trước.', '{"date": "string"}'),
  ('installation.completed', 'ZALO_ZNS', 'Hoàn thành lắp đặt hệ thống. Hợp đồng {{contract_number}} đã bàn giao.', '{"contract_number": "string"}'),
  ('commission.approved', 'ZALO_ZNS', 'Hoa hồng {{amount}} VND đã được duyệt. Sẽ chuyển trong 7 ngày.', '{"amount": "number"}'),
  ('commission.paid', 'ZALO_ZNS', 'Đã chi trả hoa hồng {{amount}} VND. Cảm ơn đối tác.', '{"amount": "number"}'),
  ('partner.onboarding', 'SMS', 'Chào mừng {{partner_name}} tham gia mạng lưới đối tác Solar.', '{"partner_name": "string"}'),
  ('partner.lead_assigned', 'ZALO_ZNS', 'Lead mới {{lead_id}} đã được giao cho bạn. Vui lòng liên hệ sớm.', '{"lead_id": "string"}')
) AS ev(event_type, channel, body, variables)
ON CONFLICT (organization_id, event_type, channel) DO NOTHING;
