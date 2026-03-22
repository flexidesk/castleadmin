import type { Metadata } from 'next';
import TrackingContent from './components/TrackingContent';

export const metadata: Metadata = {
  title: 'Track Your Order | CastleAdmin',
  description: 'Enter your order ID and PIN to track your delivery in real time.',
};

export default function TrackPage() {
  return <TrackingContent />;
}
