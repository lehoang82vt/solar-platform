'use client';

import PartnerNav from '@/components/layout/PartnerNav';

export default function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-gray-50">
      <PartnerNav />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="container mx-auto px-4 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
