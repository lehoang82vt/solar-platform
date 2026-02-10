import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin | Solar-GPT',
  description: 'Quản trị hệ thống và phê duyệt báo giá',
};

export default function AdminPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
