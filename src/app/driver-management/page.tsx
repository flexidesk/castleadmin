import AppLayout from '@/components/AppLayout';
import DriverManagementContent from './components/DriverManagementContent';

export const metadata = { title: 'Driver Management | CastleAdmin' };

export default function DriverManagementPage() {
  return (
    <AppLayout>
      <DriverManagementContent />
    </AppLayout>
  );
}
