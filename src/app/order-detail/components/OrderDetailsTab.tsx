'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { User, Phone, Mail, MapPin, Package, Truck, Clock, Info, ChevronDown, Check, Tag } from 'lucide-react';
import { AppOrder, AppDriver, ordersService } from '@/lib/services/ordersService';
import Icon from '@/components/ui/AppIcon';

interface Props {
  order: AppOrder;
}

export default function OrderDetailsTab({ order }: Props) {
  const [assignedDriver, setAssignedDriver] = useState<AppDriver | undefined>(order.driver);
  const [drivers, setDrivers] = useState<AppDriver[]>([]);
  const [driverDropdownOpen, setDriverDropdownOpen] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

  // Keep local driver in sync if parent order prop changes (real-time update)
  useEffect(() => {
    setAssignedDriver(order.driver);
  }, [order.driver]);

  // Fetch available drivers on mount
  useEffect(() => {
    ordersService.fetchDrivers().then(setDrivers);
  }, []);

  const handleAssignDriver = async (driver: AppDriver) => {
    setIsAssigning(true);
    const ok = await ordersService.assignDriver(order.id, driver.id);
    if (ok) {
      setAssignedDriver(driver);
      toast.success(`Driver assigned: ${driver.name}`);
    } else {
      toast.error('Failed to assign driver. Please try again.');
    }
    setDriverDropdownOpen(false);
    setIsAssigning(false);
  };

  const totalValue = order.products.reduce((sum: number, p: any) => sum + (p.totalPrice ?? 0), 0);

  const statusColor: Record<string, string> = {
    Available: 'hsl(142 69% 30%)',
    'On Route': 'hsl(24 80% 38%)',
    'Off Duty': 'hsl(var(--muted-foreground))',
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
      {/* Customer Info */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
          <User size={15} style={{ color: 'hsl(var(--primary))' }} />
          Customer Information
        </h3>
        <div className="space-y-3">
          {[
            { icon: User, label: 'Full Name', value: order.customer.name },
            { icon: Phone, label: 'Phone', value: order.customer.phone },
            { icon: Mail, label: 'Email', value: order.customer.email },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-start gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                style={{ backgroundColor: 'hsl(var(--secondary))' }}
              >
                <Icon size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {label}
                </p>
                <p className="text-sm font-medium mt-0.5">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Custom WooCommerce Fields */}
        {order.customFields && (
          <div className="pt-4 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
            <h4 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5"
              style={{ color: 'hsl(var(--muted-foreground))' }}>
              <Tag size={11} />
              Custom Fields
            </h4>
            <div className="space-y-2">
              {Object.entries(order.customFields).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between py-1.5 border-b last:border-0"
                  style={{ borderColor: 'hsl(var(--border) / 0.5)' }}>
                  <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{key}</span>
                  <span className="text-xs font-medium">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Delivery Address + Booking Window */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
          <MapPin size={15} style={{ color: 'hsl(var(--primary))' }} />
          {order.type === 'Delivery' ? 'Delivery Address' : 'Collection Details'}
        </h3>

        {order.type === 'Delivery' && order.deliveryAddress ? (
          <div
            className="p-4 rounded-xl border space-y-1"
            style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--secondary) / 0.4)' }}
          >
            <p className="text-sm font-semibold">{order.deliveryAddress.line1}</p>
            {order.deliveryAddress.line2 && <p className="text-sm">{order.deliveryAddress.line2}</p>}
            <p className="text-sm">{order.deliveryAddress.city}</p>
            <p className="text-sm">{order.deliveryAddress.county}</p>
            <p className="text-sm font-mono font-semibold" style={{ color: 'hsl(var(--primary))' }}>
              {order.deliveryAddress.postcode}
            </p>
            {order.deliveryAddress.notes && (
              <div className="mt-3 pt-3 border-t flex items-start gap-2" style={{ borderColor: 'hsl(var(--border))' }}>
                <Info size={13} className="shrink-0 mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }} />
                <p className="text-xs italic" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {order.deliveryAddress.notes}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-xl border" style={{ borderColor: 'hsl(var(--border))' }}>
            <p className="text-sm font-medium">Collection from customer&apos;s address</p>
            <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Driver will collect the booking from the customer&apos;s address
            </p>
          </div>
        )}

        {/* Booking Windows */}
        <div className="space-y-2">
          <div className="flex items-center gap-3 p-3 rounded-lg border" style={{ borderColor: 'hsl(var(--border))' }}>
            <Clock size={14} style={{ color: 'hsl(var(--primary))' }} />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Delivery Window
              </p>
              <p className="text-sm font-semibold">{order.deliveryWindow}</p>
            </div>
          </div>
          {order.collectionWindow && (
            <div className="flex items-center gap-3 p-3 rounded-lg border" style={{ borderColor: 'hsl(var(--border))' }}>
              <Clock size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Collection Window
                </p>
                <p className="text-sm font-semibold">{order.collectionWindow}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Products + Driver */}
      <div className="space-y-4 lg:col-span-2 2xl:col-span-1">
        {/* WooCommerce Products */}
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
          <Package size={15} style={{ color: 'hsl(var(--primary))' }} />
          WooCommerce Items
        </h3>
        <div className="border rounded-xl overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: 'hsl(var(--secondary) / 0.5)' }}>
                {['Product', 'SKU', 'Qty', 'Total'].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider ${i >= 2 ? 'text-right' : 'text-left'}`}
                    style={{ color: 'hsl(var(--muted-foreground))' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {order.products.map((product: any) => (
                <tr key={product.id} className="border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-sm">{product.name}</p>
                    <p className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>{product.category}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{product.sku}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums">{product.quantity}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums">
                    {product.totalPrice === 0 ? (
                      <span style={{ color: 'hsl(var(--muted-foreground))' }}>Included</span>
                    ) : (
                      `£${(product.totalPrice ?? 0).toFixed(2)}`
                    )}
                  </td>
                </tr>
              ))}
              <tr
                className="border-t"
                style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--secondary) / 0.4)' }}
              >
                <td colSpan={3} className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Order Total
                </td>
                <td className="px-4 py-2.5 text-right text-sm font-bold tabular-nums">
                  £{totalValue.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Driver Assignment */}
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3" style={{ color: 'hsl(var(--foreground))' }}>
            <Truck size={15} style={{ color: 'hsl(var(--primary))' }} />
            Driver Assignment
          </h3>

          <div className="relative">
            <button
              onClick={() => setDriverDropdownOpen((o) => !o)}
              className="w-full flex items-center justify-between p-3 rounded-xl border text-sm transition-all duration-150 hover:border-primary"
              style={{ borderColor: driverDropdownOpen ? 'hsl(var(--primary))' : 'hsl(var(--border))' }}
            >
              {assignedDriver ? (
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
                    style={{ backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}
                  >
                    {assignedDriver.avatar}
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-sm">{assignedDriver.name}</p>
                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {assignedDriver.vehicle} · {assignedDriver.plate}
                    </p>
                  </div>
                </div>
              ) : (
                <span style={{ color: 'hsl(var(--muted-foreground))' }}>Select a driver…</span>
              )}
              <ChevronDown
                size={15}
                className="transition-transform duration-150"
                style={{
                  color: 'hsl(var(--muted-foreground))',
                  transform: driverDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              />
            </button>

            {driverDropdownOpen && (
              <div
                className="absolute top-full left-0 right-0 mt-1 rounded-xl border shadow-lg z-20 overflow-hidden animate-scale-in"
                style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
              >
                {drivers.length === 0 && (
                  <div className="px-4 py-3 text-sm text-center" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Loading drivers…
                  </div>
                )}
                {drivers.map((driver) => (
                  <button
                    key={driver.id}
                    onClick={() => handleAssignDriver(driver)}
                    disabled={driver.status === 'Off Duty' || isAssigning}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-b last:border-0"
                    style={{ borderColor: 'hsl(var(--border))' }}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                      style={{ backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}
                    >
                      {driver.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{driver.name}</p>
                      <p className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {driver.vehicle} · {driver.plate} · {driver.phone}
                      </p>
                    </div>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                      style={{ color: statusColor[driver.status], backgroundColor: `${statusColor[driver.status]}18` }}
                    >
                      {driver.status}
                    </span>
                    {assignedDriver?.id === driver.id && (
                      <Check size={14} style={{ color: 'hsl(var(--primary))' }} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}