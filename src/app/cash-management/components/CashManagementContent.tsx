'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Banknote, RefreshCw, CheckCircle2, ChevronDown, ChevronUp, User, ArrowDownCircle, ArrowUpCircle, AlertTriangle,  } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';


interface Driver {
  id: string;
  name: string;
  phone: string;
  avatar: string;
  status: string;
}

interface CashAllocation {
  id: string;
  driver_id: string;
  order_id: string;
  amount: number;
  allocated_at: string;
  notes: string | null;
}

interface CashCollection {
  id: string;
  driver_id: string;
  amount: number;
  collected_at: string;
  collected_by: string;
  notes: string | null;
}

interface DriverCashSummary {
  driver: Driver;
  totalAllocated: number;
  totalCollected: number;
  balance: number;
  allocations: CashAllocation[];
  collections: CashCollection[];
}

export default function CashManagementContent() {
  const supabase = createClient();

  const [summaries, setSummaries] = useState<DriverCashSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDriver, setExpandedDriver] = useState<string | null>(null);

  // Collection modal state
  const [collectModalOpen, setCollectModalOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<DriverCashSummary | null>(null);
  const [collectAmount, setCollectAmount] = useState('');
  const [collectNotes, setCollectNotes] = useState('');
  const [collectBy, setCollectBy] = useState('Admin');
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [driversRes, allocRes, collectRes] = await Promise.all([
        supabase.from('drivers').select('id, name, phone, avatar, status').order('name'),
        supabase.from('driver_cash_allocations').select('*').order('allocated_at', { ascending: false }),
        supabase.from('driver_cash_collections').select('*').order('collected_at', { ascending: false }),
      ]);

      if (driversRes.error) throw driversRes.error;
      if (allocRes.error) throw allocRes.error;
      if (collectRes.error) throw collectRes.error;

      const drivers: Driver[] = driversRes.data ?? [];
      const allocations: CashAllocation[] = allocRes.data ?? [];
      const collections: CashCollection[] = collectRes.data ?? [];

      const built: DriverCashSummary[] = drivers.map((driver) => {
        const driverAllocs = allocations.filter((a) => a.driver_id === driver.id);
        const driverCollects = collections.filter((c) => c.driver_id === driver.id);
        const totalAllocated = driverAllocs.reduce((sum, a) => sum + Number(a.amount), 0);
        const totalCollected = driverCollects.reduce((sum, c) => sum + Number(c.amount), 0);
        return {
          driver,
          totalAllocated,
          totalCollected,
          balance: totalAllocated - totalCollected,
          allocations: driverAllocs,
          collections: driverCollects,
        };
      });

      setSummaries(built);
    } catch (err: any) {
      toast.error('Failed to load cash data: ' + (err?.message ?? 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCollectModal = (summary: DriverCashSummary) => {
    setSelectedDriver(summary);
    setCollectAmount(summary.balance > 0 ? summary.balance.toFixed(2) : '');
    setCollectNotes('');
    setCollectBy('Admin');
    setCollectModalOpen(true);
  };

  const handleCollect = async () => {
    if (!selectedDriver) return;
    const amount = parseFloat(collectAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase.from('driver_cash_collections').insert({
        driver_id: selectedDriver.driver.id,
        amount,
        collected_by: collectBy || 'Admin',
        notes: collectNotes || null,
        collected_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success(`£${amount.toFixed(2)} collected from ${selectedDriver.driver.name}`);
      setCollectModalOpen(false);
      await loadData();
    } catch (err: any) {
      toast.error('Failed to record collection: ' + (err?.message ?? 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const totalBalance = summaries.reduce((sum, s) => sum + s.balance, 0);
  const totalAllocated = summaries.reduce((sum, s) => sum + s.totalAllocated, 0);
  const totalCollected = summaries.reduce((sum, s) => sum + s.totalCollected, 0);

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
              Cash Management
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Track driver cash pots and record collections
            </p>
          </div>
          <button onClick={loadData} className="btn-secondary text-sm" disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              label: 'Total Cash Allocated',
              value: `£${totalAllocated.toFixed(2)}`,
              icon: ArrowUpCircle,
              color: 'hsl(142 69% 35%)',
              bg: 'hsl(142 69% 35% / 0.08)',
            },
            {
              label: 'Total Collected',
              value: `£${totalCollected.toFixed(2)}`,
              icon: ArrowDownCircle,
              color: 'hsl(var(--primary))',
              bg: 'hsl(var(--primary) / 0.08)',
            },
            {
              label: 'Outstanding Balance',
              value: `£${totalBalance.toFixed(2)}`,
              icon: Banknote,
              color: totalBalance > 0 ? 'hsl(38 92% 50%)' : 'hsl(var(--muted-foreground))',
              bg: totalBalance > 0 ? 'hsl(38 92% 50% / 0.08)' : 'hsl(var(--secondary))',
            },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="card p-5 flex items-center gap-4">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: bg }}
              >
                <Icon size={20} style={{ color }} />
              </div>
              <div>
                <p className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {label}
                </p>
                <p className="text-xl font-bold tabular-nums mt-0.5" style={{ color }}>
                  {value}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Driver Cash Pots */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card p-5 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full skeleton" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 rounded skeleton" />
                    <div className="h-3 w-24 rounded skeleton" />
                  </div>
                  <div className="h-8 w-24 rounded skeleton" />
                </div>
              </div>
            ))}
          </div>
        ) : summaries.length === 0 ? (
          <div className="card p-10 text-center">
            <Banknote size={36} className="mx-auto mb-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
            <p className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>
              No drivers found
            </p>
            <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Add drivers to start tracking cash payments
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {summaries.map((summary) => {
              const isExpanded = expandedDriver === summary.driver.id;
              const hasBalance = summary.balance > 0;

              return (
                <div
                  key={summary.driver.id}
                  className="card overflow-hidden"
                  style={{
                    borderColor: hasBalance ? 'hsl(38 92% 50% / 0.3)' : 'hsl(var(--border))',
                  }}
                >
                  {/* Driver row */}
                  <div className="p-4 flex items-center gap-4 flex-wrap">
                    {/* Avatar */}
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                      style={{ backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}
                    >
                      {summary.driver.name.slice(0, 2).toUpperCase()}
                    </div>

                    {/* Name & phone */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{summary.driver.name}</p>
                      <p className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {summary.driver.phone}
                      </p>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          Allocated
                        </p>
                        <p className="text-sm font-semibold tabular-nums" style={{ color: 'hsl(142 69% 35%)' }}>
                          £{summary.totalAllocated.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          Collected
                        </p>
                        <p className="text-sm font-semibold tabular-nums" style={{ color: 'hsl(var(--primary))' }}>
                          £{summary.totalCollected.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          Balance
                        </p>
                        <p
                          className="text-sm font-bold tabular-nums"
                          style={{ color: hasBalance ? 'hsl(38 92% 45%)' : 'hsl(var(--muted-foreground))' }}
                        >
                          £{summary.balance.toFixed(2)}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {hasBalance && (
                        <button
                          onClick={() => openCollectModal(summary)}
                          className="btn-primary text-xs py-1.5 px-3"
                        >
                          <ArrowDownCircle size={13} />
                          Collect Cash
                        </button>
                      )}
                      <button
                        onClick={() =>
                          setExpandedDriver(isExpanded ? null : summary.driver.id)
                        }
                        className="btn-secondary text-xs py-1.5 px-2"
                        title={isExpanded ? 'Collapse' : 'View log'}
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded log */}
                  {isExpanded && (
                    <div
                      className="border-t px-4 pb-4 pt-3 space-y-4"
                      style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--secondary) / 0.3)' }}
                    >
                      {/* Allocations */}
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          <ArrowUpCircle size={12} style={{ color: 'hsl(142 69% 35%)' }} />
                          Cash Allocations ({summary.allocations.length})
                        </h4>
                        {summary.allocations.length === 0 ? (
                          <p className="text-xs italic" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            No cash payments allocated yet
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {summary.allocations.map((alloc) => (
                              <div
                                key={alloc.id}
                                className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
                                style={{ backgroundColor: 'hsl(var(--card))' }}
                              >
                                <div className="flex items-center gap-2">
                                  <Banknote size={12} style={{ color: 'hsl(142 69% 35%)' }} />
                                  <span className="font-medium">Order #{alloc.order_id}</span>
                                  {alloc.notes && (
                                    <span style={{ color: 'hsl(var(--muted-foreground))' }}>
                                      — {alloc.notes}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <span className="font-bold tabular-nums" style={{ color: 'hsl(142 69% 35%)' }}>
                                    +£{Number(alloc.amount).toFixed(2)}
                                  </span>
                                  <span style={{ color: 'hsl(var(--muted-foreground))' }}>
                                    {new Date(alloc.allocated_at).toLocaleDateString('en-GB', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Collections */}
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          <ArrowDownCircle size={12} style={{ color: 'hsl(var(--primary))' }} />
                          Cash Collections ({summary.collections.length})
                        </h4>
                        {summary.collections.length === 0 ? (
                          <p className="text-xs italic" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            No collections recorded yet
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {summary.collections.map((col) => (
                              <div
                                key={col.id}
                                className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
                                style={{ backgroundColor: 'hsl(var(--card))' }}
                              >
                                <div className="flex items-center gap-2">
                                  <User size={12} style={{ color: 'hsl(var(--primary))' }} />
                                  <span className="font-medium">Collected by {col.collected_by}</span>
                                  {col.notes && (
                                    <span style={{ color: 'hsl(var(--muted-foreground))' }}>
                                      — {col.notes}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <span className="font-bold tabular-nums" style={{ color: 'hsl(var(--primary))' }}>
                                    -£{Number(col.amount).toFixed(2)}
                                  </span>
                                  <span style={{ color: 'hsl(var(--muted-foreground))' }}>
                                    {new Date(col.collected_at).toLocaleDateString('en-GB', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Collect Cash Modal */}
      {collectModalOpen && selectedDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'hsl(var(--background) / 0.8)', backdropFilter: 'blur(4px)' }}
            onClick={() => setCollectModalOpen(false)}
          />
          <div
            className="relative w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-5"
            style={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}
              >
                <ArrowDownCircle size={20} style={{ color: 'hsl(var(--primary))' }} />
              </div>
              <div>
                <h2 className="font-bold text-base">Collect Cash</h2>
                <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  From {selectedDriver.driver.name}
                </p>
              </div>
            </div>

            {/* Balance info */}
            <div
              className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{ backgroundColor: 'hsl(38 92% 50% / 0.08)', border: '1px solid hsl(38 92% 50% / 0.2)' }}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} style={{ color: 'hsl(38 92% 45%)' }} />
                <span className="text-xs font-medium">Outstanding balance</span>
              </div>
              <span className="font-bold tabular-nums text-sm" style={{ color: 'hsl(38 92% 45%)' }}>
                £{selectedDriver.balance.toFixed(2)}
              </span>
            </div>

            {/* Amount */}
            <div>
              <label className="label">Amount to Collect (£)</label>
              <div className="relative mt-1">
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  £
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={collectAmount}
                  onChange={(e) => setCollectAmount(e.target.value)}
                  className="input-base pl-8 font-mono"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Collected by */}
            <div>
              <label className="label">Collected By</label>
              <input
                type="text"
                value={collectBy}
                onChange={(e) => setCollectBy(e.target.value)}
                className="input-base mt-1"
                placeholder="Admin name"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="label">
                Notes{' '}
                <span className="font-normal" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  (optional)
                </span>
              </label>
              <textarea
                rows={2}
                value={collectNotes}
                onChange={(e) => setCollectNotes(e.target.value)}
                className="input-base resize-none mt-1"
                placeholder="e.g. End of shift collection"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleCollect}
                className="btn-primary flex-1"
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Recording…
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    Record Collection
                  </>
                )}
              </button>
              <button
                onClick={() => setCollectModalOpen(false)}
                className="btn-secondary"
                disabled={isSaving}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
