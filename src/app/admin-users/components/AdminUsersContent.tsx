'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Users, Search, Plus, Edit2, UserX, UserCheck, Shield, X, Check, AlertCircle, Loader2, Mail, RefreshCw, ShieldCheck, Eye, Truck,  } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type UserRole = 'admin' | 'manager' | 'dispatcher' | 'viewer';

interface AdminUser {
  id: string;
  user_id: string | null;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  can_create_orders: boolean;
  can_edit_orders: boolean;
  can_delete_orders: boolean;
  can_manage_drivers: boolean;
  can_view_analytics: boolean;
  can_manage_settings: boolean;
  created_at: string;
  updated_at: string;
}

interface UserFormData {
  email: string;
  full_name: string;
  role: UserRole;
  can_create_orders: boolean;
  can_edit_orders: boolean;
  can_delete_orders: boolean;
  can_manage_drivers: boolean;
  can_view_analytics: boolean;
  can_manage_settings: boolean;
}

const EMPTY_FORM: UserFormData = {
  email: '',
  full_name: '',
  role: 'viewer',
  can_create_orders: false,
  can_edit_orders: false,
  can_delete_orders: false,
  can_manage_drivers: false,
  can_view_analytics: false,
  can_manage_settings: false,
};

const ROLE_DEFAULTS: Record<UserRole, Partial<UserFormData>> = {
  admin: {
    can_create_orders: true,
    can_edit_orders: true,
    can_delete_orders: true,
    can_manage_drivers: true,
    can_view_analytics: true,
    can_manage_settings: true,
  },
  manager: {
    can_create_orders: true,
    can_edit_orders: true,
    can_delete_orders: false,
    can_manage_drivers: true,
    can_view_analytics: true,
    can_manage_settings: false,
  },
  dispatcher: {
    can_create_orders: true,
    can_edit_orders: true,
    can_delete_orders: false,
    can_manage_drivers: false,
    can_view_analytics: false,
    can_manage_settings: false,
  },
  viewer: {
    can_create_orders: false,
    can_edit_orders: false,
    can_delete_orders: false,
    can_manage_drivers: false,
    can_view_analytics: false,
    can_manage_settings: false,
  },
};

const ROLE_COLOURS: Record<UserRole, string> = {
  admin: 'bg-purple-100 text-purple-700',
  manager: 'bg-blue-100 text-blue-700',
  dispatcher: 'bg-orange-100 text-orange-700',
  viewer: 'bg-gray-100 text-gray-600',
};

const ROLE_ICONS: Record<UserRole, React.ElementType> = {
  admin: ShieldCheck,
  manager: Shield,
  dispatcher: Truck,
  viewer: Eye,
};

const PERMISSION_LABELS: { key: keyof UserFormData; label: string }[] = [
  { key: 'can_create_orders', label: 'Create Bookings' },
  { key: 'can_edit_orders', label: 'Edit Bookings' },
  { key: 'can_delete_orders', label: 'Delete Bookings' },
  { key: 'can_manage_drivers', label: 'Manage Drivers' },
  { key: 'can_view_analytics', label: 'View Analytics' },
  { key: 'can_manage_settings', label: 'Manage Settings' },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminUsersContent() {
  const supabase = createClient();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<UserFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Deactivation confirm
  const [confirmUser, setConfirmUser] = useState<AdminUser | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // ─── Data Fetching ──────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers((data as AdminUser[]) || []);
    } catch (err: any) {
      toast.error('Failed to load users: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // ─── Filtering ──────────────────────────────────────────────────────────────

  const filtered = users.filter((u) => {
    const matchSearch =
      !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.full_name.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' ? u.is_active : !u.is_active);
    return matchSearch && matchRole && matchStatus;
  });

  // ─── Modal Helpers ──────────────────────────────────────────────────────────

  const openAdd = () => {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (user: AdminUser) => {
    setEditingUser(user);
    setForm({
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      can_create_orders: user.can_create_orders,
      can_edit_orders: user.can_edit_orders,
      can_delete_orders: user.can_delete_orders,
      can_manage_drivers: user.can_manage_drivers,
      can_view_analytics: user.can_view_analytics,
      can_manage_settings: user.can_manage_settings,
    });
    setFormError('');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setFormError('');
  };

  const handleRoleChange = (role: UserRole) => {
    setForm((prev) => ({ ...prev, role, ...ROLE_DEFAULTS[role] }));
  };

  const handlePermissionToggle = (key: keyof UserFormData) => {
    setForm((prev) => ({ ...prev, [key]: !prev[key as keyof UserFormData] }));
  };

  // ─── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setFormError('');
    if (!form.email.trim()) { setFormError('Email is required.'); return; }
    if (!form.full_name.trim()) { setFormError('Full name is required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setFormError('Enter a valid email address.');
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        const { error } = await supabase
          .from('user_roles')
          .update({
            email: form.email.trim(),
            full_name: form.full_name.trim(),
            role: form.role,
            can_create_orders: form.can_create_orders,
            can_edit_orders: form.can_edit_orders,
            can_delete_orders: form.can_delete_orders,
            can_manage_drivers: form.can_manage_drivers,
            can_view_analytics: form.can_view_analytics,
            can_manage_settings: form.can_manage_settings,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingUser.id);
        if (error) throw error;
        toast.success('User updated successfully');
      } else {
        // Check duplicate email
        const { data: existing } = await supabase
          .from('user_roles')
          .select('id')
          .eq('email', form.email.trim())
          .maybeSingle();
        if (existing) { setFormError('A user with this email already exists.'); setSaving(false); return; }

        const { error } = await supabase.from('user_roles').insert({
          email: form.email.trim(),
          full_name: form.full_name.trim(),
          role: form.role,
          is_active: true,
          can_create_orders: form.can_create_orders,
          can_edit_orders: form.can_edit_orders,
          can_delete_orders: form.can_delete_orders,
          can_manage_drivers: form.can_manage_drivers,
          can_view_analytics: form.can_view_analytics,
          can_manage_settings: form.can_manage_settings,
        });
        if (error) throw error;
        toast.success('User added successfully');
      }
      closeModal();
      fetchUsers();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save user.');
    } finally {
      setSaving(false);
    }
  };

  // ─── Deactivate / Reactivate ────────────────────────────────────────────────

  const handleToggleActive = async () => {
    if (!confirmUser) return;
    setConfirmLoading(true);
    try {
      const { error } = await supabase
        .from('user_roles')
        .update({ is_active: !confirmUser.is_active, updated_at: new Date().toISOString() })
        .eq('id', confirmUser.id);
      if (error) throw error;
      toast.success(confirmUser.is_active ? 'Account deactivated' : 'Account reactivated');
      setConfirmUser(null);
      fetchUsers();
    } catch (err: any) {
      toast.error('Failed to update account: ' + err.message);
    } finally {
      setConfirmLoading(false);
    }
  };

  // ─── Stats ──────────────────────────────────────────────────────────────────

  const stats = {
    total: users.length,
    active: users.filter((u) => u.is_active).length,
    admins: users.filter((u) => u.role === 'admin').length,
    dispatchers: users.filter((u) => u.role === 'dispatcher').length,
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-auto" style={{ backgroundColor: 'hsl(var(--background))' }}>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>Admin Users</h1>
            <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Manage user accounts, roles, and permissions
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchUsers}
              className="p-2 rounded-lg border transition-colors hover:bg-secondary"
              style={{ borderColor: 'hsl(var(--border))' }}
              title="Refresh"
            >
              <RefreshCw size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
            </button>
            <button
              onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: 'hsl(var(--primary))' }}
            >
              <Plus size={16} />
              Add User
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Users', value: stats.total, icon: Users, color: 'hsl(var(--primary))' },
            { label: 'Active', value: stats.active, icon: UserCheck, color: '#22c55e' },
            { label: 'Admins', value: stats.admins, icon: ShieldCheck, color: '#a855f7' },
            { label: 'Dispatchers', value: stats.dispatchers, icon: Truck, color: '#f97316' },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border p-4"
              style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>{s.label}</span>
                <s.icon size={16} style={{ color: s.color }} />
              </div>
              <p className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} />
            <input
              type="text"
              placeholder="Search by name or email..."
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
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}
            className="px-3 py-2 text-sm rounded-lg border outline-none"
            style={{
              backgroundColor: 'hsl(var(--background))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
            }}
          >
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="dispatcher">Dispatcher</option>
            <option value="viewer">Viewer</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
            className="px-3 py-2 text-sm rounded-lg border outline-none"
            style={{
              backgroundColor: 'hsl(var(--background))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
            }}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {/* Table */}
        <div
          className="rounded-xl border overflow-hidden"
          style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={28} className="animate-spin" style={{ color: 'hsl(var(--primary))' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Users size={40} style={{ color: 'hsl(var(--muted-foreground))' }} />
              <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {search || roleFilter !== 'all' || statusFilter !== 'all' ? 'No users match your filters.' : 'No users found. Add your first user.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--secondary))' }}>
                    {['User', 'Role', 'Permissions', 'Status', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((user, idx) => {
                    const RoleIcon = ROLE_ICONS[user.role];
                    const permCount = [
                      user.can_create_orders, user.can_edit_orders, user.can_delete_orders,
                      user.can_manage_drivers, user.can_view_analytics, user.can_manage_settings,
                    ].filter(Boolean).length;

                    return (
                      <tr
                        key={user.id}
                        style={{
                          borderBottom: idx < filtered.length - 1 ? '1px solid hsl(var(--border))' : 'none',
                        }}
                        className="hover:bg-secondary/40 transition-colors"
                      >
                        {/* User */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                              style={{ backgroundColor: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))' }}
                            >
                              {user.full_name ? user.full_name.slice(0, 2).toUpperCase() : user.email.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                                {user.full_name || '—'}
                              </p>
                              <p className="text-xs flex items-center gap-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                <Mail size={11} />
                                {user.email}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_COLOURS[user.role]}`}>
                            <RoleIcon size={11} />
                            {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                          </span>
                        </td>

                        {/* Permissions */}
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1 max-w-[220px]">
                            {PERMISSION_LABELS.map(({ key, label }) => {
                              const val = user[key as keyof AdminUser] as boolean;
                              return val ? (
                                <span
                                  key={key}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                                  style={{ backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}
                                >
                                  {label}
                                </span>
                              ) : null;
                            })}
                            {permCount === 0 && (
                              <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>View only</span>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                              user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? 'bg-green-500' : 'bg-red-400'}`} />
                            {user.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openEdit(user)}
                              className="p-1.5 rounded-lg transition-colors hover:bg-secondary"
                              title="Edit user"
                            >
                              <Edit2 size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
                            </button>
                            <button
                              onClick={() => setConfirmUser(user)}
                              className={`p-1.5 rounded-lg transition-colors hover:bg-secondary`}
                              title={user.is_active ? 'Deactivate account' : 'Reactivate account'}
                            >
                              {user.is_active
                                ? <UserX size={14} className="text-red-500" />
                                : <UserCheck size={14} className="text-green-600" />
                              }
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

        {/* Result count */}
        {!loading && filtered.length > 0 && (
          <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Showing {filtered.length} of {users.length} users
          </p>
        )}
      </div>

      {/* ─── Add / Edit Modal ─────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div
            className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
            style={{ backgroundColor: 'hsl(var(--card))' }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
              <div className="flex items-center gap-2">
                <Shield size={18} style={{ color: 'hsl(var(--primary))' }} />
                <h2 className="text-base font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                  {editingUser ? 'Edit User' : 'Add New User'}
                </h2>
              </div>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <X size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
              {formError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertCircle size={15} />
                  {formError}
                </div>
              )}

              {/* Basic Info */}
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.full_name}
                    onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                    placeholder="e.g. Jane Smith"
                    className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2"
                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="user@example.com"
                    className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2"
                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  />
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                  Role
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['admin', 'manager', 'dispatcher', 'viewer'] as UserRole[]).map((role) => {
                    const RoleIcon = ROLE_ICONS[role];
                    const isSelected = form.role === role;
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => handleRoleChange(role)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                          isSelected ? 'border-primary' : ''
                        }`}
                        style={{
                          borderColor: isSelected ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                          backgroundColor: isSelected ? 'hsl(var(--primary) / 0.08)' : 'hsl(var(--background))',
                          color: isSelected ? 'hsl(var(--primary))' : 'hsl(var(--foreground))',
                        }}
                      >
                        <RoleIcon size={15} />
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                        {isSelected && <Check size={13} className="ml-auto" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Permissions */}
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                  Permissions
                </label>
                <div className="rounded-lg border divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
                  {PERMISSION_LABELS.map(({ key, label }) => {
                    const val = form[key as keyof UserFormData] as boolean;
                    return (
                      <div key={key} className="flex items-center justify-between px-3 py-2.5">
                        <span className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>{label}</span>
                        <button
                          type="button"
                          onClick={() => handlePermissionToggle(key as keyof UserFormData)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            val ? 'bg-primary' : 'bg-gray-200'
                          }`}
                          style={{ backgroundColor: val ? 'hsl(var(--primary))' : undefined }}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                              val ? 'translate-x-4' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm rounded-lg border transition-colors hover:bg-secondary"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-60"
                style={{ backgroundColor: 'hsl(var(--primary))' }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {editingUser ? 'Save Changes' : 'Add User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Deactivate Confirm Modal ─────────────────────────────────────────── */}
      {confirmUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div
            className="w-full max-w-sm rounded-2xl shadow-2xl p-6"
            style={{ backgroundColor: 'hsl(var(--card))' }}
          >
            <div className="flex items-center gap-3 mb-4">
              {confirmUser.is_active
                ? <UserX size={22} className="text-red-500" />
                : <UserCheck size={22} className="text-green-600" />
              }
              <h3 className="text-base font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                {confirmUser.is_active ? 'Deactivate Account' : 'Reactivate Account'}
              </h3>
            </div>
            <p className="text-sm mb-6" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {confirmUser.is_active
                ? `Are you sure you want to deactivate ${confirmUser.full_name || confirmUser.email}? They will lose access to the system.`
                : `Reactivate ${confirmUser.full_name || confirmUser.email}? They will regain access to the system.`
              }
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmUser(null)}
                className="px-4 py-2 text-sm rounded-lg border transition-colors hover:bg-secondary"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
              >
                Cancel
              </button>
              <button
                onClick={handleToggleActive}
                disabled={confirmLoading}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-60 ${
                  confirmUser.is_active ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {confirmLoading && <Loader2 size={14} className="animate-spin" />}
                {confirmUser.is_active ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
