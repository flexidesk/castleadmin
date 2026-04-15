'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Truck, MapPin, PackageOpen, CheckCircle2, Loader2, Clock } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


interface DeliveryStatusUpdate {
  id: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  timestamp: string;
}

interface Props {
  orderId: string;
  driverId: string | null;
  existingUpdates?: DeliveryStatusUpdate[];
  onUpdate?: (update: DeliveryStatusUpdate) => void;
}

const STATUS_BUTTONS = [
  {
    key: 'departed',
    label: 'Departed',
    description: 'Left for delivery',
    icon: Truck,
    color: 'hsl(217 91% 60%)',
    bg: 'hsl(217 91% 60% / 0.1)',
  },
  {
    key: 'arrived_at_location',
    label: 'Arrived',
    description: 'At delivery location',
    icon: MapPin,
    color: 'hsl(38 92% 50%)',
    bg: 'hsl(38 92% 50% / 0.1)',
  },
  {
    key: 'started_delivery',
    label: 'Started Delivery',
    description: 'Delivering now',
    icon: PackageOpen,
    color: 'hsl(262 83% 58%)',
    bg: 'hsl(262 83% 58% / 0.1)',
  },
  {
    key: 'completed',
    label: 'Completed',
    description: 'Delivery done',
    icon: CheckCircle2,
    color: 'hsl(142 69% 35%)',
    bg: 'hsl(142 69% 35% / 0.1)',
  },
] as const;

type StatusKey = typeof STATUS_BUTTONS[number]['key'];

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

async function captureGPS(): Promise<{ latitude: number; longitude: number; accuracy: number } | null> {
  if (!navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });
}

export default function DeliveryStatusButtons({ orderId, driverId, existingUpdates = [], onUpdate }: Props) {
  const [updates, setUpdates] = useState<DeliveryStatusUpdate[]>(existingUpdates);
  const [loadingStatus, setLoadingStatus] = useState<StatusKey | null>(null);
  const supabase = createClient();

  const getUpdateForStatus = (key: StatusKey) =>
    updates.find((u) => u.status === key) ?? null;

  const handleStatusUpdate = async (statusKey: StatusKey) => {
    if (loadingStatus) return;
    const existing = getUpdateForStatus(statusKey);
    if (existing) {
      toast.info(`${STATUS_BUTTONS.find(b => b.key === statusKey)?.label} already recorded at ${formatTime(existing.timestamp)}`);
      return;
    }

    setLoadingStatus(statusKey);
    try {
      const gps = await captureGPS();
      const timestamp = new Date().toISOString();

      const { data, error } = await supabase
        .from('delivery_status_updates')
        .insert({
          order_id: orderId,
          driver_id: driverId,
          status: statusKey,
          latitude: gps?.latitude ?? null,
          longitude: gps?.longitude ?? null,
          accuracy: gps?.accuracy ?? null,
          timestamp,
        })
        .select()
        .single();

      if (error) throw error;

      const newUpdate: DeliveryStatusUpdate = {
        id: data.id,
        status: statusKey,
        latitude: gps?.latitude ?? null,
        longitude: gps?.longitude ?? null,
        timestamp,
      };

      setUpdates((prev) => [...prev, newUpdate]);
      onUpdate?.(newUpdate);

      const label = STATUS_BUTTONS.find(b => b.key === statusKey)?.label ?? statusKey;
      const gpsText = gps ? ` · GPS captured` : ' · No GPS';
      toast.success(`${label} recorded at ${formatTime(timestamp)}${gpsText}`);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to record status');
    } finally {
      setLoadingStatus(null);
    }
  };

  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
    >
      <div className="flex items-center gap-2">
        <Clock size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Delivery Status Updates
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {STATUS_BUTTONS.map((btn) => {
          const recorded = getUpdateForStatus(btn.key);
          const isLoading = loadingStatus === btn.key;
          const Icon = btn.icon;

          return (
            <button
              key={btn.key}
              onClick={() => handleStatusUpdate(btn.key)}
              disabled={!!loadingStatus}
              className="flex flex-col items-start gap-1.5 p-3 rounded-xl border transition-all text-left"
              style={{
                backgroundColor: recorded ? btn.bg : 'hsl(var(--secondary))',
                borderColor: recorded ? btn.color : 'hsl(var(--border))',
                opacity: loadingStatus && !isLoading ? 0.6 : 1,
              }}
            >
              <div className="flex items-center justify-between w-full">
                {isLoading ? (
                  <Loader2 size={16} className="animate-spin" style={{ color: btn.color }} />
                ) : (
                  <Icon size={16} style={{ color: recorded ? btn.color : 'hsl(var(--muted-foreground))' }} />
                )}
                {recorded && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: btn.color }}
                  />
                )}
              </div>
              <div>
                <p
                  className="text-xs font-semibold leading-tight"
                  style={{ color: recorded ? btn.color : 'hsl(var(--foreground))' }}
                >
                  {btn.label}
                </p>
                {recorded ? (
                  <div className="space-y-0.5 mt-0.5">
                    <p className="text-[10px] font-medium" style={{ color: btn.color }}>
                      {formatTime(recorded.timestamp)}
                    </p>
                    {recorded.latitude && (
                      <p className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {recorded.latitude.toFixed(4)}, {recorded.longitude?.toFixed(4)}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {isLoading ? 'Capturing GPS…' : btn.description}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
