import { Metadata } from 'next';
import AppLayout from '@/components/AppLayout';
import DeliveryZonesContent from './components/DeliveryZonesContent';

export const metadata: Metadata = {
  title: 'Delivery Zones | CastleAdmin',
  description: 'Draw and manage delivery zones, assign drivers to zones',
};

export default function DeliveryZonesPage() {
  return (
    <AppLayout>
      <DeliveryZonesContent />
    </AppLayout>
  );
}
