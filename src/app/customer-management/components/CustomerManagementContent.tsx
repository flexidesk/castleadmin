'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Users, Plus, Search, Edit2, UserX, UserCheck,
  Phone, Mail, Star, ShoppingBag, DollarSign,
  X, Loader2, RefreshCw, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

interface CustomerStats {
  customer_id: string;
  order_count: number;
  lifetime_spend: number;
  avg_rating: number;
}

interface CustomerFormData {
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
}

const EMPTY_FORM: CustomerFormData = {
  name: '',
  email: '',
  phone: '',
  address: '',
  notes: '',
};

// ─── Star Rating ──────────────────────────────────────────────────────────────

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={12}
          className={s <= Math.round(rating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}
        />
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CustomerManagementContent() {
  const supabase = createClient();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stats, setStats] = useState<Record<string, CustomerStats>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState<Customer | null>(null);

  // ─── Fetch Customers ────────────────────────────────────────────────────────

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, email, phone, address, notes, is_active, created_at')
      .order('name');
    if (error) {
      toast.error('Failed to load customers: ' + error.message);
    } else {
      setCustomers(data ?? []);
    }
    setLoading(false);
  }, [supabase]);

  // ─── Fetch Stats from orders ────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('customer_name, customer_phone, total_amount, customer_rating');
    if (error || !data) return;

    // Group by phone as a proxy for customer identity
    const map: Record<string, { order_count: number; lifetime_spend: number; ratings: number[] }> = {};
    data.forEach((row) => {
      const key = row.customer_phone ?? row.customer_name;
      if (!key) return;
      if (!map[key]) map[key] = { order_count: 0, lifetime_spend: 0, ratings: [] };
      map[key].order_count++;
      map[key].lifetime_spend += Number(row.total_amount ?? 0);
      if (row.customer_rating != null) map[key].ratings.push(Number(row.customer_rating));
    });

    // Match stats to customers by phone
    const statsMap: Record<string, CustomerStats> = {};
    customers.forEach((c) => {
      const entry = map[c.phone];
      if (entry) {
        statsMap[c.id] = {
          customer_id: c.id,
          order_count: entry.order_count,
          lifetime_spend: entry.lifetime_spend,
          avg_rating: entry.ratings.length > 0
            ? entry.ratings.reduce((a, b) => a + b, 0) / entry.ratings.length
            : 0,
        };
      }
    });
    setStats(statsMap);
  }, [supabase, customers]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);
  useEffect(() => { if (customers.length > 0) fetchStats(); }, [customers, fetchStats]);

  // ─── Real-time subscription ─────────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel('customer-management-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => {
        fetchCustomers();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, fetchCustomers]);

  // ─── Filtered list ──────────────────────────────────────────────────────────

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch =
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.address ?? '').toLowerCase().includes(q);
    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && c.is_active) ||
      (statusFilter === 'inactive' && !c.is_active);
    return matchSearch && matchStatus;
  });

  // ─── KPI stats ──────────────────────────────────────────────────────────────

  const totalActive = customers.filter((c) => c.is_active).length;
  const totalOrders = Object.values(stats).reduce((a, s) => a + s.order_count, 0);
  const totalRevenue = Object.values(stats).reduce((a, s) => a + s.lifetime_spend, 0);
  const allRatings = Object.values(stats).map((s) => s.avg_rating).filter((r) => r > 0);
  const avgRating = allRatings.length > 0 ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length : 0;

  // ─── Form handlers ──────────────────────────────────────────────────────────

  function openAdd() {
    setEditingCustomer(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(customer: Customer) {
    setEditingCustomer(customer);
    setForm({
      name: customer.name,
      email: customer.email ?? '',
      phone: customer.phone,
      address: customer.address ?? '',
      notes: customer.notes ?? '',
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingCustomer(null);
    setForm(EMPTY_FORM);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error('Name and phone are required');
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim(),
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    };

    if (editingCustomer) {
      const { error } = await supabase.from('customers').update(payload).eq('id', editingCustomer.id);
      if (error) { toast.error('Update failed: ' + error.message); }
      else { toast.success('Customer updated'); closeForm(); fetchCustomers(); }
    } else {
      const { error } = await supabase.from('customers').insert({ ...payload, is_active: true });
      if (error) { toast.error('Create failed: ' + error.message); }
      else { toast.success('Customer added'); closeForm(); fetchCustomers(); }
    }
    setSaving(false);
  }

  // ─── Deactivation ───────────────────────────────────────────────────────────

  async function handleToggleActive(customer: Customer) {
    const next = !customer.is_active;
    const { error } = await supabase.from('customers').update({ is_active: next }).eq('id', customer.id);
    if (error) {
      toast.error('Failed to update customer: ' + error.message);
    } else {
      toast.success(`${customer.name} ${next ? 'reactivated' : 'deactivated'}`);
      setConfirmDeactivate(null);
      fetchCustomers();
    }
  }

  // ─── Contact ────────────────────────────────────────────────────────────────

  function handleContact(customer: Customer) {
    if (customer.email) {
      window.open(`mailto:${customer.email}`, '_blank');
    } else {
      window.open(`tel:${customer.phone}`, '_blank');
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
            Customer Management
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Manage customer profiles, contact info, and order history
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchCustomers}
            className="p-2 rounded-lg border transition-colors hover:bg-secondary"
            style={{ borderColor: 'hsl(var(--border))' }}
            title="Refresh"
          >
            <RefreshCw size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'hsl(var(--primary))' }}
          >
            <Plus size={16} />
            Add Customer
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Active Customers', value: totalActive, icon: Users, color: 'hsl(var(--primary))' },
          { label: 'Total Orders', value: totalOrders, icon: ShoppingBag, color: '#10b981' },
          { label: 'Total Revenue', value: `£${totalRevenue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: DollarSign, color: '#f59e0b' },
          { label: 'Avg Rating', value: avgRating > 0 ? avgRating.toFixed(1) : '—', icon: Star, color: '#f59e0b' },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border p-4 flex items-center gap-3"
            style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${kpi.color}20` }}>
              <kpi.icon size={20} style={{ color: kpi.color }} />
            </div>
            <div>
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{kpi.label}</p>
              <p className="text-xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} />
          <input
            type="text"
            placeholder="Search by name, phone, email or address…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border outline-none focus:ring-2"
            style={{
              backgroundColor: 'hsl(var(--background))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
            }}
          />
        </div>
        <div className="flex gap-1 rounded-lg border p-1" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}>
          {(['all', 'active', 'inactive'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className="px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors"
              style={
                statusFilter === f
                  ? { backgroundColor: 'hsl(var(--primary))', color: 'white' }
                  : { color: 'hsl(var(--muted-foreground))' }
              }
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin" style={{ color: 'hsl(var(--primary))' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Users size={40} style={{ color: 'hsl(var(--muted-foreground))' }} />
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>No customers found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--secondary))' }}>
                  {['Customer', 'Contact', 'Orders', 'Lifetime Spend', 'Avg Rating', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((customer) => {
                  const s = stats[customer.id];
                  return (
                    <tr
                      key={customer.id}
                      className="border-b last:border-0 hover:bg-secondary/40 transition-colors"
                      style={{ borderColor: 'hsl(var(--border))' }}
                    >
                      {/* Customer */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                            style={{ backgroundColor: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))' }}
                          >
                            {customer.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>{customer.name}</p>
                            {customer.address && (
                              <p className="text-xs truncate max-w-[180px]" style={{ color: 'hsl(var(--muted-foreground))' }}>{customer.address}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <Phone size={12} style={{ color: 'hsl(var(--muted-foreground))' }} />
                            <span style={{ color: 'hsl(var(--foreground))' }}>{customer.phone}</span>
                          </div>
                          {customer.email && (
                            <div className="flex items-center gap-1.5">
                              <Mail size={12} style={{ color: 'hsl(var(--muted-foreground))' }} />
                              <span className="text-xs truncate max-w-[160px]" style={{ color: 'hsl(var(--muted-foreground))' }}>{customer.email}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Orders */}
                      <td className="px-4 py-3">
                        <span className="font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                          {s?.order_count ?? 0}
                        </span>
                      </td>

                      {/* Lifetime Spend */}
                      <td className="px-4 py-3">
                        <span className="font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                          £{(s?.lifetime_spend ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>

                      {/* Avg Rating */}
                      <td className="px-4 py-3">
                        {s && s.avg_rating > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <StarRating rating={s.avg_rating} />
                            <span className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
                              {s.avg_rating.toFixed(1)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            customer.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {customer.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleContact(customer)}
                            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
                            title={customer.email ? `Email ${customer.name}` : `Call ${customer.name}`}
                          >
                            {customer.email ? (
                              <Mail size={15} style={{ color: 'hsl(var(--primary))' }} />
                            ) : (
                              <Phone size={15} style={{ color: 'hsl(var(--primary))' }} />
                            )}
                          </button>
                          <button
                            onClick={() => openEdit(customer)}
                            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
                            title="Edit customer"
                          >
                            <Edit2 size={15} style={{ color: 'hsl(var(--muted-foreground))' }} />
                          </button>
                          <button
                            onClick={() => setConfirmDeactivate(customer)}
                            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
                            title={customer.is_active ? 'Deactivate customer' : 'Reactivate customer'}
                          >
                            {customer.is_active ? (
                              <UserX size={15} className="text-red-500" />
                            ) : (
                              <UserCheck size={15} className="text-green-600" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div
            className="w-full max-w-lg rounded-2xl shadow-2xl"
            style={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
              <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                {editingCustomer ? 'Edit Customer' : 'Add Customer'}
              </h2>
              <button onClick={closeForm} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <X size={18} style={{ color: 'hsl(var(--muted-foreground))' }} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-4">
              {[
                { label: 'Full Name *', key: 'name', type: 'text', placeholder: 'e.g. Alice Thornton' },
                { label: 'Phone *', key: 'phone', type: 'tel', placeholder: '+1 555-0101' },
                { label: 'Email', key: 'email', type: 'email', placeholder: 'alice@email.com' },
                { label: 'Address', key: 'address', type: 'text', placeholder: '12 Oak Street, Melbourne VIC 3000' },
              ].map((field) => (
                <div key={field.key}>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {field.label}
                  </label>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={form[field.key as keyof CustomerFormData]}
                    onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'hsl(var(--background))',
                      borderColor: 'hsl(var(--border))',
                      color: 'hsl(var(--foreground))',
                    }}
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Delivery preferences, special instructions…"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2 resize-none"
                  style={{
                    backgroundColor: 'hsl(var(--background))',
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                  }}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
              <button
                onClick={closeForm}
                className="px-4 py-2 text-sm rounded-lg border transition-colors hover:bg-secondary"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: 'hsl(var(--primary))' }}
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editingCustomer ? 'Save Changes' : 'Add Customer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate / Reactivate Confirmation */}
      {confirmDeactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div
            className="w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4"
            style={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
          >
            <div className="flex items-start gap-3">
              <AlertCircle size={22} className={confirmDeactivate.is_active ? 'text-red-500 shrink-0 mt-0.5' : 'text-green-600 shrink-0 mt-0.5'} />
              <div>
                <h3 className="font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                  {confirmDeactivate.is_active ? 'Deactivate Customer' : 'Reactivate Customer'}
                </h3>
                <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {confirmDeactivate.is_active
                    ? `${confirmDeactivate.name} will be marked inactive and hidden from active customer lists.`
                    : `${confirmDeactivate.name} will be reactivated and visible in active customer lists.`}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeactivate(null)}
                className="px-4 py-2 text-sm rounded-lg border transition-colors hover:bg-secondary"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleToggleActive(confirmDeactivate)}
                className={`px-4 py-2 text-sm font-medium rounded-lg text-white transition-opacity hover:opacity-90 ${
                  confirmDeactivate.is_active ? 'bg-red-500' : 'bg-green-600'
                }`}
              >
                {confirmDeactivate.is_active ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
