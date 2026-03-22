import type { Metadata } from 'next';
import AdminLiveTrackingContent from './components/AdminLiveTrackingContent';

export const metadata: Metadata = {
  title: 'Live Tracking | CastleAdmin',
  description: 'Admin live tracking for all bookings and drivers.',
};

export default function AdminLiveTrackingPage() {
  return <AdminLiveTrackingContent />;
}
