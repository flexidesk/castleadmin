import AppLayout from '@/components/AppLayout';
import OrderDetailContent from './components/OrderDetailContent';

interface Props {
  searchParams: Promise<{ id?: string }>;
}

export default async function OrderDetailPage({ searchParams }: Props) {
  const params = await searchParams;
  const orderId = params.id ?? null;

  return (
    <AppLayout
      title="Order Detail"
      subtitle="View and manage booking details"
    >
      <OrderDetailContent orderId={orderId} />
    </AppLayout>
  );
}