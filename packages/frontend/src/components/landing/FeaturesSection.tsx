import { Card } from '@/components/ui/card';
import { Wallet, Clock, ShieldCheck, Wrench } from 'lucide-react';

const benefits = [
  {
    icon: Wallet,
    title: 'Tiết kiệm chi phí điện',
    description: 'Giảm đến 80% hóa đơn điện mỗi tháng, tiết kiệm hàng chục triệu đồng mỗi năm.',
    color: 'text-green-500',
    bg: 'bg-green-50',
  },
  {
    icon: Clock,
    title: 'Thu hồi vốn nhanh',
    description: 'Thời gian hoàn vốn chỉ từ 4-6 năm, sau đó bạn được dùng điện gần như miễn phí.',
    color: 'text-amber-500',
    bg: 'bg-amber-50',
  },
  {
    icon: ShieldCheck,
    title: 'Bảo hành 25 năm',
    description: 'Hệ thống bền bỉ với tuổi thọ trên 25 năm, bảo hành toàn diện từ nhà sản xuất.',
    color: 'text-blue-500',
    bg: 'bg-blue-50',
  },
  {
    icon: Wrench,
    title: 'Khảo sát miễn phí',
    description: 'Đội ngũ kỹ thuật sẽ đến khảo sát thực tế mái nhà và tư vấn giải pháp tốt nhất cho bạn.',
    color: 'text-purple-500',
    bg: 'bg-purple-50',
  },
];

export default function FeaturesSection() {
  return (
    <section id="features" className="py-20 bg-gray-50/50">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
            Vì sao nên lắp điện mặt trời?
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Hàng nghìn gia đình đã tiết kiệm đáng kể với điện mặt trời. Bạn cũng có thể!
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {benefits.map((b, i) => (
            <Card key={i} className="p-6 hover:shadow-lg transition-shadow border-0 bg-white">
              <div className={`w-12 h-12 ${b.bg} rounded-xl flex items-center justify-center mb-4`}>
                <b.icon className={`w-6 h-6 ${b.color}`} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{b.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{b.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
