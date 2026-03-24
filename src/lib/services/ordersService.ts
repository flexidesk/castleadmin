'use client';

import { createClient } from '@/lib/supabase/client';

// ─── DB Row Types (snake_case) ────────────────────────────────────────────────

export interface DbOrder {
  id: string;
  woo_order_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  booking_type: 'Delivery' | 'Collection';
  status: string;
  delivery_address_line1: string | null;
  delivery_address_line2: string | null;
  delivery_address_city: string | null;
  delivery_address_county: string | null;
  delivery_address_postcode: string | null;
  delivery_address_notes: string | null;
  driver_id: string | null;
  booking_date: string;
  delivery_window: string;
  collection_window: string | null;
  payment_status: string;
  payment_method: string;
  payment_amount: number;
  payment_recorded_at: string | null;
  payment_recorded_by: string | null;
  payment_notes: string | null;
  products: any[];
  pod: any | null;
  notes: string | null;
  custom_fields: Record<string, string> | null;
  created_at: string;
  updated_at: string;
  drivers?: DbDriver | null;
}

export interface DbDriver {
  id: string;
  name: string;
  phone: string;
  vehicle: string;
  plate: string;
  status: 'Available' | 'On Route' | 'Off Duty';
  avatar: string;
  created_at: string;
  updated_at: string;
}

// ─── App Types (camelCase) ────────────────────────────────────────────────────

export interface AppOrder {
  id: string;
  wooOrderId: string;
  customer: { name: string; email: string; phone: string };
  type: 'Delivery' | 'Collection';
  status: string;
  deliveryAddress?: {
    line1: string;
    line2?: string;
    city: string;
    county: string;
    postcode: string;
    notes?: string;
  };
  driver?: AppDriver;
  bookingDate: string;
  deliveryWindow: string;
  collectionWindow?: string;
  payment: {
    status: string;
    method: string;
    amount: number;
    recordedAt?: string;
    recordedBy?: string;
    notes?: string;
  };
  products: any[];
  pod?: any;
  notes?: string;
  customFields?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface AppDriver {
  id: string;
  name: string;
  phone: string;
  vehicle: string;
  plate: string;
  status: 'Available' | 'On Route' | 'Off Duty';
  avatar: string;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function mapDbOrderToApp(row: DbOrder): AppOrder {
  return {
    id: row.id,
    wooOrderId: row.woo_order_id,
    customer: {
      name: row.customer_name,
      email: row.customer_email,
      phone: row.customer_phone,
    },
    type: row.booking_type,
    status: row.status,
    deliveryAddress:
      row.delivery_address_line1
        ? {
            line1: row.delivery_address_line1,
            line2: row.delivery_address_line2 ?? undefined,
            city: row.delivery_address_city ?? '',
            county: row.delivery_address_county ?? '',
            postcode: row.delivery_address_postcode ?? '',
            notes: row.delivery_address_notes ?? undefined,
          }
        : undefined,
    driver: row.drivers ? mapDbDriverToApp(row.drivers) : undefined,
    bookingDate: row.booking_date,
    deliveryWindow: row.delivery_window,
    collectionWindow: row.collection_window ?? undefined,
    payment: {
      status: row.payment_status,
      method: row.payment_method,
      amount: row.payment_amount,
      recordedAt: row.payment_recorded_at ?? undefined,
      recordedBy: row.payment_recorded_by ?? undefined,
      notes: row.payment_notes ?? undefined,
    },
    products: row.products ?? [],
    pod: row.pod ?? undefined,
    notes: row.notes ?? undefined,
    customFields: row.custom_fields ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapDbDriverToApp(row: DbDriver): AppDriver {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    vehicle: row.vehicle,
    plate: row.plate,
    status: row.status,
    avatar: row.avatar,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const ordersService = {
  async fetchAllOrders(): Promise<AppOrder[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('orders')
      .select('*, drivers(*)')
      .order('booking_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('fetchAllOrders error:', error.message);
      return [];
    }
    return (data as DbOrder[]).map(mapDbOrderToApp);
  },

  async fetchDrivers(): Promise<AppDriver[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('fetchDrivers error:', error.message);
      return [];
    }
    return (data as DbDriver[]).map(mapDbDriverToApp);
  },

  async deleteOrder(id: string): Promise<boolean> {
    const supabase = createClient();
    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (error) {
      console.error('deleteOrder error:', error.message);
      return false;
    }
    return true;
  },

  async fetchOrderById(id: string): Promise<AppOrder | null> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('orders')
      .select('*, drivers(*)')
      .eq('id', id)
      .single();

    if (error) {
      console.error('fetchOrderById error:', error.message);
      return null;
    }
    return mapDbOrderToApp(data as DbOrder);
  },

  async updateOrderStatus(id: string, status: string): Promise<boolean> {
    const supabase = createClient();
    const { error } = await supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      console.error('updateOrderStatus error:', error.message);
      return false;
    }
    return true;
  },

  async assignDriver(orderId: string, driverId: string): Promise<boolean> {
    const supabase = createClient();
    const { error } = await supabase
      .from('orders')
      .update({ driver_id: driverId, updated_at: new Date().toISOString() })
      .eq('id', orderId);
    if (error) {
      console.error('assignDriver error:', error.message);
      return false;
    }
    return true;
  },

  async createOrder(payload: {
    id: string;
    wooOrderId: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    bookingType: 'Delivery' | 'Collection';
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    county?: string;
    postcode?: string;
    deliveryNotes?: string;
    driverId?: string;
    bookingDate: string;
    deliveryWindow: string;
    collectionWindow?: string;
    paymentMethod: string;
    paymentAmount: number;
    products: any[];
    notes?: string;
    customFields?: Record<string, string>;
  }): Promise<{ id: string } | null> {
    const supabase = createClient();

    const paymentStatus =
      payload.paymentMethod === 'Unrecorded' ? 'Unpaid' : 'Paid';

    const row: Record<string, any> = {
      id: payload.id,
      woo_order_id: payload.wooOrderId || '',
      customer_name: payload.customerName,
      customer_email: payload.customerEmail,
      customer_phone: payload.customerPhone,
      booking_type: payload.bookingType,
      status: 'Booking Accepted',
      booking_date: payload.bookingDate,
      delivery_window: payload.deliveryWindow,
      collection_window: payload.collectionWindow || null,
      payment_method: payload.paymentMethod,
      payment_status: paymentStatus,
      payment_amount: payload.paymentAmount || 0,
      products: payload.products,
      notes: payload.notes || null,
      custom_fields: payload.customFields || {},
      driver_id: payload.driverId || null,
    };

    if (payload.bookingType === 'Delivery') {
      row.delivery_address_line1 = payload.addressLine1 || null;
      row.delivery_address_line2 = payload.addressLine2 || null;
      row.delivery_address_city = payload.city || null;
      row.delivery_address_county = payload.county || null;
      row.delivery_address_postcode = payload.postcode || null;
      row.delivery_address_notes = payload.deliveryNotes || null;
    }

    const { data, error } = await supabase
      .from('orders')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      console.error('createOrder error:', error.message);
      throw new Error(error.message);
    }
    return data as { id: string };
  },

  subscribeToOrder(
    id: string,
    onUpdate: (order: AppOrder) => void
  ) {
    const supabase = createClient();
    const channel = supabase
      .channel(`order_realtime_${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` },
        async () => {
          const { data } = await supabase
            .from('orders')
            .select('*, drivers(*)')
            .eq('id', id)
            .single();
          if (data) onUpdate(mapDbOrderToApp(data as DbOrder));
        }
      )
      .subscribe();

    return channel;
  },

  subscribeToOrders(
    onInsert: (order: AppOrder) => void,
    onUpdate: (order: AppOrder) => void,
    onDelete: (id: string) => void
  ) {
    const supabase = createClient();
    const channel = supabase
      .channel('orders_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        async (payload) => {
          // Re-fetch with driver join
          const { data } = await supabase
            .from('orders')
            .select('*, drivers(*)')
            .eq('id', payload.new.id)
            .single();
          if (data) onInsert(mapDbOrderToApp(data as DbOrder));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        async (payload) => {
          const { data } = await supabase
            .from('orders')
            .select('*, drivers(*)')
            .eq('id', payload.new.id)
            .single();
          if (data) onUpdate(mapDbOrderToApp(data as DbOrder));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'orders' },
        (payload) => {
          onDelete(payload.old.id as string);
        }
      )
      .subscribe();

    return channel;
  },

  subscribeToDrivers(onChange: (drivers: AppDriver[]) => void) {
    const supabase = createClient();
    const channel = supabase
      .channel('drivers_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drivers' },
        async () => {
          const drivers = await ordersService.fetchDrivers();
          onChange(drivers);
        }
      )
      .subscribe();

    return channel;
  },
};
