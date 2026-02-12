'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';

export default function OTPPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);

  const phoneDigits = phone.replace(/\D/g, '');
  const isPhoneValid = /^0[0-9]{9,10}$/.test(phoneDigits);

  const requestOTP = async () => {
    if (!isPhoneValid) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng nhập số điện thoại hợp lệ (10–11 số, bắt đầu bằng 0)',
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    try {
      await api.post('/api/public/otp/request', { phone: phoneDigits });
      toast({
        title: 'Đã gửi OTP',
        description: `Mã OTP đã được gửi đến ${phoneDigits}`,
      });
      setPhone(phoneDigits);
      setStep('otp');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast({
        title: 'Lỗi',
        description: err.response?.data?.message || 'Không thể gửi OTP',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async () => {
    setLoading(true);
    try {
      await api.post('/api/public/otp/verify', { phone, otp });
      toast({
        title: 'Xác thực thành công',
        description: 'Chúng tôi sẽ liên hệ bạn sớm nhất',
      });
      router.push('/thank-you');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast({
        title: 'Lỗi',
        description: err.response?.data?.message || 'OTP không đúng',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <Card className="max-w-md w-full p-8">
        <h1 className="text-2xl font-bold text-center mb-8">
          {step === 'phone' ? 'Nhập số điện thoại' : 'Xác thực OTP'}
        </h1>

        {step === 'phone' ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="phone">Số điện thoại</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0901234567"
                className="mt-2"
              />
            </div>
            <Button
              onClick={requestOTP}
              disabled={!isPhoneValid || loading}
              className="w-full"
              size="lg"
            >
              {loading ? 'Đang gửi...' : 'Gửi OTP'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 text-center">
              Mã OTP đã được gửi đến <strong>{phone}</strong>
            </p>
            <div>
              <Label htmlFor="otp">Mã OTP</Label>
              <Input
                id="otp"
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="mt-2 text-center text-2xl tracking-widest"
                maxLength={6}
              />
            </div>
            <Button
              onClick={verifyOTP}
              disabled={otp.length !== 6 || loading}
              className="w-full"
              size="lg"
            >
              {loading ? 'Đang xác thực...' : 'Xác nhận'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setStep('phone')}
              className="w-full"
            >
              Đổi số điện thoại
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
