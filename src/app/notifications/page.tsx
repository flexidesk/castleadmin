import AppLayout from '@/components/AppLayout';
import NotificationCenterContent from './components/NotificationCenterContent';

export const metadata = {
  title: 'Notification Center | CastleAdmin',
};

export default function NotificationsPage() {
  return (
    <AppLayout title="Notification Center" subtitle="Alert history and dismissal management">
      <NotificationCenterContent />
    </AppLayout>
  );
}
