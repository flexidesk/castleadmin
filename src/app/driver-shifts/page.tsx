import AppLayout from '@/components/AppLayout';
import DriverShiftContent from './components/DriverShiftContent';

export const metadata = {
  title: 'Driver Shifts | CastleAdmin',
  description: 'Manage driver shift schedules, assignments, and recurring templates',
};

export default function DriverShiftsPage() {
  return (
    <AppLayout>
      <DriverShiftContent />
    </AppLayout>
  );
}
