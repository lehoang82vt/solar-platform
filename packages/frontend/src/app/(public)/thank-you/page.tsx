import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';

export default function ThankYouPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Cảm ơn bạn!</h1>
        <p className="text-gray-600 mb-8">
          Chúng tôi đã nhận thông tin. Đội ngũ tư vấn sẽ liên hệ với bạn trong thời gian sớm nhất.
        </p>
        <Button asChild size="lg">
          <Link href="/">Về trang chủ</Link>
        </Button>
      </div>
    </div>
  );
}
