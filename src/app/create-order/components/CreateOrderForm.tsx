'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Truck,
  PackageCheck,
  Download,
  RefreshCw,
  Plus,
  Trash2,
  ChevronRight,
  CheckCircle2,
  Hash,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Clock,
  Package,
  CreditCard,
  Banknote,
  AlertTriangle,
  Search,
  X,
  ArrowLeft,
  Info,
  ShieldCheck,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { ordersService, AppDriver } from '@/lib/services/ordersService';
import { createClient } from '@/lib/supabase/client';

type BookingType = 'Delivery' | 'Collection';
type PaymentMethod = 'Card' | 'Cash' | 'Unrecorded';

interface ProductLineItem {
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  category: string;
}

interface CreateOrderFormData {
  bookingType: BookingType;
  wooOrderId: string;
  // Customer
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  // Delivery address (only for Delivery type)
  addressLine1: string;
  addressLine2: string;
  city: string;
  county: string;
  postcode: string;
  deliveryNotes: string;
  // Booking window
  bookingDate: string;
  deliveryWindowStart: string;
  deliveryWindowEnd: string;
  collectionWindowStart: string;
  collectionWindowEnd: string;
  // Driver
  driverId: string;
  // Products
  products: ProductLineItem[];
  // Payment
  paymentMethod: PaymentMethod;
  paymentAmount: string;
  // Custom fields
  eventType: string;
  powerSource: string;
  // Notes
  bookingNotes: string;
}

const DEFAULT_PRODUCTS: ProductLineItem[] = [
  { name: '', sku: '', quantity: 1, unitPrice: 0, category: 'Bouncy Castle' },
];

const PRODUCT_CATEGORIES = ['Bouncy Castle', 'Combo Castle', 'Inflatable', 'Accessory', 'Slide', 'Other'];

function generateOrderId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  return `CA-${ts}-${rand}`;
}

// ─── Zone detection helpers ───────────────────────────────────────────────────

interface DeliveryZone {
  id: string;
  name: string;
  color: string;
  polygon_geojson: { type: string; coordinates: number[][][] };
  driver_id: string | null;
  driver?: { id: string; name: string; avatar?: string; status?: string } | null;
}

/** Ray-casting point-in-polygon for GeoJSON [lng, lat] coordinates */
function pointInPolygon(lng: number, lat: number, coords: number[][][]): boolean {
  const ring = coords[0];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export default function CreateOrderForm() {
  const router = useRouter();
  const [bookingType, setBookingType] = useState<BookingType>('Delivery');
  const [wooImportId, setWooImportId] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [drivers, setDrivers] = useState<AppDriver[]>([]);
  const [driversLoading, setDriversLoading] = useState(true);

  // Zone detection state
  const [zoneCheckLoading, setZoneCheckLoading] = useState(false);
  const [matchedZone, setMatchedZone] = useState<DeliveryZone | null>(null);
  const [zoneChecked, setZoneChecked] = useState(false);
  const [activeZones, setActiveZones] = useState<DeliveryZone[]>([]);
  const [autoZoneAllocation, setAutoZoneAllocation] = useState(false);
  const [autoAssignedByZone, setAutoAssignedByZone] = useState(false);

  useEffect(() => {
    ordersService.fetchDrivers().then((data) => {
      setDrivers(data);
      setDriversLoading(false);
    });
  }, []);

  // Fetch active delivery zones once on mount
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('delivery_zones')
      .select('id, name, color, polygon_geojson, driver_id, drivers:driver_id(id, name, avatar, status)')
      .eq('is_active', true)
      .then(({ data }) => {
        if (data) {
          setActiveZones(
            data.map((z: Record<string, unknown>) => ({
              ...z,
              driver: Array.isArray(z.drivers) ? z.drivers[0] ?? null : z.drivers ?? null,
            })) as DeliveryZone[]
          );
        }
      });
    // Fetch auto_zone_allocation setting
    supabase
      .from('fleet_config')
      .select('auto_zone_allocation')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setAutoZoneAllocation(data.auto_zone_allocation ?? false);
      });
  }, []);

  const checkZoneForPostcode = useCallback(
    async (postcode: string) => {
      const cleaned = postcode.replace(/\s/g, '').toUpperCase();
      if (!cleaned || !/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/i.test(cleaned)) {
        setMatchedZone(null);
        setZoneChecked(false);
        setAutoAssignedByZone(false);
        return;
      }
      if (activeZones.length === 0) return;

      setZoneCheckLoading(true);
      setMatchedZone(null);
      setZoneChecked(false);

      try {
        const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(cleaned)}`);
        const json = await res.json();
        if (json.status !== 200 || !json.result) {
          setZoneChecked(true);
          setZoneCheckLoading(false);
          return;
        }
        const { longitude, latitude } = json.result as { longitude: number; latitude: number };
        const found = activeZones.find(
          (z) =>
            z.polygon_geojson?.coordinates?.length > 0 &&
            pointInPolygon(longitude, latitude, z.polygon_geojson.coordinates)
        );
        setMatchedZone(found ?? null);
        setZoneChecked(true);
        // Auto-assign driver if setting is enabled and zone has a driver
        if (autoZoneAllocation && found?.driver_id) {
          setValue('driverId', found.driver_id);
          setAutoAssignedByZone(true);
        } else {
          setAutoAssignedByZone(false);
        }
      } catch {
        setZoneChecked(true);
      } finally {
        setZoneCheckLoading(false);
      }
    },
    [activeZones, autoZoneAllocation]
  );

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<CreateOrderFormData>({
    defaultValues: {
      bookingType: 'Delivery',
      products: DEFAULT_PRODUCTS,
      paymentMethod: 'Unrecorded',
      paymentAmount: '',
    },
  });

  const { fields: productFields, append: appendProduct, remove: removeProduct } = useFieldArray({
    control,
    name: 'products',
  });

  const watchedProducts = watch('products');
  const watchedPaymentMethod = watch('paymentMethod');
  const watchedPostcode = watch('postcode');
  const totalValue = watchedProducts?.reduce(
    (sum, p) => sum + (Number(p.unitPrice) || 0) * (Number(p.quantity) || 0),
    0
  ) || 0;

  // Debounced postcode zone check
  useEffect(() => {
    if (bookingType !== 'Delivery') return;
    const timer = setTimeout(() => {
      if (watchedPostcode) checkZoneForPostcode(watchedPostcode);
    }, 600);
    return () => clearTimeout(timer);
  }, [watchedPostcode, bookingType, checkZoneForPostcode]);

  const handleWooImport = async () => {
    if (!wooImportId.trim()) {
      setImportError('Please enter a WooCommerce Order ID');
      return;
    }
    setImportError('');
    setImportSuccess('');
    setIsImporting(true);

    try {
      const res = await fetch(`/api/woocommerce/order/${encodeURIComponent(wooImportId.trim())}`);
      const data = await res.json();

      if (!res.ok) {
        setImportError(data.error ?? `Failed to fetch order #${wooImportId} (status ${res.status})`);
        setIsImporting(false);
        return;
      }

      setValue('wooOrderId', data.wooOrderId ?? wooImportId);
      if (data.customerName) setValue('customerName', data.customerName);
      if (data.customerEmail) setValue('customerEmail', data.customerEmail);
      if (data.customerPhone) setValue('customerPhone', data.customerPhone);
      if (data.addressLine1) setValue('addressLine1', data.addressLine1);
      if (data.addressLine2) setValue('addressLine2', data.addressLine2);
      if (data.city) setValue('city', data.city);
      if (data.county) setValue('county', data.county);
      if (data.postcode) setValue('postcode', data.postcode);
      if (data.paymentMethod) setValue('paymentMethod', data.paymentMethod as PaymentMethod);
      if (data.paymentAmount) setValue('paymentAmount', data.paymentAmount);

      if (Array.isArray(data.products) && data.products.length > 0) {
        const currentLength = productFields.length;
        for (let i = currentLength - 1; i >= 0; i--) {
          removeProduct(i);
        }
        data.products.forEach((p: ProductLineItem, i: number) => {
          if (i === 0) {
            setValue('products.0', p);
          } else {
            appendProduct(p);
          }
        });
      }

      setHasUnsavedChanges(true);
      setImportSuccess(`WooCommerce order #${data.wooOrderId ?? wooImportId} imported — ${data.products?.length ?? 0} line item(s) loaded`);
      toast.success(`Order #${data.wooOrderId ?? wooImportId} imported successfully`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unexpected error';
      setImportError(`Could not import order: ${message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const onSubmit = async (data: CreateOrderFormData) => {
    setIsSubmitting(true);
    setSubmitError('');

    try {
      const deliveryWindow = `${data.deliveryWindowStart} - ${data.deliveryWindowEnd}`;
      const collectionWindow =
        data.collectionWindowStart && data.collectionWindowEnd
          ? `${data.collectionWindowStart} - ${data.collectionWindowEnd}`
          : undefined;

      const products = data.products.map((p, idx) => ({
        id: idx + 1,
        name: p.name,
        sku: p.sku,
        quantity: Number(p.quantity),
        unitPrice: Number(p.unitPrice),
        totalPrice: Number(p.unitPrice) * Number(p.quantity),
        category: p.category,
      }));

      const customFields: Record<string, string> = {};
      if (data.eventType) customFields.eventType = data.eventType;
      if (data.powerSource) customFields.powerSource = data.powerSource;

      const result = await ordersService.createOrder({
        id: generateOrderId(),
        wooOrderId: data.wooOrderId || '',
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        customerPhone: data.customerPhone,
        bookingType: data.bookingType,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2,
        city: data.city,
        county: data.county,
        postcode: data.postcode,
        deliveryNotes: data.deliveryNotes,
        driverId: data.driverId || undefined,
        bookingDate: data.bookingDate,
        deliveryWindow: deliveryWindow,
        collectionWindow: collectionWindow,
        paymentMethod: data.paymentMethod,
        paymentAmount: data.paymentAmount ? parseFloat(data.paymentAmount) : totalValue,
        products,
        notes: data.bookingNotes || undefined,
        customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
      });

      toast.success('Booking created successfully');
      router.push('/orders-dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unexpected error';
      setSubmitError(`Could not create booking: ${message}`);
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (isDirty || hasUnsavedChanges) {
      setCancelModalOpen(true);
    } else {
      router.push('/orders-dashboard');
    }
  };

  return (
    <div className="max-w-4xl animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs mb-5" style={{ color: 'hsl(var(--muted-foreground))' }}>
        <button
          onClick={handleCancel}
          className="hover:underline flex items-center gap-1"
        >
          <ArrowLeft size={12} />
          Orders Dashboard
        </button>
        <ChevronRight size={12} />
        <span style={{ color: 'hsl(var(--foreground))' }}>New Booking</span>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>

        {/* ─── SECTION 1: Booking Type ─── */}
        <div className="card p-6">
          <h2 className="text-base font-semibold mb-1" style={{ color: 'hsl(var(--foreground))' }}>
            Booking Type
          </h2>
          <p className="text-xs mb-5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Choose whether this is a delivery to the customer&apos;s address or a collection from the customer&apos;s address
          </p>

          <div className="grid grid-cols-2 gap-4 max-w-md">
            {(['Delivery', 'Collection'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setBookingType(type);
                  setValue('bookingType', type);
                  setHasUnsavedChanges(true);
                }}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all duration-150 active:scale-95"
                style={{
                  borderColor: bookingType === type ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                  backgroundColor: bookingType === type ? 'hsl(var(--primary) / 0.06)' : 'hsl(var(--card))',
                }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: bookingType === type
                      ? 'hsl(var(--primary) / 0.12)'
                      : 'hsl(var(--secondary))',
                  }}
                >
                  {type === 'Delivery' ? (
                    <Truck size={22} style={{ color: bookingType === type ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }} />
                  ) : (
                    <PackageCheck size={22} style={{ color: bookingType === type ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }} />
                  )}
                </div>
                <div className="text-center">
                  <p
                    className="text-sm font-semibold"
                    style={{ color: bookingType === type ? 'hsl(var(--primary))' : 'hsl(var(--foreground))' }}
                  >
                    {type}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {type === 'Delivery' ? 'Deliver to customer' : 'Collect from customer'}
                  </p>
                </div>
                {bookingType === type && (
                  <CheckCircle2 size={16} style={{ color: 'hsl(var(--primary))' }} />
                )}
              </button>
            ))}
          </div>
          <input type="hidden" {...register('bookingType')} value={bookingType} />
        </div>

        {/* ─── SECTION 2: WooCommerce Import ─── */}
        <div className="card p-6">
          <div className="flex items-start gap-3 mb-4">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}
            >
              <Download size={16} style={{ color: 'hsl(var(--primary))' }} />
            </div>
            <div>
              <h2 className="text-base font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                Import from WooCommerce
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Enter a WooCommerce Order ID to automatically populate customer details, address, and products
              </p>
            </div>
          </div>

          <div className="flex gap-2 max-w-md">
            <div className="relative flex-1">
              <Hash
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: 'hsl(var(--muted-foreground))' }}
              />
              <input
                type="text"
                placeholder="e.g. 8850"
                value={wooImportId}
                onChange={(e) => { setWooImportId(e.target.value); setImportError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleWooImport())}
                className={`input-base pl-9 ${importError ? 'input-error' : ''}`}
              />
            </div>
            <button
              type="button"
              onClick={handleWooImport}
              disabled={isImporting}
              className="btn-primary shrink-0"
            >
              {isImporting ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <Search size={14} />
                  Import Order
                </>
              )}
            </button>
          </div>

          {importError && (
            <div
              className="flex items-start gap-2 mt-3 p-3 rounded-lg border text-xs"
              style={{
                borderColor: 'hsl(var(--destructive) / 0.25)',
                backgroundColor: 'hsl(var(--destructive) / 0.05)',
                color: 'hsl(var(--destructive))',
              }}
            >
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              {importError}
            </div>
          )}

          {importSuccess && (
            <div
              className="flex items-start gap-2 mt-3 p-3 rounded-lg border text-xs"
              style={{
                borderColor: 'hsl(var(--primary) / 0.25)',
                backgroundColor: 'hsl(var(--primary) / 0.05)',
                color: 'hsl(var(--primary))',
              }}
            >
              <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
              {importSuccess}
            </div>
          )}

          <div
            className="flex items-center gap-2 mt-3 text-xs p-3 rounded-lg border"
            style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--secondary) / 0.4)' }}
          >
            <Info size={12} style={{ color: 'hsl(var(--primary))' }} />
            <span style={{ color: 'hsl(var(--muted-foreground))' }}>
              Enter any WooCommerce order ID to auto-populate customer, address, and product line items from your store
            </span>
          </div>

          {/* WooCommerce Order ID field (manual) */}
          <div className="mt-4 max-w-md">
            <label htmlFor="wooOrderId" className="label">
              WooCommerce Order ID <span className="font-normal" style={{ color: 'hsl(var(--muted-foreground))' }}>(optional)</span>
            </label>
            <p className="helper-text">Link this booking to a WooCommerce order for reference</p>
            <div className="relative mt-1">
              <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} />
              <input
                id="wooOrderId"
                type="text"
                placeholder="e.g. 8850"
                className="input-base pl-9"
                {...register('wooOrderId')}
              />
            </div>
          </div>
        </div>

        {/* ─── SECTION 3: Customer Details ─── */}
        <div className="card p-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
            <User size={16} style={{ color: 'hsl(var(--primary))' }} />
            Customer Details
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="customerName" className="label">
                Full Name <span style={{ color: 'hsl(var(--destructive))' }}>*</span>
              </label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} />
                <input
                  id="customerName"
                  type="text"
                  placeholder="e.g. Rachel Thornton"
                  className={`input-base pl-9 ${errors.customerName ? 'input-error' : ''}`}
                  {...register('customerName', { required: 'Customer name is required' })}
                />
              </div>
              {errors.customerName && <p className="error-text">{errors.customerName.message}</p>}
            </div>

            <div>
              <label htmlFor="customerEmail" className="label">
                Email Address <span style={{ color: 'hsl(var(--destructive))' }}>*</span>
              </label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} />
                <input
                  id="customerEmail"
                  type="email"
                  placeholder="customer@example.co.uk"
                  className={`input-base pl-9 ${errors.customerEmail ? 'input-error' : ''}`}
                  {...register('customerEmail', {
                    required: 'Email address is required',
                    pattern: {
                      value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                      message: 'Enter a valid email address',
                    },
                  })}
                />
              </div>
              {errors.customerEmail && <p className="error-text">{errors.customerEmail.message}</p>}
            </div>

            <div>
              <label htmlFor="customerPhone" className="label">
                Phone Number <span style={{ color: 'hsl(var(--destructive))' }}>*</span>
              </label>
              <div className="relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} />
                <input
                  id="customerPhone"
                  type="tel"
                  placeholder="e.g. 07700 123456"
                  className={`input-base pl-9 ${errors.customerPhone ? 'input-error' : ''}`}
                  {...register('customerPhone', {
                    required: 'Phone number is required',
                    pattern: {
                      value: /^[\d\s+()-]{10,15}$/,
                      message: 'Enter a valid UK phone number',
                    },
                  })}
                />
              </div>
              {errors.customerPhone && <p className="error-text">{errors.customerPhone.message}</p>}
            </div>
          </div>
        </div>

        {/* ─── SECTION 4: Delivery Address (Delivery only) ─── */}
        {bookingType === 'Delivery' && (
          <div className="card p-6 animate-fade-in">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
              <MapPin size={16} style={{ color: 'hsl(var(--primary))' }} />
              Delivery Address
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="addressLine1" className="label">
                  Address Line 1 <span style={{ color: 'hsl(var(--destructive))' }}>*</span>
                </label>
                <input
                  id="addressLine1"
                  type="text"
                  placeholder="House number and street name"
                  className={`input-base ${errors.addressLine1 ? 'input-error' : ''}`}
                  {...register('addressLine1', {
                    required: bookingType === 'Delivery' ? 'Address line 1 is required for delivery bookings' : false,
                  })}
                />
                {errors.addressLine1 && <p className="error-text">{errors.addressLine1.message}</p>}
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="addressLine2" className="label">
                  Address Line 2 <span className="font-normal" style={{ color: 'hsl(var(--muted-foreground))' }}>(optional)</span>
                </label>
                <input
                  id="addressLine2"
                  type="text"
                  placeholder="Flat, apartment, suite, etc."
                  className="input-base"
                  {...register('addressLine2')}
                />
              </div>

              <div>
                <label htmlFor="city" className="label">
                  Town / City <span style={{ color: 'hsl(var(--destructive))' }}>*</span>
                </label>
                <input
                  id="city"
                  type="text"
                  placeholder="e.g. Leicester"
                  className={`input-base ${errors.city ? 'input-error' : ''}`}
                  {...register('city', {
                    required: bookingType === 'Delivery' ? 'Town or city is required' : false,
                  })}
                />
                {errors.city && <p className="error-text">{errors.city.message}</p>}
              </div>

              <div>
                <label htmlFor="county" className="label">
                  County
                </label>
                <input
                  id="county"
                  type="text"
                  placeholder="e.g. Leicestershire"
                  className="input-base"
                  {...register('county')}
                />
              </div>

              <div>
                <label htmlFor="postcode" className="label">
                  Postcode <span style={{ color: 'hsl(var(--destructive))' }}>*</span>
                </label>
                <input
                  id="postcode"
                  type="text"
                  placeholder="e.g. LE4 7RN"
                  className={`input-base uppercase ${errors.postcode ? 'input-error' : ''}`}
                  {...register('postcode', {
                    required: bookingType === 'Delivery' ? 'Postcode is required' : false,
                    pattern: {
                      value: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i,
                      message: 'Enter a valid UK postcode',
                    },
                  })}
                />
                {errors.postcode && <p className="error-text">{errors.postcode.message}</p>}
              </div>

              {/* ─── Zone Detection Preview ─── */}
              {bookingType === 'Delivery' && (zoneCheckLoading || zoneChecked) && (
                <div className="sm:col-span-2">
                  {zoneCheckLoading ? (
                    <div
                      className="flex items-center gap-2 p-3 rounded-lg border text-xs"
                      style={{
                        borderColor: 'hsl(var(--border))',
                        backgroundColor: 'hsl(var(--secondary) / 0.4)',
                        color: 'hsl(var(--muted-foreground))',
                      }}
                    >
                      <RefreshCw size={13} className="animate-spin shrink-0" />
                      Checking delivery zone…
                    </div>
                  ) : matchedZone ? (
                    <div
                      className="flex items-start gap-3 p-3 rounded-lg border text-xs"
                      style={{
                        borderColor: `${matchedZone.color}55`,
                        backgroundColor: `${matchedZone.color}12`,
                      }}
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5"
                        style={{ backgroundColor: matchedZone.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <ShieldCheck size={13} style={{ color: matchedZone.color }} />
                          <span className="font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                            {matchedZone.name}
                          </span>
                          <span style={{ color: 'hsl(var(--muted-foreground))' }}>— address is within this delivery zone</span>
                        </div>
                        {matchedZone.driver ? (
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                              style={{
                                backgroundColor: `${matchedZone.color}25`,
                                color: matchedZone.color,
                              }}
                            >
                              {matchedZone.driver.avatar ?? matchedZone.driver.name?.charAt(0) ?? '?'}
                            </div>
                            <span style={{ color: 'hsl(var(--foreground))' }} className="font-medium">
                              {matchedZone.driver.name}
                            </span>
                            {matchedZone.driver.status && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                                style={{
                                  backgroundColor: matchedZone.driver.status === 'Available' ?'hsl(142 76% 36% / 0.12)' :'hsl(var(--secondary))',
                                  color: matchedZone.driver.status === 'Available' ?'hsl(142 76% 36%)' :'hsl(var(--muted-foreground))',
                                }}
                              >
                                {matchedZone.driver.status}
                              </span>
                            )}
                            <span style={{ color: 'hsl(var(--muted-foreground))' }}>is the assigned zone driver</span>
                            {autoAssignedByZone && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                style={{
                                  backgroundColor: 'hsl(142 76% 36% / 0.15)',
                                  color: 'hsl(142 76% 36%)',
                                }}
                              >
                                ✓ Auto-assigned
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            No driver assigned to this zone yet
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div
                      className="flex items-center gap-2 p-3 rounded-lg border text-xs"
                      style={{
                        borderColor: 'hsl(var(--border))',
                        backgroundColor: 'hsl(var(--secondary) / 0.3)',
                        color: 'hsl(var(--muted-foreground))',
                      }}
                    >
                      <MapPin size={13} className="shrink-0" />
                      Address is outside all active delivery zones — driver can be assigned manually below
                    </div>
                  )}
                </div>
              )}

              <div className="sm:col-span-2">
                <label htmlFor="deliveryNotes" className="label">
                  Access &amp; Delivery Notes <span className="font-normal" style={{ color: 'hsl(var(--muted-foreground))' }}>(optional)</span>
                </label>
                <p className="helper-text">Gate codes, parking instructions, setup location preferences</p>
                <textarea
                  id="deliveryNotes"
                  rows={2}
                  placeholder="e.g. Side gate is unlocked. Please set up in rear garden."
                  className="input-base resize-none mt-1"
                  {...register('deliveryNotes')}
                />
              </div>
            </div>
          </div>
        )}

        {/* ─── SECTION 5: Booking Date & Windows ─── */}
        <div className="card p-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
            <Calendar size={16} style={{ color: 'hsl(var(--primary))' }} />
            Booking Date &amp; Time Windows
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label htmlFor="bookingDate" className="label">
                Booking Date <span style={{ color: 'hsl(var(--destructive))' }}>*</span>
              </label>
              <input
                id="bookingDate"
                type="date"
                className={`input-base ${errors.bookingDate ? 'input-error' : ''}`}
                {...register('bookingDate', { required: 'Booking date is required' })}
              />
              {errors.bookingDate && <p className="error-text">{errors.bookingDate.message}</p>}
            </div>

            <div>
              <label htmlFor="deliveryWindowStart" className="label">
                {bookingType === 'Delivery' ? 'Delivery Window Start' : 'Collection Window Start'} <span style={{ color: 'hsl(var(--destructive))' }}>*</span>
              </label>
              <div className="relative">
                <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} />
                <input
                  id="deliveryWindowStart"
                  type="time"
                  className={`input-base pl-9 ${errors.deliveryWindowStart ? 'input-error' : ''}`}
                  {...register('deliveryWindowStart', { required: 'Start time is required' })}
                />
              </div>
              {errors.deliveryWindowStart && <p className="error-text">{errors.deliveryWindowStart.message}</p>}
            </div>

            <div>
              <label htmlFor="deliveryWindowEnd" className="label">
                {bookingType === 'Delivery' ? 'Delivery Window End' : 'Collection Window End'} <span style={{ color: 'hsl(var(--destructive))' }}>*</span>
              </label>
              <div className="relative">
                <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} />
                <input
                  id="deliveryWindowEnd"
                  type="time"
                  className={`input-base pl-9 ${errors.deliveryWindowEnd ? 'input-error' : ''}`}
                  {...register('deliveryWindowEnd', { required: 'End time is required' })}
                />
              </div>
              {errors.deliveryWindowEnd && <p className="error-text">{errors.deliveryWindowEnd.message}</p>}
            </div>

            {bookingType === 'Delivery' && (
              <>
                <div>
                  <label htmlFor="collectionWindowStart" className="label">
                    Collection Window Start <span className="font-normal" style={{ color: 'hsl(var(--muted-foreground))' }}>(optional)</span>
                  </label>
                  <div className="relative">
                    <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} />
                    <input
                      id="collectionWindowStart"
                      type="time"
                      className="input-base pl-9"
                      {...register('collectionWindowStart')}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="collectionWindowEnd" className="label">
                    Collection Window End <span className="font-normal" style={{ color: 'hsl(var(--muted-foreground))' }}>(optional)</span>
                  </label>
                  <div className="relative">
                    <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} />
                    <input
                      id="collectionWindowEnd"
                      type="time"
                      className="input-base pl-9"
                      {...register('collectionWindowEnd')}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ─── SECTION 6: Products / Equipment ─── */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
              <Package size={16} style={{ color: 'hsl(var(--primary))' }} />
              Equipment / Products
            </h2>
            <button
              type="button"
              onClick={() => appendProduct({ name: '', sku: '', quantity: 1, unitPrice: 0, category: 'Bouncy Castle' })}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              <Plus size={12} />
              Add Item
            </button>
          </div>

          <div className="space-y-3">
            {productFields.map((field, index) => (
              <div
                key={field.id}
                className="p-4 rounded-xl border"
                style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--secondary) / 0.3)' }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: 'hsl(var(--muted-foreground))' }}
                  >
                    Item {index + 1}
                  </span>
                  {productFields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeProduct(index)}
                      className="p-1 rounded hover:bg-red-50 transition-colors"
                      aria-label={`Remove item ${index + 1}`}
                    >
                      <X size={14} style={{ color: 'hsl(var(--destructive))' }} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="label text-xs">
                      Product Name <span style={{ color: 'hsl(var(--destructive))' }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Frozen Elsa Castle — Large"
                      className={`input-base text-sm ${errors.products?.[index]?.name ? 'input-error' : ''}`}
                      {...register(`products.${index}.name`, { required: 'Product name is required' })}
                    />
                    {errors.products?.[index]?.name && (
                      <p className="error-text">{errors.products[index]?.name?.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="label text-xs">SKU</label>
                    <input
                      type="text"
                      placeholder="e.g. BC-ELSA-LG"
                      className="input-base text-sm font-mono"
                      {...register(`products.${index}.sku`)}
                    />
                  </div>

                  <div>
                    <label className="label text-xs">Category</label>
                    <select
                      className="input-base text-sm"
                      {...register(`products.${index}.category`)}
                    >
                      {PRODUCT_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label text-xs">Qty <span style={{ color: 'hsl(var(--destructive))' }}>*</span></label>
                    <input
                      type="number"
                      min="1"
                      className={`input-base text-sm tabular-nums ${errors.products?.[index]?.quantity ? 'input-error' : ''}`}
                      {...register(`products.${index}.quantity`, {
                        required: 'Quantity is required',
                        min: { value: 1, message: 'Min 1' },
                        valueAsNumber: true,
                      })}
                    />
                  </div>

                  <div>
                    <label className="label text-xs">Unit Price (£)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        £
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className="input-base text-sm pl-7 tabular-nums"
                        {...register(`products.${index}.unitPrice`, { valueAsNumber: true })}
                      />
                    </div>
                  </div>

                  <div className="flex items-end">
                    <div
                      className="w-full p-2.5 rounded-lg border text-sm text-right font-semibold tabular-nums"
                      style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
                    >
                      £{((watchedProducts?.[index]?.unitPrice || 0) * (watchedProducts?.[index]?.quantity || 0)).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Order total */}
          <div
            className="flex items-center justify-between mt-4 pt-4 border-t"
            style={{ borderColor: 'hsl(var(--border))' }}
          >
            <span className="text-sm font-semibold">Order Total</span>
            <span className="text-xl font-bold tabular-nums" style={{ color: 'hsl(var(--primary))' }}>
              £{totalValue.toFixed(2)}
            </span>
          </div>
        </div>

        {/* ─── SECTION 7: Driver Assignment ─── */}
        <div className="card p-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
            <Truck size={16} style={{ color: 'hsl(var(--primary))' }} />
            Driver Assignment <span className="text-sm font-normal" style={{ color: 'hsl(var(--muted-foreground))' }}>(optional)</span>
          </h2>
          <p className="text-xs mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Assign a driver now or leave unassigned to assign later from the Orders Dashboard
          </p>

          {driversLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-2xl">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="p-4 rounded-xl border-2 animate-pulse"
                  style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--secondary) / 0.3)', height: '80px' }}
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-2xl">
              {/* Unassigned option */}
              <label className="cursor-pointer">
                <input
                  type="radio"
                  value=""
                  {...register('driverId')}
                  className="sr-only"
                />
                <div
                  className="p-4 rounded-xl border-2 text-center transition-all duration-150"
                  style={{
                    borderColor: 'hsl(var(--border))',
                    backgroundColor: 'hsl(var(--secondary) / 0.3)',
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2"
                    style={{ backgroundColor: 'hsl(var(--secondary))' }}
                  >
                    <User size={18} style={{ color: 'hsl(var(--muted-foreground))' }} />
                  </div>
                  <p className="text-xs font-medium">Unassigned</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Assign later
                  </p>
                </div>
              </label>

              {drivers.filter((d) => d.status !== 'Off Duty').map((driver) => (
                <label key={driver.id} className="cursor-pointer">
                  <input
                    type="radio"
                    value={driver.id}
                    {...register('driverId')}
                    className="sr-only"
                  />
                  <div
                    className="p-4 rounded-xl border-2 transition-all duration-150"
                    style={{
                      borderColor: watch('driverId') === driver.id ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                      backgroundColor: watch('driverId') === driver.id ? 'hsl(var(--primary) / 0.05)' : 'hsl(var(--card))',
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{
                          backgroundColor: watch('driverId') === driver.id
                            ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--secondary))',
                          color: watch('driverId') === driver.id
                            ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                        }}
                      >
                        {driver.avatar}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{driver.name}</p>
                        <p className="text-[10px] truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          {driver.vehicle}
                        </p>
                        <span
                          className="text-[9px] font-semibold"
                          style={{
                            color: driver.status === 'Available' ? 'hsl(142 69% 30%)' : 'hsl(24 80% 38%)',
                          }}
                        >
                          {driver.status}
                        </span>
                      </div>
                      {watch('driverId') === driver.id && (
                        <CheckCircle2 size={14} className="ml-auto shrink-0" style={{ color: 'hsl(var(--primary))' }} />
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* ─── SECTION 8: Payment ─── */}
        <div className="card p-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
            <CreditCard size={16} style={{ color: 'hsl(var(--primary))' }} />
            Payment
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            {(['Card', 'Cash', 'Unrecorded'] as const).map((method) => (
              <label key={method} className="cursor-pointer">
                <input
                  type="radio"
                  value={method}
                  {...register('paymentMethod')}
                  className="sr-only"
                />
                <div
                  className="flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-150"
                  style={{
                    borderColor: watchedPaymentMethod === method ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                    backgroundColor: watchedPaymentMethod === method ? 'hsl(var(--primary) / 0.05)' : 'hsl(var(--card))',
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: watchedPaymentMethod === method ? 'hsl(var(--primary) / 0.12)' : 'hsl(var(--secondary))',
                    }}
                  >
                    {method === 'Card' ? (
                      <CreditCard size={16} style={{ color: watchedPaymentMethod === method ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }} />
                    ) : method === 'Cash' ? (
                      <Banknote size={16} style={{ color: watchedPaymentMethod === method ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }} />
                    ) : (
                      <Clock size={16} style={{ color: watchedPaymentMethod === method ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }} />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{method}</p>
                    <p className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {method === 'Card' ? 'Card / online' : method === 'Cash' ? 'Cash on delivery' : 'Record later'}
                    </p>
                  </div>
                  {watchedPaymentMethod === method && (
                    <CheckCircle2 size={14} className="ml-auto shrink-0" style={{ color: 'hsl(var(--primary))' }} />
                  )}
                </div>
              </label>
            ))}
          </div>

          {watchedPaymentMethod !== 'Unrecorded' && (
            <div className="max-w-xs">
              <label htmlFor="paymentAmount" className="label">
                Amount (£)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  £
                </span>
                <input
                  id="paymentAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={totalValue > 0 ? totalValue.toFixed(2) : '0.00'}
                  className={`input-base pl-8 font-mono ${errors.paymentAmount ? 'input-error' : ''}`}
                  {...register('paymentAmount', {
                    validate: (v) => {
                      if (watchedPaymentMethod !== 'Unrecorded' && v && isNaN(parseFloat(v))) {
                        return 'Enter a valid amount';
                      }
                      return true;
                    },
                  })}
                />
              </div>
              {errors.paymentAmount && <p className="error-text">{errors.paymentAmount.message}</p>}
              {totalValue > 0 && (
                <p className="helper-text">Order total: £{totalValue.toFixed(2)}</p>
              )}
            </div>
          )}
        </div>

        {/* ─── SECTION 9: Custom Fields ─── */}
        <div className="card p-6">
          <h2 className="text-base font-semibold mb-1" style={{ color: 'hsl(var(--foreground))' }}>
            Custom Fields
          </h2>
          <p className="text-xs mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Additional information imported from WooCommerce or entered manually
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="eventType" className="label">Event Type</label>
              <p className="helper-text">e.g. Birthday Party, Garden Party, School Event</p>
              <select id="eventType" className="input-base mt-1" {...register('eventType')}>
                <option value="">Select event type…</option>
                <option>Birthday Party</option>
                <option>Garden Party</option>
                <option>School Event</option>
                <option>Corporate Event</option>
                <option>Community Event</option>
                <option>Wedding / Celebration</option>
                <option>Other</option>
              </select>
            </div>

            <div>
              <label htmlFor="powerSource" className="label">Power Source</label>
              <p className="helper-text">How the blower will be powered on site</p>
              <select id="powerSource" className="input-base mt-1" {...register('powerSource')}>
                <option value="">Select power source…</option>
                <option>Mains</option>
                <option>Generator</option>
                <option>Not Required</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="bookingNotes" className="label">
                Internal Booking Notes <span className="font-normal" style={{ color: 'hsl(var(--muted-foreground))' }}>(optional)</span>
              </label>
              <p className="helper-text">Notes visible to admin and drivers — not shown to the customer</p>
              <textarea
                id="bookingNotes"
                rows={3}
                placeholder="e.g. Customer requested early setup. Confirm with driver 24hrs before."
                className="input-base resize-none mt-1"
                {...register('bookingNotes')}
              />
            </div>
          </div>
        </div>

        {/* Submit error banner */}
        {submitError && (
          <div
            className="flex items-start gap-2 p-4 rounded-xl border text-sm"
            style={{
              borderColor: 'hsl(var(--destructive) / 0.25)',
              backgroundColor: 'hsl(var(--destructive) / 0.05)',
              color: 'hsl(var(--destructive))',
            }}
          >
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            {submitError}
          </div>
        )}

        {/* ─── Sticky footer ─── */}
        <div
          className="sticky bottom-0 z-10 flex items-center justify-between gap-4 p-4 rounded-xl border shadow-lg"
          style={{
            backgroundColor: 'hsl(var(--card))',
            borderColor: 'hsl(var(--border))',
          }}
        >
          <div className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            <span className="font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
              {bookingType}
            </span>{' '}
            booking · Total{' '}
            <span className="font-semibold font-mono" style={{ color: 'hsl(var(--primary))' }}>
              £{totalValue.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Creating Booking…
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  Create Booking
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Unsaved changes modal */}
      <Modal
        open={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Discard unsaved changes?"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            You have unsaved changes to this booking form. If you leave now, all entered information will be lost.
          </p>
          <div className="flex gap-2 justify-end">
            <button className="btn-secondary" onClick={() => setCancelModalOpen(false)}>
              Keep Editing
            </button>
            <button
              className="btn-danger"
              onClick={() => router.push('/orders-dashboard')}
            >
              <Trash2 size={14} />
              Discard &amp; Leave
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}