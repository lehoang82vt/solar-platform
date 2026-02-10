import { Zap, Shield, TrendingDown, Wrench } from 'lucide-react';
import { Card } from '@/components/ui/card';

const features = [
  {
    icon: Zap,
    title: 'Tính toán tự động',
    description: 'Hệ thống AI tính toán công suất phù hợp dựa trên tiêu thụ điện',
  },
  {
    icon: Shield,
    title: 'Bảo hành 25 năm',
    description: 'Thiết bị chính hãng với bảo hành dài hạn',
  },
  {
    icon: TrendingDown,
    title: 'Tiết kiệm 90%',
    description: 'Giảm hóa đơn điện đến 90% mỗi tháng',
  },
  {
    icon: Wrench,
    title: 'Lắp đặt nhanh',
    description: 'Thi công hoàn thành trong 3-5 ngày',
  },
];

export default function FeaturesSection() {
  return (
    <section id="features" className="py-20 bg-gray-50">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">
          Tại sao chọn chúng tôi?
        </h2>
        <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
          Giải pháp điện mặt trời toàn diện với công nghệ tiên tiến
        </p>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Card key={index} className="p-6 text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="font-bold text-lg mb-2">{feature.title}</h3>
                <p className="text-gray-600 text-sm">{feature.description}</p>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
