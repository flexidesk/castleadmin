import AppLayout from '@/components/AppLayout';
import DriverPerformanceContent from './components/DriverPerformanceContent';

export default function DriverPerformancePage() {
  return (
    <AppLayout title="Driver Performance" subtitle="Delivery success rates, ratings, and historical analytics">
      <DriverPerformanceContent />
    </AppLayout>
  );
}
