'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { AppOrder } from '@/lib/services/ordersService';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { MapIcon, Navigation, Clock, ChevronDown, ExternalLink, Maximize2, Minimize2, Route, Camera, PenLine, FileText, X, Trash2, CheckCircle2, Loader2,  } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


interface DriverRouteMapProps {
  orders: AppOrder[];
  driverName?: string;
}

const STATUS_COLOR: Record<string, string> = {
  'Booking Accepted': '#f59e0b',
  'Booking Assigned': '#3b82f6',
  'Booking Out For Delivery': '#8b5cf6',
  'Booking Complete': '#22c55e',
  'Booking Cancelled': '#ef4444',
};

const STATUS_LABEL: Record<string, string> = {
  'Booking Accepted': 'Accepted',
  'Booking Assigned': 'Assigned',
  'Booking Out For Delivery': 'Out for Delivery',
  'Booking Complete': 'Complete',
  'Booking Cancelled': 'Cancelled',
};

function isWindowUrgent(deliveryWindow: string): boolean {
  const now = new Date();
  const hour = now.getHours();
  if (deliveryWindow.includes('AM') && hour >= 9) return true;
  if (deliveryWindow.includes('PM') && hour >= 13) return true;
  return false;
}

function buildGoogleMapsUrl(address: AppOrder['deliveryAddress']): string {
  if (!address) return '#';
  const query = encodeURIComponent(`${address.line1}, ${address.city}, ${address.postcode}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${query}`;
}

function buildWazeUrl(address: AppOrder['deliveryAddress']): string {
  if (!address) return '#';
  const query = encodeURIComponent(`${address.line1}, ${address.city}, ${address.postcode}`);
  return `https://waze.com/ul?q=${query}&navigate=yes`;
}

async function geocodeAddress(address: string): Promise<[number, number] | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'CastleAdminDriverPortal/1.0' },
    });
    const data = await res.json();
    if (data && data.length > 0) {
      return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    }
  } catch {}
  return null;
}

interface OrderWithCoords extends AppOrder {
  coords?: [number, number];
  geocodeError?: boolean;
}

interface UploadedPhoto {
  id: string;
  url: string;
  caption: string;
  file?: File;
}

// ─── POD Capture Modal ────────────────────────────────────────────────────────

interface PODModalProps {
  order: OrderWithCoords;
  onClose: () => void;
  onSubmitted: () => void;
}

function PODModal({ order, onClose, onSubmitted }: PODModalProps) {
  const [activeTab, setActiveTab] = useState<'photo' | 'signature' | 'notes'>('photo');
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [signedBy, setSignedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [hasSignature, setHasSignature] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const getPos = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement
  ) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsDrawing(true);
    lastPos.current = getPos(e, canvas);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e, canvas);
    if (lastPos.current) {
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = 'hsl(215, 25%, 12%)';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      setHasSignature(true);
    }
    lastPos.current = pos;
  };

  const endDraw = () => {
    setIsDrawing(false);
    lastPos.current = null;
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not a valid image`);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 10MB limit`);
        return;
      }
      const url = URL.createObjectURL(file);
      setPhotos((prev) => [
        ...prev,
        {
          id: `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          url,
          caption: file.name.replace(/\.[^/.]+$/, ''),
          file,
        },
      ]);
    });
  }, []);

  const handleSubmit = async () => {
    if (photos.length === 0 && !hasSignature && !notes.trim()) {
      toast.error('Please add at least a photo, signature, or notes');
      return;
    }

    setIsSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const signatureDataUrl = hasSignature ? (canvasRef.current?.toDataURL('image/png') ?? '') : '';
      const photosPayload = photos.map((p) => ({
        id: p.id,
        url: p.url,
        caption: p.caption,
        uploadedAt: new Date().toISOString(),
      }));

      let driverId: string | null = null;
      if (user) {
        const { data: driverData } = await supabase
          .from('drivers')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();
        driverId = driverData?.id ?? null;
      }
      if (!driverId && order.driver?.id) {
        driverId = order.driver.id;
      }

      if (driverId) {
        await supabase.from('driver_pod_submissions').insert({
          order_id: order.id,
          driver_id: driverId,
          signed_by: signedBy.trim() || order.customer.name,
          signature_data_url: signatureDataUrl,
          notes: notes.trim() || null,
          photos: photosPayload,
          submitted_at: new Date().toISOString(),
        });
      }

      const podData = {
        signedBy: signedBy.trim() || order.customer.name,
        signatureDataUrl,
        notes: notes.trim() || null,
        images: photosPayload,
        completedAt: new Date().toISOString(),
        termsAccepted: true,
      };

      await supabase
        .from('orders')
        .update({
          pod: podData,
          status: 'Booking Complete',
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      toast.success('Proof of delivery submitted!');
      onSubmitted();
    } catch (err) {
      console.error('POD submit error:', err);
      toast.error('Failed to submit proof of delivery');
    } finally {
      setIsSaving(false);
    }
  };

  const tabs = [
    { key: 'photo' as const, label: 'Photo', icon: Camera },
    { key: 'signature' as const, label: 'Signature', icon: PenLine },
    { key: 'notes' as const, label: 'Notes', icon: FileText },
  ];

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: 'hsl(var(--card))',
          maxHeight: '90vh',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Modal Header */}
        <div
          className="flex items-start justify-between px-4 pt-4 pb-3 border-b shrink-0"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide mb-0.5"
              style={{ color: 'hsl(var(--primary))' }}>
              Proof of Delivery
            </p>
            <p className="font-semibold text-sm truncate" style={{ color: 'hsl(var(--foreground))' }}>
              {order.customer.name}
            </p>
            {order.deliveryAddress && (
              <p className="text-xs truncate mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {order.deliveryAddress.line1}, {order.deliveryAddress.city}, {order.deliveryAddress.postcode}
              </p>
            )}
            <div className="flex items-center gap-1 mt-1">
              <Clock size={10} style={{ color: 'hsl(var(--muted-foreground))' }} />
              <span className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {order.deliveryWindow} · {new Date(order.bookingDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
              </span>
              {order.orderNumber && (
                <span className="text-[11px] ml-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  · #{order.orderNumber}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-secondary ml-2 shrink-0"
          >
            <X size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
          </button>
        </div>

        {/* Tabs */}
        <div
          className="flex border-b shrink-0"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors relative"
              style={{
                color: activeTab === key ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                backgroundColor: activeTab === key ? 'hsl(var(--primary) / 0.06)' : 'transparent',
              }}
            >
              <Icon size={13} />
              {label}
              {key === 'photo' && photos.length > 0 && (
                <span
                  className="w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center"
                  style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
                >
                  {photos.length}
                </span>
              )}
              {key === 'signature' && hasSignature && (
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: 'hsl(142 69% 35%)' }}
                />
              )}
              {key === 'notes' && notes.trim() && (
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: 'hsl(var(--primary))' }}
                />
              )}
              {activeTab === key && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ backgroundColor: 'hsl(var(--primary))' }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4">

          {/* Photo Tab */}
          {activeTab === 'photo' && (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed transition-colors"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
              >
                <Camera size={28} style={{ color: 'hsl(var(--primary))' }} />
                <span className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                  Take Photo or Upload
                </span>
                <span className="text-xs">Tap to open camera or choose from gallery</span>
              </button>

              {photos.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {photos.map((photo) => (
                    <div key={photo.id} className="relative rounded-lg overflow-hidden aspect-square">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.url}
                        alt={photo.caption}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => setPhotos((prev) => prev.filter((p) => p.id !== photo.id))}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                      >
                        <Trash2 size={11} color="white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {photos.length === 0 && (
                <p className="text-center text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  No photos added yet
                </p>
              )}
            </div>
          )}

          {/* Signature Tab */}
          {activeTab === 'signature' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>
                  Received by
                </label>
                <input
                  type="text"
                  value={signedBy}
                  onChange={(e) => setSignedBy(e.target.value)}
                  placeholder={order.customer.name}
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2"
                  style={{
                    backgroundColor: 'hsl(var(--background))',
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                  }}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                    Customer Signature
                  </label>
                  {hasSignature && (
                    <button
                      onClick={clearSignature}
                      className="text-xs flex items-center gap-1"
                      style={{ color: 'hsl(var(--muted-foreground))' }}
                    >
                      <Trash2 size={11} /> Clear
                    </button>
                  )}
                </div>
                <div
                  className="rounded-xl border overflow-hidden"
                  style={{ borderColor: 'hsl(var(--border))', backgroundColor: '#fff' }}
                >
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={200}
                    className="w-full touch-none cursor-crosshair"
                    style={{ display: 'block', height: '160px' }}
                    onMouseDown={startDraw}
                    onMouseMove={draw}
                    onMouseUp={endDraw}
                    onMouseLeave={endDraw}
                    onTouchStart={startDraw}
                    onTouchMove={draw}
                    onTouchEnd={endDraw}
                  />
                </div>
                {!hasSignature && (
                  <p className="text-xs text-center mt-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Draw signature above
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Notes Tab */}
          {activeTab === 'notes' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>
                  Delivery Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Left with neighbour, left at door, access code used…"
                  rows={5}
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2 resize-none"
                  style={{
                    backgroundColor: 'hsl(var(--background))',
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                  }}
                />
              </div>
              {order.deliveryAddress?.notes && (
                <div
                  className="rounded-lg p-3 text-xs"
                  style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}
                >
                  <span className="font-semibold">Customer note: </span>
                  {order.deliveryAddress.notes}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Summary bar */}
        <div
          className="px-4 py-2 border-t flex items-center gap-3 shrink-0"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <div className="flex items-center gap-2 flex-1">
            <span
              className="flex items-center gap-1 text-[11px]"
              style={{ color: photos.length > 0 ? 'hsl(142 69% 35%)' : 'hsl(var(--muted-foreground))' }}
            >
              <Camera size={11} /> {photos.length}
            </span>
            <span
              className="flex items-center gap-1 text-[11px]"
              style={{ color: hasSignature ? 'hsl(142 69% 35%)' : 'hsl(var(--muted-foreground))' }}
            >
              <PenLine size={11} /> {hasSignature ? '✓' : '–'}
            </span>
            <span
              className="flex items-center gap-1 text-[11px]"
              style={{ color: notes.trim() ? 'hsl(142 69% 35%)' : 'hsl(var(--muted-foreground))' }}
            >
              <FileText size={11} /> {notes.trim() ? '✓' : '–'}
            </span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={isSaving || (photos.length === 0 && !hasSignature && !notes.trim())}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
            style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
          >
            {isSaving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            {isSaving ? 'Submitting…' : 'Submit POD'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Map Component ───────────────────────────────────────────────────────

export default function DriverRouteMap({ orders, driverName }: DriverRouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const routeLayerRef = useRef<any>(null);

  const [ordersWithCoords, setOrdersWithCoords] = useState<OrderWithCoords[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithCoords | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [showNavPanel, setShowNavPanel] = useState(false);
  const [podOrder, setPodOrder] = useState<OrderWithCoords | null>(null);

  const activeOrders = orders.filter(
    (o) => o.status !== 'Booking Complete' && o.status !== 'Booking Cancelled' && o.deliveryAddress
  );

  useEffect(() => {
    if (activeOrders.length === 0) {
      setOrdersWithCoords([]);
      return;
    }

    setGeocoding(true);

    const geocodeAll = async () => {
      const results: OrderWithCoords[] = await Promise.all(
        activeOrders.map(async (order) => {
          if (!order.deliveryAddress) return { ...order, geocodeError: true };
          const addr = `${order.deliveryAddress.line1}, ${order.deliveryAddress.city}, ${order.deliveryAddress.postcode}, UK`;
          const coords = await geocodeAddress(addr);
          return coords ? { ...order, coords } : { ...order, geocodeError: true };
        })
      );
      setOrdersWithCoords(results);
      setGeocoding(false);
    };

    geocodeAll();
  }, [orders.length, orders.map((o) => o.id).join(',')]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    import('leaflet').then((leafletModule) => {
      const L = leafletModule.default;

      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      if (!mapRef.current || mapInstanceRef.current) return;

      const map = L.map(mapRef.current, {
        center: [51.505, -0.09],
        zoom: 11,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersRef.current.clear();
      }
    };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current) return;

    import('leaflet').then((leafletModule) => {
      const L = leafletModule.default;
      const map = mapInstanceRef.current;
      const bounds: [number, number][] = [];

      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();

      if (routeLayerRef.current) {
        routeLayerRef.current.remove();
        routeLayerRef.current = null;
      }

      const validOrders = ordersWithCoords.filter((o) => o.coords);

      validOrders.forEach((order, idx) => {
        if (!order.coords) return;
        const color = STATUS_COLOR[order.status] ?? '#6b7280';
        const isUrgent = isWindowUrgent(order.deliveryWindow);

        const iconHtml = `
          <div style="
            width:32px;height:32px;border-radius:50%;
            background:${color};border:3px solid white;
            box-shadow:0 2px 8px rgba(0,0,0,0.3);
            display:flex;align-items:center;justify-content:center;
            font-size:12px;font-weight:700;color:white;
            cursor:pointer;position:relative;
          ">
            ${idx + 1}
            ${isUrgent ? `<span style="position:absolute;top:-3px;right:-3px;width:10px;height:10px;background:#ef4444;border-radius:50%;border:2px solid white;"></span>` : ''}
          </div>
        `;

        const icon = L.divIcon({
          html: iconHtml,
          className: '',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const marker = L.marker(order.coords, { icon })
          .addTo(map)
          .on('click', () => {
            setSelectedOrder(order);
            setShowNavPanel(true);
          });

        markersRef.current.set(order.id, marker);
        bounds.push(order.coords);
      });

      if (validOrders.length >= 2) {
        const latlngs = validOrders.filter((o) => o.coords).map((o) => o.coords as [number, number]);
        routeLayerRef.current = L.polyline(latlngs, {
          color: 'hsl(262, 83%, 58%)',
          weight: 3,
          opacity: 0.7,
          dashArray: '8, 6',
        }).addTo(map);
      }

      if (bounds.length > 0) {
        try {
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        } catch {}
      }
    });
  }, [ordersWithCoords]);

  const geocodedCount = ordersWithCoords.filter((o) => o.coords).length;

  return (
    <>
      {/* POD Modal */}
      {podOrder && (
        <PODModal
          order={podOrder}
          onClose={() => setPodOrder(null)}
          onSubmitted={() => {
            setPodOrder(null);
            setShowNavPanel(false);
            setSelectedOrder(null);
          }}
        />
      )}

      <div
        className={`rounded-xl border overflow-hidden flex flex-col transition-all duration-300 ${expanded ? 'fixed inset-4 z-50' : ''}`}
        style={{
          backgroundColor: 'hsl(var(--card))',
          borderColor: 'hsl(var(--border))',
          height: expanded ? 'auto' : '420px',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <div className="flex items-center gap-2">
            <Route size={16} style={{ color: 'hsl(var(--primary))' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
              Route Map
            </h3>
            {geocoding && (
              <span className="text-[10px] px-2 py-0.5 rounded-full animate-pulse"
                style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}>
                Locating…
              </span>
            )}
            {!geocoding && geocodedCount > 0 && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                style={{ backgroundColor: 'hsl(262 83% 58% / 0.1)', color: 'hsl(262 83% 58%)' }}>
                {geocodedCount} stop{geocodedCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:flex items-center gap-1 text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#ef4444' }} />
              Urgent
            </span>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="p-1.5 rounded-md transition-colors hover:bg-secondary"
              title={expanded ? 'Collapse map' : 'Expand map'}
            >
              {expanded ? (
                <Minimize2 size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
              ) : (
                <Maximize2 size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
              )}
            </button>
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative" style={{ minHeight: 0 }}>
          <style>{`
            @import url('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
          `}</style>

          <div ref={mapRef} className="w-full h-full" style={{ minHeight: expanded ? '500px' : '280px' }} />

          {/* Empty state overlay */}
          {!geocoding && activeOrders.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none"
              style={{ backgroundColor: 'hsl(var(--card) / 0.85)' }}>
              <MapIcon size={32} style={{ color: 'hsl(var(--muted-foreground))' }} />
              <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>No active deliveries</p>
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Assigned orders will appear here</p>
            </div>
          )}

          {/* Navigation + POD panel */}
          {showNavPanel && selectedOrder && (
            <div
              className="absolute bottom-0 left-0 right-0 rounded-t-xl border-t shadow-lg p-4 z-[1000]"
              style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: `${STATUS_COLOR[selectedOrder.status] ?? '#6b7280'}20`,
                        color: STATUS_COLOR[selectedOrder.status] ?? '#6b7280',
                      }}
                    >
                      {STATUS_LABEL[selectedOrder.status] ?? selectedOrder.status}
                    </span>
                    {isWindowUrgent(selectedOrder.deliveryWindow) && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: '#ef444420', color: '#ef4444' }}>
                        Urgent
                      </span>
                    )}
                  </div>
                  <p className="font-semibold text-sm truncate" style={{ color: 'hsl(var(--foreground))' }}>
                    {selectedOrder.customer.name}
                  </p>
                  {selectedOrder.deliveryAddress && (
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {selectedOrder.deliveryAddress.line1}, {selectedOrder.deliveryAddress.city},{' '}
                      {selectedOrder.deliveryAddress.postcode}
                    </p>
                  )}
                  <div className="flex items-center gap-1 mt-1">
                    <Clock size={11} style={{ color: 'hsl(var(--muted-foreground))' }} />
                    <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {selectedOrder.deliveryWindow} · {new Date(selectedOrder.bookingDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                  {selectedOrder.deliveryAddress?.notes && (
                    <p className="text-xs mt-1 italic" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      Note: {selectedOrder.deliveryAddress.notes}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setShowNavPanel(false)}
                  className="p-1.5 rounded-md hover:bg-secondary shrink-0"
                >
                  <ChevronDown size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
                </button>
              </div>

              {/* Navigation buttons */}
              <div className="flex gap-2 mb-2">
                <a
                  href={buildGoogleMapsUrl(selectedOrder.deliveryAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors"
                  style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
                >
                  <Navigation size={13} />
                  Google Maps
                  <ExternalLink size={11} />
                </a>
                <a
                  href={buildWazeUrl(selectedOrder.deliveryAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold border transition-colors hover:bg-secondary"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                >
                  <Route size={13} />
                  Waze
                  <ExternalLink size={11} />
                </a>
              </div>

              {/* POD Capture buttons */}
              <div
                className="flex gap-2 pt-2 border-t"
                style={{ borderColor: 'hsl(var(--border))' }}
              >
                <button
                  onClick={() => setPodOrder(selectedOrder)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold border transition-colors hover:bg-secondary"
                  style={{ borderColor: 'hsl(262 83% 58% / 0.4)', color: 'hsl(262 83% 58%)' }}
                >
                  <Camera size={13} />
                  Photo
                </button>
                <button
                  onClick={() => { setPodOrder(selectedOrder); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold border transition-colors hover:bg-secondary"
                  style={{ borderColor: 'hsl(262 83% 58% / 0.4)', color: 'hsl(262 83% 58%)' }}
                >
                  <PenLine size={13} />
                  Signature
                </button>
                <button
                  onClick={() => { setPodOrder(selectedOrder); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold border transition-colors hover:bg-secondary"
                  style={{ borderColor: 'hsl(262 83% 58% / 0.4)', color: 'hsl(262 83% 58%)' }}
                >
                  <FileText size={13} />
                  Notes
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Stop list */}
        {ordersWithCoords.length > 0 && (
          <div
            className="border-t shrink-0 overflow-y-auto"
            style={{ borderColor: 'hsl(var(--border))', maxHeight: '160px' }}
          >
            {ordersWithCoords.map((order, idx) => (
              <button
                key={order.id}
                onClick={() => {
                  setSelectedOrder(order);
                  setShowNavPanel(true);
                  if (order.coords && mapInstanceRef.current) {
                    mapInstanceRef.current.setView(order.coords, 15);
                  }
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left border-b last:border-b-0 transition-colors hover:bg-secondary"
                style={{ borderColor: 'hsl(var(--border))' }}
              >
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                  style={{
                    backgroundColor: STATUS_COLOR[order.status] ?? '#6b7280',
                    color: 'white',
                  }}
                >
                  {idx + 1}
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: 'hsl(var(--foreground))' }}>
                    {order.customer.name}
                  </p>
                  {order.deliveryAddress && (
                    <p className="text-[11px] truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {order.deliveryAddress.line1}, {order.deliveryAddress.postcode}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <span className="text-[11px] font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {order.deliveryWindow}
                  </span>
                  {isWindowUrgent(order.deliveryWindow) && (
                    <span className="text-[10px] font-semibold" style={{ color: '#ef4444' }}>Urgent</span>
                  )}
                  {order.geocodeError && (
                    <span className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>No map pin</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
