import AppLayout from '@/components/AppLayout';
import CustomerManagementContent from './components/CustomerManagementContent';

export const metadata = { title: 'Customer Management | CastleAdmin' };

export default function CustomerManagementPage() {
  return (
    <AppLayout title="Customer Management" subtitle="View and manage all customers">
      <CustomerManagementContent />
    </AppLayout>
  );
}
