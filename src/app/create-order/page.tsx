import AppLayout from '@/components/AppLayout';
import CreateOrderForm from './components/CreateOrderForm';

export default function CreateOrderPage() {
  return (
    <AppLayout
      title="Create New Booking"
      subtitle="Manually create a booking or import from WooCommerce"
    >
      <CreateOrderForm />
    </AppLayout>
  );
}