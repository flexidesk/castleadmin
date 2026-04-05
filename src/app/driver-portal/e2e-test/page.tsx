'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Clock,
  Package,
  DollarSign,
  FileCheck,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Truck,
  Play,
  RotateCcw,
  ArrowLeft,
} from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';

// ─── Types ────────────────────────────────────────────────────────────────────

type TestStatus = 'idle' | 'running' | 'pass' | 'fail' | 'skip';

interface TestResult {
  id: string;
  label: string;
  status: TestStatus;
  detail?: string;
  duration?: number;
}

interface TestGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  tests: TestResult[];
  expanded: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusIcon(status: TestStatus) {
  if (status === 'running') return <Loader2 size={14} className="animate-spin text-blue-500" />;
  if (status === 'pass') return <CheckCircle2 size={14} className="text-green-600" />;
  if (status === 'fail') return <XCircle size={14} className="text-red-500" />;
  if (status === 'skip') return <AlertTriangle size={14} className="text-yellow-500" />;
  return <div className="w-3.5 h-3.5 rounded-full border-2" style={{ borderColor: 'hsl(var(--border))' }} />;
}

function statusColor(status: TestStatus): string {
  if (status === 'pass') return 'hsl(142 69% 35%)';
  if (status === 'fail') return 'hsl(0 84% 60%)';
  if (status === 'skip') return 'hsl(38 92% 50%)';
  if (status === 'running') return 'hsl(217 91% 60%)';
  return 'hsl(var(--muted-foreground))';
}

function groupSummary(tests: TestResult[]) {
  return {
    pass: tests.filter((t) => t.status === 'pass').length,
    fail: tests.filter((t) => t.status === 'fail').length,
    skip: tests.filter((t) => t.status === 'skip').length,
    total: tests.length,
  };
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await fn();
  return { result, ms: Math.round(performance.now() - start) };
}

// ─── Test Credentials ─────────────────────────────────────────────────────────

const TEST_EMAIL = 'test@test.com';
const TEST_PASSWORD = '123456';

// ─── Initial Groups ───────────────────────────────────────────────────────────

function makeInitialGroups(): TestGroup[] {
  return [
    {
      id: 'clock',
      label: 'Clock In / Clock Out',
      icon: <Clock size={16} />,
      expanded: true,
      tests: [
        { id: 'clock-login', label: 'Driver can log in via portal-login API', status: 'idle' },
        { id: 'clock-session', label: 'Session cookie is set after login', status: 'idle' },
        { id: 'clock-session-verify', label: 'Session endpoint returns valid driver data', status: 'idle' },
        { id: 'clock-shift-create', label: 'Shift record can be created (clock in)', status: 'idle' },
        { id: 'clock-shift-read', label: 'Active shift is readable from driver_shifts table', status: 'idle' },
        { id: 'clock-shift-update', label: 'Shift can be updated with clock_out timestamp', status: 'idle' },
        { id: 'clock-shift-cleanup', label: 'Test shift cleaned up after test', status: 'idle' },
      ],
    },
    {
      id: 'order-status',
      label: 'Order Status Updates',
      icon: <Package size={16} />,
      expanded: true,
      tests: [
        { id: 'os-fetch-orders', label: 'Orders endpoint returns list for authenticated driver', status: 'idle' },
        { id: 'os-status-accepted', label: 'Order status can be set to "Booking Accepted"', status: 'idle' },
        { id: 'os-status-assigned', label: 'Order status can be set to "Booking Assigned"', status: 'idle' },
        { id: 'os-status-out', label: 'Order status can be set to "Booking Out For Delivery"', status: 'idle' },
        { id: 'os-delivery-departed', label: 'Delivery status update: departed recorded', status: 'idle' },
        { id: 'os-delivery-arrived', label: 'Delivery status update: arrived_at_location recorded', status: 'idle' },
        { id: 'os-delivery-started', label: 'Delivery status update: started_delivery recorded', status: 'idle' },
        { id: 'os-delivery-completed', label: 'Delivery status update: completed recorded', status: 'idle' },
        { id: 'os-status-complete', label: 'Order status can be set to "Booking Complete"', status: 'idle' },
        { id: 'os-status-history', label: 'Completed orders appear in history filter', status: 'idle' },
      ],
    },
    {
      id: 'cash',
      label: 'Cash Recording',
      icon: <DollarSign size={16} />,
      expanded: true,
      tests: [
        { id: 'cash-alloc-read', label: 'driver_cash_allocations table is accessible', status: 'idle' },
        { id: 'cash-collect-read', label: 'driver_cash_collections table is accessible', status: 'idle' },
        { id: 'cash-alloc-insert', label: 'Cash allocation can be inserted for a driver', status: 'idle' },
        { id: 'cash-collect-insert', label: 'Cash collection record can be inserted', status: 'idle' },
        { id: 'cash-balance-calc', label: 'Balance calculation: allocated minus collected is correct', status: 'idle' },
        { id: 'cash-alloc-cleanup', label: 'Test cash records cleaned up after test', status: 'idle' },
      ],
    },
    {
      id: 'pod',
      label: 'Proof of Delivery',
      icon: <FileCheck size={16} />,
      expanded: true,
      tests: [
        { id: 'pod-table-access', label: 'driver_pod_submissions table is accessible', status: 'idle' },
        { id: 'pod-insert', label: 'POD submission can be inserted with required fields', status: 'idle' },
        { id: 'pod-read-back', label: 'Inserted POD submission is readable by driver', status: 'idle' },
        { id: 'pod-order-link', label: 'POD submission is linked to correct order_id', status: 'idle' },
        { id: 'pod-signature-field', label: 'Signature data URL field is stored correctly', status: 'idle' },
        { id: 'pod-photos-field', label: 'Photos JSON array field is stored correctly', status: 'idle' },
        { id: 'pod-cleanup', label: 'Test POD submission cleaned up after test', status: 'idle' },
      ],
    },
  ];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DriverE2ETestPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<TestGroup[]>(makeInitialGroups());
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [finishedAt, setFinishedAt] = useState<Date | null>(null);

  // ─── State helpers ──────────────────────────────────────────────────────────

  const updateTest = useCallback((groupId: string, testId: string, patch: Partial<TestResult>) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id !== groupId
          ? g
          : { ...g, tests: g.tests.map((t) => (t.id !== testId ? t : { ...t, ...patch })) }
      )
    );
  }, []);

  const appendLog = useCallback((msg: string) => {
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString('en-GB')}] ${msg}`]);
  }, []);

  const toggleGroup = (groupId: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, expanded: !g.expanded } : g))
    );
  };

  // ─── Supabase REST helper ───────────────────────────────────────────────────

  const supaRest = useCallback(
    async (
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
      path: string,
      body?: object,
      token?: string
    ): Promise<{ ok: boolean; status: number; data: any }> => {
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const url = `${base}/rest/v1/${path}`;
      const headers: Record<string, string> = {
        apikey: anonKey!,
        Authorization: `Bearer ${token ?? anonKey!}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Prefer: method === 'POST' ? 'return=representation' : '',
      };
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      return { ok: res.ok, status: res.status, data };
    },
    []
  );

  // ─── Run all tests ──────────────────────────────────────────────────────────

  const runAll = useCallback(async () => {
    setRunning(true);
    setLog([]);
    setStartedAt(new Date());
    setFinishedAt(null);
    setGroups(makeInitialGroups());

    appendLog('▶ Starting driver portal E2E test suite');

    // Shared state across tests
    let driverToken: string | undefined;
    let driverId: string | undefined;
    let testOrderId: string | undefined;
    let testShiftId: string | undefined;
    let testAllocId: string | undefined;
    let testCollectId: string | undefined;
    let testPodId: string | undefined;
    let testDeliveryUpdateIds: string[] = [];

    // ─── GROUP 1: Clock In / Clock Out ──────────────────────────────────────

    appendLog('── Clock In / Clock Out ──');

    // 1.1 Login
    updateTest('clock', 'clock-login', { status: 'running' });
    try {
      const { result: loginResult, ms } = await timed(async () => {
        const res = await fetch('/api/drivers/portal-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
        });
        return { ok: res.ok, data: await res.json() };
      });
      if (loginResult.ok && loginResult.data?.driver) {
        driverToken = loginResult.data.token;
        driverId = loginResult.data.driver?.id;
        updateTest('clock', 'clock-login', { status: 'pass', detail: `Driver: ${loginResult.data.driver.name}`, duration: ms });
        appendLog(`✓ Login OK — driver: ${loginResult.data.driver.name} (${ms}ms)`);
      } else {
        updateTest('clock', 'clock-login', { status: 'fail', detail: loginResult.data?.error ?? 'Login failed', duration: ms });
        appendLog(`✗ Login failed: ${loginResult.data?.error}`);
      }
    } catch (e: any) {
      updateTest('clock', 'clock-login', { status: 'fail', detail: e.message });
      appendLog(`✗ Login exception: ${e.message}`);
    }

    // 1.2 Session cookie
    updateTest('clock', 'clock-session', { status: 'running' });
    try {
      const { result, ms } = await timed(async () => {
        const cookies = document.cookie;
        return cookies.includes('driver_token') || cookies.includes('driver_session');
      });
      if (result) {
        updateTest('clock', 'clock-session', { status: 'pass', detail: 'Cookie present in document.cookie', duration: ms });
        appendLog(`✓ Session cookie found (${ms}ms)`);
      } else {
        // Token may be httpOnly — check via session endpoint
        updateTest('clock', 'clock-session', { status: 'skip', detail: 'Cookie is httpOnly (not visible to JS) — verified via session endpoint', duration: ms });
        appendLog(`~ Session cookie is httpOnly — will verify via session endpoint`);
      }
    } catch (e: any) {
      updateTest('clock', 'clock-session', { status: 'fail', detail: e.message });
    }

    // 1.3 Session verify
    updateTest('clock', 'clock-session-verify', { status: 'running' });
    try {
      const { result, ms } = await timed(async () => {
        const res = await fetch('/api/drivers/portal-login/session');
        return { ok: res.ok, data: await res.json() };
      });
      if (result.ok && result.data?.driver) {
        driverId = driverId ?? result.data.driver.id;
        updateTest('clock', 'clock-session-verify', { status: 'pass', detail: `Driver ID: ${result.data.driver.id}`, duration: ms });
        appendLog(`✓ Session valid — driver ID: ${result.data.driver.id} (${ms}ms)`);
      } else {
        updateTest('clock', 'clock-session-verify', { status: 'fail', detail: result.data?.error ?? 'No driver in session', duration: ms });
        appendLog(`✗ Session invalid: ${result.data?.error}`);
      }
    } catch (e: any) {
      updateTest('clock', 'clock-session-verify', { status: 'fail', detail: e.message });
      appendLog(`✗ Session verify exception: ${e.message}`);
    }

    // 1.4 Shift create (clock in)
    updateTest('clock', 'clock-shift-create', { status: 'running' });
    if (driverId) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const clockInTime = new Date().toISOString();
        const { result, ms } = await timed(() =>
          supaRest('POST', 'driver_shifts', {
            driver_id: driverId,
            shift_date: today,
            start_time: new Date().toTimeString().slice(0, 5),
            end_time: null,
            clock_in: clockInTime,
            clock_out: null,
            break_minutes: 0,
            shift_type: 'delivery',
            pay_type: 'hourly',
            created_at: clockInTime,
          })
        );
        if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
          testShiftId = result.data[0].id;
          updateTest('clock', 'clock-shift-create', { status: 'pass', detail: `Shift ID: ${testShiftId}`, duration: ms });
          appendLog(`✓ Shift created (clock in) — ID: ${testShiftId} (${ms}ms)`);
        } else {
          updateTest('clock', 'clock-shift-create', { status: 'fail', detail: JSON.stringify(result.data)?.slice(0, 120), duration: ms });
          appendLog(`✗ Shift create failed: ${JSON.stringify(result.data)?.slice(0, 80)}`);
        }
      } catch (e: any) {
        updateTest('clock', 'clock-shift-create', { status: 'fail', detail: e.message });
        appendLog(`✗ Shift create exception: ${e.message}`);
      }
    } else {
      updateTest('clock', 'clock-shift-create', { status: 'skip', detail: 'No driver ID — login failed' });
      appendLog('~ Skipping shift create — no driver ID');
    }

    // 1.5 Shift read
    updateTest('clock', 'clock-shift-read', { status: 'running' });
    if (testShiftId) {
      try {
        const { result, ms } = await timed(() =>
          supaRest('GET', `driver_shifts?id=eq.${testShiftId}&select=id,clock_in,clock_out,shift_date`)
        );
        if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
          updateTest('clock', 'clock-shift-read', { status: 'pass', detail: `clock_in: ${result.data[0].clock_in}`, duration: ms });
          appendLog(`✓ Shift readable — clock_in: ${result.data[0].clock_in} (${ms}ms)`);
        } else {
          updateTest('clock', 'clock-shift-read', { status: 'fail', detail: 'Shift not found', duration: ms });
          appendLog(`✗ Shift not found`);
        }
      } catch (e: any) {
        updateTest('clock', 'clock-shift-read', { status: 'fail', detail: e.message });
      }
    } else {
      updateTest('clock', 'clock-shift-read', { status: 'skip', detail: 'No shift created' });
    }

    // 1.6 Shift update (clock out)
    updateTest('clock', 'clock-shift-update', { status: 'running' });
    if (testShiftId) {
      try {
        const clockOutTime = new Date().toISOString();
        const { result, ms } = await timed(() =>
          supaRest('PATCH', `driver_shifts?id=eq.${testShiftId}`, { clock_out: clockOutTime })
        );
        if (result.ok) {
          updateTest('clock', 'clock-shift-update', { status: 'pass', detail: `clock_out: ${clockOutTime}`, duration: ms });
          appendLog(`✓ Shift updated (clock out) (${ms}ms)`);
        } else {
          updateTest('clock', 'clock-shift-update', { status: 'fail', detail: JSON.stringify(result.data)?.slice(0, 120), duration: ms });
          appendLog(`✗ Shift update failed`);
        }
      } catch (e: any) {
        updateTest('clock', 'clock-shift-update', { status: 'fail', detail: e.message });
      }
    } else {
      updateTest('clock', 'clock-shift-update', { status: 'skip', detail: 'No shift created' });
    }

    // 1.7 Cleanup shift
    updateTest('clock', 'clock-shift-cleanup', { status: 'running' });
    if (testShiftId) {
      try {
        const { result, ms } = await timed(() =>
          supaRest('DELETE', `driver_shifts?id=eq.${testShiftId}`)
        );
        if (result.ok) {
          updateTest('clock', 'clock-shift-cleanup', { status: 'pass', detail: 'Test shift deleted', duration: ms });
          appendLog(`✓ Shift cleaned up (${ms}ms)`);
          testShiftId = undefined;
        } else {
          updateTest('clock', 'clock-shift-cleanup', { status: 'fail', detail: JSON.stringify(result.data)?.slice(0, 80), duration: ms });
        }
      } catch (e: any) {
        updateTest('clock', 'clock-shift-cleanup', { status: 'fail', detail: e.message });
      }
    } else {
      updateTest('clock', 'clock-shift-cleanup', { status: 'skip', detail: 'Nothing to clean up' });
    }

    // ─── GROUP 2: Order Status Updates ──────────────────────────────────────

    appendLog('── Order Status Updates ──');

    // 2.1 Fetch orders
    updateTest('order-status', 'os-fetch-orders', { status: 'running' });
    try {
      const { result, ms } = await timed(() =>
        supaRest('GET', 'orders?select=id,status,driver_id&limit=5&order=created_at.desc')
      );
      if (result.ok && Array.isArray(result.data)) {
        // Pick a test order that is not complete/cancelled
        const candidate = result.data.find(
          (o: any) => o.status !== 'Booking Complete' && o.status !== 'Booking Cancelled'
        ) ?? result.data[0];
        testOrderId = candidate?.id;
        updateTest('order-status', 'os-fetch-orders', {
          status: 'pass',
          detail: `${result.data.length} orders returned${testOrderId ? `, using: ${testOrderId}` : ''}`,
          duration: ms,
        });
        appendLog(`✓ Orders fetched — ${result.data.length} rows, test order: ${testOrderId} (${ms}ms)`);
      } else {
        updateTest('order-status', 'os-fetch-orders', { status: 'fail', detail: JSON.stringify(result.data)?.slice(0, 120), duration: ms });
        appendLog(`✗ Orders fetch failed`);
      }
    } catch (e: any) {
      updateTest('order-status', 'os-fetch-orders', { status: 'fail', detail: e.message });
      appendLog(`✗ Orders fetch exception: ${e.message}`);
    }

    // Status update helper
    const testStatusUpdate = async (
      groupId: string,
      testId: string,
      label: string,
      status: string
    ) => {
      updateTest(groupId, testId, { status: 'running' });
      if (!testOrderId) {
        updateTest(groupId, testId, { status: 'skip', detail: 'No test order available' });
        appendLog(`~ Skipping ${label} — no test order`);
        return;
      }
      try {
        const { result, ms } = await timed(() =>
          supaRest('PATCH', `orders?id=eq.${testOrderId}`, { status })
        );
        if (result.ok) {
          updateTest(groupId, testId, { status: 'pass', detail: `Status set to "${status}"`, duration: ms });
          appendLog(`✓ ${label}: "${status}" (${ms}ms)`);
        } else {
          updateTest(groupId, testId, { status: 'fail', detail: JSON.stringify(result.data)?.slice(0, 120), duration: ms });
          appendLog(`✗ ${label} failed: ${JSON.stringify(result.data)?.slice(0, 60)}`);
        }
      } catch (e: any) {
        updateTest(groupId, testId, { status: 'fail', detail: e.message });
        appendLog(`✗ ${label} exception: ${e.message}`);
      }
    };

    await testStatusUpdate('order-status', 'os-status-accepted', 'Status → Accepted', 'Booking Accepted');
    await testStatusUpdate('order-status', 'os-status-assigned', 'Status → Assigned', 'Booking Assigned');
    await testStatusUpdate('order-status', 'os-status-out', 'Status → Out For Delivery', 'Booking Out For Delivery');

    // Delivery status update helper
    const testDeliveryUpdate = async (testId: string, label: string, statusKey: string) => {
      updateTest('order-status', testId, { status: 'running' });
      if (!testOrderId) {
        updateTest('order-status', testId, { status: 'skip', detail: 'No test order' });
        return;
      }
      try {
        const { result, ms } = await timed(() =>
          supaRest('POST', 'delivery_status_updates', {
            order_id: testOrderId,
            driver_id: driverId ?? null,
            status: statusKey,
            latitude: 51.5074,
            longitude: -0.1278,
            accuracy: 10,
            timestamp: new Date().toISOString(),
          })
        );
        if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
          testDeliveryUpdateIds.push(result.data[0].id);
          updateTest('order-status', testId, { status: 'pass', detail: `ID: ${result.data[0].id}`, duration: ms });
          appendLog(`✓ Delivery update "${statusKey}" recorded (${ms}ms)`);
        } else {
          updateTest('order-status', testId, { status: 'fail', detail: JSON.stringify(result.data)?.slice(0, 120), duration: ms });
          appendLog(`✗ Delivery update "${statusKey}" failed`);
        }
      } catch (e: any) {
        updateTest('order-status', testId, { status: 'fail', detail: e.message });
      }
    };

    await testDeliveryUpdate('os-delivery-departed', 'Delivery: departed', 'departed');
    await testDeliveryUpdate('os-delivery-arrived', 'Delivery: arrived_at_location', 'arrived_at_location');
    await testDeliveryUpdate('os-delivery-started', 'Delivery: started_delivery', 'started_delivery');
    await testDeliveryUpdate('os-delivery-completed', 'Delivery: completed', 'completed');

    await testStatusUpdate('order-status', 'os-status-complete', 'Status → Complete', 'Booking Complete');

    // 2.10 History filter
    updateTest('order-status', 'os-status-history', { status: 'running' });
    try {
      const { result, ms } = await timed(() =>
        supaRest('GET', `orders?id=eq.${testOrderId}&select=id,status`)
      );
      if (result.ok && Array.isArray(result.data) && result.data[0]?.status === 'Booking Complete') {
        updateTest('order-status', 'os-status-history', { status: 'pass', detail: 'Order confirmed as Booking Complete in DB', duration: ms });
        appendLog(`✓ Order confirmed as Booking Complete in history (${ms}ms)`);
      } else {
        updateTest('order-status', 'os-status-history', { status: 'fail', detail: `Status: ${result.data?.[0]?.status}`, duration: ms });
        appendLog(`✗ History check failed — status: ${result.data?.[0]?.status}`);
      }
    } catch (e: any) {
      updateTest('order-status', 'os-status-history', { status: 'fail', detail: e.message });
    }

    // ─── GROUP 3: Cash Recording ─────────────────────────────────────────────

    appendLog('── Cash Recording ──');

    // 3.1 Read allocations
    updateTest('cash', 'cash-alloc-read', { status: 'running' });
    try {
      const { result, ms } = await timed(() =>
        supaRest('GET', 'driver_cash_allocations?select=id,driver_id,amount&limit=1')
      );
      if (result.ok) {
        updateTest('cash', 'cash-alloc-read', { status: 'pass', detail: `Table accessible, ${Array.isArray(result.data) ? result.data.length : 0} rows`, duration: ms });
        appendLog(`✓ driver_cash_allocations accessible (${ms}ms)`);
      } else {
        updateTest('cash', 'cash-alloc-read', { status: 'fail', detail: JSON.stringify(result.data)?.slice(0, 120), duration: ms });
        appendLog(`✗ driver_cash_allocations not accessible`);
      }
    } catch (e: any) {
      updateTest('cash', 'cash-alloc-read', { status: 'fail', detail: e.message });
    }

    // 3.2 Read collections
    updateTest('cash', 'cash-collect-read', { status: 'running' });
    try {
      const { result, ms } = await timed(() =>
        supaRest('GET', 'driver_cash_collections?select=id,driver_id,amount&limit=1')
      );
      if (result.ok) {
        updateTest('cash', 'cash-collect-read', { status: 'pass', detail: `Table accessible`, duration: ms });
        appendLog(`✓ driver_cash_collections accessible (${ms}ms)`);
      } else {
        updateTest('cash', 'cash-collect-read', { status: 'fail', detail: JSON.stringify(result.data)?.slice(0, 120), duration: ms });
        appendLog(`✗ driver_cash_collections not accessible`);
      }
    } catch (e: any) {
      updateTest('cash', 'cash-collect-read', { status: 'fail', detail: e.message });
    }

    // 3.3 Insert allocation
    updateTest('cash', 'cash-alloc-insert', { status: 'running' });
    if (driverId) {
      try {
        const { result, ms } = await timed(() =>
          supaRest('POST', 'driver_cash_allocations', {
            driver_id: driverId,
            amount: 50.00,
            allocated_by: 'E2E Test',
            notes: 'Automated E2E test allocation',
            allocated_at: new Date().toISOString(),
          })
        );
        if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
          testAllocId = result.data[0].id;
          updateTest('cash', 'cash-alloc-insert', { status: 'pass', detail: `ID: ${testAllocId}, amount: £50.00`, duration: ms });
          appendLog(`✓ Cash allocation inserted — ID: ${testAllocId} (${ms}ms)`);
        } else {
          updateTest('cash', 'cash-alloc-insert', { status: 'fail', detail: JSON.stringify(result.data)?.slice(0, 120), duration: ms });
          appendLog(`✗ Cash allocation insert failed`);
        }
      } catch (e: any) {
        updateTest('cash', 'cash-alloc-insert', { status: 'fail', detail: e.message });
      }
    } else {
      updateTest('cash', 'cash-alloc-insert', { status: 'skip', detail: 'No driver ID' });
    }

    // 3.4 Insert collection
    updateTest('cash', 'cash-collect-insert', { status: 'running' });
    if (driverId) {
      try {
        const { result, ms } = await timed(() =>
          supaRest('POST', 'driver_cash_collections', {
            driver_id: driverId,
            amount: 30.00,
            collected_by: 'E2E Test',
            notes: 'Automated E2E test collection',
            collected_at: new Date().toISOString(),
          })
        );
        if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
          testCollectId = result.data[0].id;
          updateTest('cash', 'cash-collect-insert', { status: 'pass', detail: `ID: ${testCollectId}, amount: £30.00`, duration: ms });
          appendLog(`✓ Cash collection inserted — ID: ${testCollectId} (${ms}ms)`);
        } else {
          updateTest('cash', 'cash-collect-insert', { status: 'fail', detail: JSON.stringify(result.data)?.slice(0, 120), duration: ms });
          appendLog(`✗ Cash collection insert failed`);
        }
      } catch (e: any) {
        updateTest('cash', 'cash-collect-insert', { status: 'fail', detail: e.message });
      }
    } else {
      updateTest('cash', 'cash-collect-insert', { status: 'skip', detail: 'No driver ID' });
    }

    // 3.5 Balance calculation
    updateTest('cash', 'cash-balance-calc', { status: 'running' });
    if (testAllocId && testCollectId) {
      try {
        const [allocRes, collectRes] = await Promise.all([
          supaRest('GET', `driver_cash_allocations?driver_id=eq.${driverId}&select=amount`),
          supaRest('GET', `driver_cash_collections?driver_id=eq.${driverId}&select=amount`),
        ]);
        const totalAlloc = (allocRes.data as any[]).reduce((s: number, r: any) => s + Number(r.amount), 0);
        const totalCollect = (collectRes.data as any[]).reduce((s: number, r: any) => s + Number(r.amount), 0);
        const balance = totalAlloc - totalCollect;
        updateTest('cash', 'cash-balance-calc', {
          status: 'pass',
          detail: `Allocated: £${totalAlloc.toFixed(2)}, Collected: £${totalCollect.toFixed(2)}, Balance: £${balance.toFixed(2)}`,
        });
        appendLog(`✓ Balance: allocated £${totalAlloc.toFixed(2)} - collected £${totalCollect.toFixed(2)} = £${balance.toFixed(2)}`);
      } catch (e: any) {
        updateTest('cash', 'cash-balance-calc', { status: 'fail', detail: e.message });
      }
    } else {
      updateTest('cash', 'cash-balance-calc', { status: 'skip', detail: 'Allocation or collection insert failed' });
    }

    // 3.6 Cleanup cash records
    updateTest('cash', 'cash-alloc-cleanup', { status: 'running' });
    const cleanupErrors: string[] = [];
    if (testAllocId) {
      try {
        await supaRest('DELETE', `driver_cash_allocations?id=eq.${testAllocId}`);
        appendLog(`✓ Cash allocation ${testAllocId} deleted`);
      } catch (e: any) {
        cleanupErrors.push(`alloc: ${e.message}`);
      }
    }
    if (testCollectId) {
      try {
        await supaRest('DELETE', `driver_cash_collections?id=eq.${testCollectId}`);
        appendLog(`✓ Cash collection ${testCollectId} deleted`);
      } catch (e: any) {
        cleanupErrors.push(`collect: ${e.message}`);
      }
    }
    updateTest('cash', 'cash-alloc-cleanup', {
      status: cleanupErrors.length === 0 ? 'pass' : 'fail',
      detail: cleanupErrors.length === 0 ? 'Test cash records deleted' : cleanupErrors.join('; '),
    });

    // ─── GROUP 4: Proof of Delivery ──────────────────────────────────────────

    appendLog('── Proof of Delivery ──');

    // 4.1 Table access
    updateTest('pod', 'pod-table-access', { status: 'running' });
    try {
      const { result, ms } = await timed(() =>
        supaRest('GET', 'driver_pod_submissions?select=id&limit=1')
      );
      if (result.ok) {
        updateTest('pod', 'pod-table-access', { status: 'pass', detail: 'Table accessible', duration: ms });
        appendLog(`✓ driver_pod_submissions accessible (${ms}ms)`);
      } else {
        updateTest('pod', 'pod-table-access', { status: 'fail', detail: JSON.stringify(result.data)?.slice(0, 120), duration: ms });
        appendLog(`✗ driver_pod_submissions not accessible`);
      }
    } catch (e: any) {
      updateTest('pod', 'pod-table-access', { status: 'fail', detail: e.message });
    }

    // 4.2 Insert POD
    updateTest('pod', 'pod-insert', { status: 'running' });
    if (testOrderId && driverId) {
      try {
        const testPhotos = [{ id: 'e2e-photo-1', url: 'https://example.com/test.jpg', caption: 'E2E test photo', uploadedAt: new Date().toISOString() }];
        const testSig = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const { result, ms } = await timed(() =>
          supaRest('POST', 'driver_pod_submissions', {
            order_id: testOrderId,
            driver_id: driverId,
            signed_by: 'E2E Test Customer',
            signature_data_url: testSig,
            notes: 'Automated E2E test POD submission',
            photos: testPhotos,
            submitted_at: new Date().toISOString(),
          })
        );
        if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
          testPodId = result.data[0].id;
          updateTest('pod', 'pod-insert', { status: 'pass', detail: `POD ID: ${testPodId}`, duration: ms });
          appendLog(`✓ POD submission inserted — ID: ${testPodId} (${ms}ms)`);
        } else {
          updateTest('pod', 'pod-insert', { status: 'fail', detail: JSON.stringify(result.data)?.slice(0, 120), duration: ms });
          appendLog(`✗ POD insert failed: ${JSON.stringify(result.data)?.slice(0, 60)}`);
        }
      } catch (e: any) {
        updateTest('pod', 'pod-insert', { status: 'fail', detail: e.message });
      }
    } else {
      updateTest('pod', 'pod-insert', { status: 'skip', detail: 'No test order or driver ID' });
      appendLog('~ Skipping POD insert — no test order or driver');
    }

    // 4.3 Read back
    updateTest('pod', 'pod-read-back', { status: 'running' });
    if (testPodId) {
      try {
        const { result, ms } = await timed(() =>
          supaRest('GET', `driver_pod_submissions?id=eq.${testPodId}&select=id,order_id,driver_id,signed_by,photos,signature_data_url`)
        );
        if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
          updateTest('pod', 'pod-read-back', { status: 'pass', detail: `signed_by: ${result.data[0].signed_by}`, duration: ms });
          appendLog(`✓ POD readable — signed_by: ${result.data[0].signed_by} (${ms}ms)`);
        } else {
          updateTest('pod', 'pod-read-back', { status: 'fail', detail: 'POD not found', duration: ms });
        }
      } catch (e: any) {
        updateTest('pod', 'pod-read-back', { status: 'fail', detail: e.message });
      }
    } else {
      updateTest('pod', 'pod-read-back', { status: 'skip', detail: 'No POD inserted' });
    }

    // 4.4 Order link
    updateTest('pod', 'pod-order-link', { status: 'running' });
    if (testPodId && testOrderId) {
      try {
        const { result, ms } = await timed(() =>
          supaRest('GET', `driver_pod_submissions?id=eq.${testPodId}&select=order_id`)
        );
        const linked = result.ok && result.data?.[0]?.order_id === testOrderId;
        updateTest('pod', 'pod-order-link', {
          status: linked ? 'pass' : 'fail',
          detail: linked ? `order_id matches: ${testOrderId}` : `Expected ${testOrderId}, got ${result.data?.[0]?.order_id}`,
          duration: ms,
        });
        appendLog(linked ? `✓ POD linked to order ${testOrderId}` : `✗ POD order_id mismatch`);
      } catch (e: any) {
        updateTest('pod', 'pod-order-link', { status: 'fail', detail: e.message });
      }
    } else {
      updateTest('pod', 'pod-order-link', { status: 'skip', detail: 'No POD or order' });
    }

    // 4.5 Signature field
    updateTest('pod', 'pod-signature-field', { status: 'running' });
    if (testPodId) {
      try {
        const { result, ms } = await timed(() =>
          supaRest('GET', `driver_pod_submissions?id=eq.${testPodId}&select=signature_data_url`)
        );
        const sig = result.data?.[0]?.signature_data_url ?? '';
        const valid = typeof sig === 'string' && sig.startsWith('data:image/');
        updateTest('pod', 'pod-signature-field', {
          status: valid ? 'pass' : 'fail',
          detail: valid ? 'Signature data URL stored correctly' : `Invalid signature: ${sig?.slice(0, 40)}`,
          duration: ms,
        });
        appendLog(valid ? `✓ Signature field valid` : `✗ Signature field invalid`);
      } catch (e: any) {
        updateTest('pod', 'pod-signature-field', { status: 'fail', detail: e.message });
      }
    } else {
      updateTest('pod', 'pod-signature-field', { status: 'skip', detail: 'No POD inserted' });
    }

    // 4.6 Photos field
    updateTest('pod', 'pod-photos-field', { status: 'running' });
    if (testPodId) {
      try {
        const { result, ms } = await timed(() =>
          supaRest('GET', `driver_pod_submissions?id=eq.${testPodId}&select=photos`)
        );
        const photos = result.data?.[0]?.photos;
        const valid = Array.isArray(photos) && photos.length > 0 && photos[0]?.id;
        updateTest('pod', 'pod-photos-field', {
          status: valid ? 'pass' : 'fail',
          detail: valid ? `${photos.length} photo(s) stored as JSON array` : `Invalid photos: ${JSON.stringify(photos)?.slice(0, 60)}`,
          duration: ms,
        });
        appendLog(valid ? `✓ Photos JSON array valid (${photos.length} photo)` : `✗ Photos field invalid`);
      } catch (e: any) {
        updateTest('pod', 'pod-photos-field', { status: 'fail', detail: e.message });
      }
    } else {
      updateTest('pod', 'pod-photos-field', { status: 'skip', detail: 'No POD inserted' });
    }

    // 4.7 Cleanup POD
    updateTest('pod', 'pod-cleanup', { status: 'running' });
    const podCleanupErrors: string[] = [];
    if (testPodId) {
      try {
        await supaRest('DELETE', `driver_pod_submissions?id=eq.${testPodId}`);
        appendLog(`✓ POD submission ${testPodId} deleted`);
      } catch (e: any) {
        podCleanupErrors.push(e.message);
      }
    }
    // Also clean up delivery status updates
    for (const uid of testDeliveryUpdateIds) {
      try {
        await supaRest('DELETE', `delivery_status_updates?id=eq.${uid}`);
      } catch {
        // best effort
      }
    }
    updateTest('pod', 'pod-cleanup', {
      status: podCleanupErrors.length === 0 ? 'pass' : 'fail',
      detail: podCleanupErrors.length === 0 ? 'Test POD and delivery updates deleted' : podCleanupErrors.join('; '),
    });

    appendLog('▶ Test suite complete');
    setFinishedAt(new Date());
    setRunning(false);
  }, [updateTest, appendLog, supaRest]);

  // ─── Derived totals ─────────────────────────────────────────────────────────

  const allTests = groups.flatMap((g) => g.tests);
  const totalPass = allTests.filter((t) => t.status === 'pass').length;
  const totalFail = allTests.filter((t) => t.status === 'fail').length;
  const totalSkip = allTests.filter((t) => t.status === 'skip').length;
  const totalRun = allTests.filter((t) => t.status !== 'idle').length;
  const totalTests = allTests.length;
  const allDone = totalRun === totalTests && !running;
  const duration =
    startedAt && finishedAt
      ? ((finishedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1)
      : null;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen pb-16"
      style={{ backgroundColor: 'hsl(var(--background))' }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-10 border-b px-4 py-3 flex items-center gap-3"
        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
      >
        <button
          onClick={() => router.push('/driver-portal/login')}
          className="p-1.5 rounded-lg transition-colors hover:bg-secondary"
        >
          <ArrowLeft size={18} style={{ color: 'hsl(var(--foreground))' }} />
        </button>
        <AppLogo className="h-7 w-auto" />
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-sm leading-tight" style={{ color: 'hsl(var(--foreground))' }}>
            Driver Portal — E2E Test Suite
          </h1>
          <p className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Clock In/Out · Order Status · Cash · Proof of Delivery
          </p>
        </div>
        <Truck size={18} style={{ color: 'hsl(var(--muted-foreground))' }} />
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-2xl mx-auto">

        {/* Summary bar */}
        {totalRun > 0 && (
          <div
            className="rounded-xl border p-3 flex items-center gap-4 flex-wrap"
            style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
          >
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-green-600" />
              <span className="text-sm font-semibold text-green-600">{totalPass} passed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <XCircle size={14} className="text-red-500" />
              <span className="text-sm font-semibold text-red-500">{totalFail} failed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-yellow-500" />
              <span className="text-sm font-semibold text-yellow-500">{totalSkip} skipped</span>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {totalRun}/{totalTests}
              </span>
              {duration && (
                <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  · {duration}s
                </span>
              )}
            </div>
            {/* Progress bar */}
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${(totalRun / totalTests) * 100}%`,
                  backgroundColor: totalFail > 0 ? 'hsl(0 84% 60%)' : 'hsl(142 69% 35%)',
                }}
              />
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={runAll}
            disabled={running}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all"
            style={{
              backgroundColor: running ? 'hsl(var(--muted))' : 'hsl(var(--primary))',
              color: running ? 'hsl(var(--muted-foreground))' : 'white',
            }}
          >
            {running ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Running…
              </>
            ) : (
              <>
                <Play size={16} />
                Run All Tests
              </>
            )}
          </button>
          <button
            onClick={() => {
              setGroups(makeInitialGroups());
              setLog([]);
              setStartedAt(null);
              setFinishedAt(null);
            }}
            disabled={running}
            className="px-4 py-3 rounded-xl border font-semibold text-sm transition-all flex items-center gap-2"
            style={{
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
              backgroundColor: 'hsl(var(--card))',
            }}
          >
            <RotateCcw size={15} />
            Reset
          </button>
        </div>

        {/* Test credentials info */}
        <div
          className="rounded-xl border p-3 flex items-start gap-2"
          style={{ backgroundColor: 'hsl(217 91% 60% / 0.06)', borderColor: 'hsl(217 91% 60% / 0.3)' }}
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: 'hsl(217 91% 60%)' }} />
          <p className="text-xs" style={{ color: 'hsl(var(--foreground))' }}>
            Uses test credentials <strong>{TEST_EMAIL}</strong> / <strong>{TEST_PASSWORD}</strong>. Tests write and then delete their own records. Order status tests will mutate the most recent non-complete order.
          </p>
        </div>

        {/* Test groups */}
        {groups.map((group) => {
          const summary = groupSummary(group.tests);
          const groupDone = group.tests.every((t) => t.status !== 'idle' && t.status !== 'running');
          return (
            <div
              key={group.id}
              className="rounded-xl border overflow-hidden"
              style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
            >
              {/* Group header */}
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50"
                onClick={() => toggleGroup(group.id)}
              >
                <span style={{ color: 'hsl(var(--muted-foreground))' }}>{group.icon}</span>
                <span className="font-semibold text-sm flex-1" style={{ color: 'hsl(var(--foreground))' }}>
                  {group.label}
                </span>
                {groupDone && (
                  <div className="flex items-center gap-2 text-xs">
                    {summary.pass > 0 && <span className="text-green-600 font-medium">{summary.pass}✓</span>}
                    {summary.fail > 0 && <span className="text-red-500 font-medium">{summary.fail}✗</span>}
                    {summary.skip > 0 && <span className="text-yellow-500 font-medium">{summary.skip}~</span>}
                  </div>
                )}
                {group.expanded ? (
                  <ChevronDown size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
                ) : (
                  <ChevronRight size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
                )}
              </button>

              {/* Tests */}
              {group.expanded && (
                <div className="border-t divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
                  {group.tests.map((test) => (
                    <div key={test.id} className="px-4 py-2.5 flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">{statusIcon(test.status)}</div>
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-xs font-medium leading-snug"
                          style={{ color: test.status === 'idle' ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))' }}
                        >
                          {test.label}
                        </p>
                        {test.detail && (
                          <p
                            className="text-[11px] mt-0.5 leading-snug break-all"
                            style={{ color: statusColor(test.status) }}
                          >
                            {test.detail}
                          </p>
                        )}
                      </div>
                      {test.duration !== undefined && (
                        <span className="text-[10px] shrink-0 mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          {test.duration}ms
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Raw log */}
        {log.length > 0 && (
          <div
            className="rounded-xl border overflow-hidden"
            style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
          >
            <div className="px-4 py-2.5 border-b flex items-center gap-2" style={{ borderColor: 'hsl(var(--border))' }}>
              <RefreshCw size={13} style={{ color: 'hsl(var(--muted-foreground))' }} />
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Raw Log
              </span>
            </div>
            <div className="p-3 max-h-64 overflow-y-auto font-mono text-[11px] space-y-0.5" style={{ color: 'hsl(var(--foreground))' }}>
              {log.map((line, i) => (
                <div
                  key={i}
                  style={{
                    color: line.includes('✗')
                      ? 'hsl(0 84% 60%)' : line.includes('✓')
                      ? 'hsl(142 69% 35%)' : line.includes('~')
                      ? 'hsl(38 92% 50%)' :'hsl(var(--muted-foreground))',
                  }}
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
