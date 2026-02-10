import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Partner Dashboard | Solar-GPT',
  description: 'Tổng quan đối tác và hoa hồng giới thiệu',
};

export default function PartnerPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
