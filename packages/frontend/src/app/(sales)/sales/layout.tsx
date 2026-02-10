import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sales Dashboard | Solar-GPT',
  description: 'Quản lý leads và dự án điện mặt trời',
};

export default function SalesPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
