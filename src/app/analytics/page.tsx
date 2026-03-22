import AppLayout from '@/components/AppLayout';
import AnalyticsContent from './components/AnalyticsContent';

export const metadata = {
  title: 'Analytics | CastleAdmin',
  description: 'Driver performance metrics, revenue per driver, and fleet utilization trends',
};

export default function AnalyticsPage() {
  return (
    <AppLayout>
      <div className="p-6">
        <AnalyticsContent />
      </div>
    </AppLayout>
  );
}
