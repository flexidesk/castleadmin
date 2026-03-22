import AppLayout from '@/components/AppLayout';
import SettingsContent from './components/SettingsContent';

export default function SettingsPage() {
  return (
    <AppLayout title="Settings" subtitle="Fleet configuration and system preferences">
      <SettingsContent />
    </AppLayout>
  );
}
