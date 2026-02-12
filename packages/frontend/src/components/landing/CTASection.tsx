'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import {
  Phone, Shield, Loader2, CheckCircle, ArrowRight, Lock,
} from 'lucide-react';

interface PhoneGateProps {
  onVerified?: (leadId: string) => void;
}

export default function CTASection({ onVerified }: PhoneGateProps) {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'cta' | 'phone' | 'otp' | 'verified'>('cta');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const phoneDigits = phone.replace(/\D/g, '');
  const isPhoneValid = /^0[0-9]{9,10}$/.test(phoneDigits);

  const handleStartFlow = () => {
    setStep('phone');
  };

  const handleRequestOtp = async () => {
    if (!isPhoneValid) {
      setError('Vui lòng nhập số điện thoại hợp lệ (10-11 số, bắt đầu bằng 0)');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.post('/api/public/otp/request', { phone: phoneDigits });
      setPhone(phoneDigits);
      setStep('otp');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Không thể gửi OTP. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      setError('Vui lòng nhập mã OTP 6 chữ số');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post<{ verified: boolean; lead_id?: string; message?: string }>(
        '/api/public/otp/verify',
        { phone, otp }
      );
      if (data.verified) {
        setStep('verified');
        onVerified?.(data.lead_id || '');
        // Scroll to preview
        setTimeout(() => {
          document.getElementById('preview-report')?.scrollIntoView({ behavior: 'smooth' });
        }, 500);
      } else {
        setError(data.message || 'Mã OTP không đúng. Vui lòng thử lại.');
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Xác minh thất bại. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOtp(e.target.value.replace(/\D/g, '').slice(0, 6));
  };

  return (
    <section id="contact" className="py-20 bg-gradient-to-br from-sky-50 via-white to-amber-50">
      <div className="max-w-2xl mx-auto px-6">

        {/* CTA message */}
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4 leading-tight">
            Muốn xem <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-500">báo giá chi tiết</span>?
          </h2>
          <p className="text-gray-500 max-w-lg mx-auto">
            Xem sơ đồ hệ thống, sản lượng dự kiến và thời gian hoàn vốn chính xác cho mái nhà của bạn.
          </p>
        </div>

        {/* Phone Gate Card */}
        <Card className="p-6 sm:p-8 shadow-xl border-0">
          {step === 'cta' && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto">
                <Phone className="w-8 h-8 text-amber-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Nhận báo giá chi tiết miễn phí
                </h3>
                <p className="text-sm text-gray-500">
                  Chỉ cần xác minh số điện thoại để nhận mẫu báo giá. Hoàn toàn miễn phí!
                </p>
              </div>
              <Button
                size="lg"
                onClick={handleStartFlow}
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-lg h-14 rounded-xl shadow-lg"
              >
                Bắt đầu nhận báo giá
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Bảo mật</span>
                <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> Không spam</span>
              </div>
            </div>
          )}

          {step === 'phone' && (
            <div className="space-y-5">
              <div className="text-center">
                <h3 className="text-xl font-semibold text-gray-900 mb-1">Nhập số điện thoại</h3>
                <p className="text-sm text-gray-500">
                  Chúng tôi sẽ gửi mã xác minh OTP đến số điện thoại của bạn.
                </p>
              </div>
              <Input
                type="tel"
                inputMode="numeric"
                placeholder="Ví dụ: 0901234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="text-lg h-14 text-center font-semibold border-2 focus:border-amber-400"
              />
              {error && <p className="text-red-500 text-sm text-center">{error}</p>}
              <Button
                size="lg"
                onClick={handleRequestOtp}
                disabled={loading || !isPhoneValid}
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white h-14 rounded-xl"
              >
                {loading ? (
                  <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Đang gửi...</>
                ) : (
                  'Gửi mã OTP'
                )}
              </Button>
              <p className="text-xs text-gray-400 text-center">
                <Shield className="w-3 h-3 inline mr-1" />
                Chúng tôi chỉ dùng số điện thoại để gửi báo giá và liên hệ tư vấn, không spam.
              </p>
            </div>
          )}

          {step === 'otp' && (
            <div className="space-y-5">
              <div className="text-center">
                <h3 className="text-xl font-semibold text-gray-900 mb-1">Nhập mã xác minh</h3>
                <p className="text-sm text-gray-500">
                  Mã OTP đã được gửi đến <strong>{phone}</strong>
                </p>
              </div>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="Nhập mã 6 số"
                value={otp}
                onChange={handleOtpChange}
                maxLength={6}
                className="text-2xl h-16 text-center font-bold tracking-[0.5em] border-2 focus:border-amber-400"
              />
              {error && <p className="text-red-500 text-sm text-center">{error}</p>}
              <Button
                size="lg"
                onClick={handleVerifyOtp}
                disabled={loading || otp.length !== 6}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white h-14 rounded-xl"
              >
                {loading ? (
                  <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Đang xác minh...</>
                ) : (
                  'Xác minh'
                )}
              </Button>
              <button
                type="button"
                onClick={() => { setStep('phone'); setOtp(''); setError(''); }}
                className="w-full text-sm text-gray-400 hover:text-gray-600 text-center"
              >
                Đổi số điện thoại
              </button>
            </div>
          )}

          {step === 'verified' && (
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-10 h-10 text-green-500" />
              </div>
              <h3 className="text-xl font-semibold text-green-700">Xác minh thành công!</h3>
              <p className="text-gray-500 text-sm">
                Cảm ơn bạn! Dưới đây là mẫu báo giá ước tính cho gia đình bạn.
                Đội ngũ tư vấn sẽ liên hệ trong thời gian sớm nhất.
              </p>
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}
