import AppLayout from '@/components/AppLayout';
import ActivityLogContent from './components/ActivityLogContent';

export default function ActivityLogPage() {
  return (
    <AppLayout title="Activity Log" subtitle="Order and driver status changes with timestamps and before/after values">
      <ActivityLogContent />
    </AppLayout>
  );
}
