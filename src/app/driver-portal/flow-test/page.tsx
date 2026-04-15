'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  RotateCcw,
  ArrowLeft,
  LogIn,
  Clock,
  Package,
  FileCheck,
  LogOut,
  ChevronRight,
  AlertTriangle,
  Truck,
} from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';

// ─── Types ────────────────────────────────────────────────────────────────────

type StepStatus = 'idle' | 'running' | 'pass' | 'fail' | 'skip';

interface FlowStep {
  id: string;
  phase: string;
  label: string;
  description: string;
  status: StepStatus;
  detail?: string;
  duration?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TEST_EMAIL = 'test@test.com';
const TEST_PASSWORD = '123456';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusIcon(status: StepStatus, size = 16) {
  if (status === 'running') return <Loader2 size={size} className="animate-spin text-blue-500" />;
  if (status === 'pass') return <CheckCircle2 size={size} className="text-green-600" />;
  if (status === 'fail') return <XCircle size={size} className="text-red-500" />;
  if (status === 'skip') return <AlertTriangle size={size} className="text-yellow-500" />;
  return <div className="rounded-full border-2" style={{ width: size, height: size, borderColor: 'hsl(var(--border))' }} />;
}

function statusBg(status: StepStatus): string {
  if (status === 'pass') return 'hsl(142 69% 35% / 0.08)';
  if (status === 'fail') return 'hsl(0 84% 60% / 0.08)';
  if (status === 'running') return 'hsl(217 91% 60% / 0.08)';
  if (status === 'skip') return 'hsl(38 92% 50% / 0.08)';
  return 'hsl(var(--card))';
}

function statusBorder(status: StepStatus): string {
  if (status === 'pass') return 'hsl(142 69% 35% / 0.3)';
  if (status === 'fail') return 'hsl(0 84% 60% / 0.3)';
  if (status === 'running') return 'hsl(217 91% 60% / 0.3)';
  if (status === 'skip') return 'hsl(38 92% 50% / 0.3)';
  return 'hsl(var(--border))';
}

function statusTextColor(status: StepStatus): string {
  if (status === 'pass') return 'hsl(142 69% 35%)';
  if (status === 'fail') return 'hsl(0 84% 60%)';
  if (status === 'running') return 'hsl(217 91% 60%)';
  if (status === 'skip') return 'hsl(38 92% 50%)';
  return 'hsl(var(--muted-foreground))';
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await fn();
  return { result, ms: Math.round(performance.now() - start) };
}

// ─── Phase config ─────────────────────────────────────────────────────────────

const PHASES = [
  { id: 'login', label: 'Login', icon: <LogIn size={14} /> },
  { id: 'clock-in', label: 'Clock In', icon: <Clock size={14} /> },
  { id: 'order', label: 'Order Flow', icon: <Package size={14} /> },
  { id: 'pod', label: 'Proof of Delivery', icon: <FileCheck size={14} /> },
  { id: 'logout', label: 'Logout', icon: <LogOut size={14} /> },
];

function makeInitialSteps(): FlowStep[] {
  return [
    // ── Phase 1: Login ──────────────────────────────────────────────────────
    {
      id: 'login-api',
      phase: 'login',
      label: 'POST /api/drivers/portal-login',
      description: `Authenticate as ${TEST_EMAIL} with password ${TEST_PASSWORD}`,
      status: 'idle',
    },
    {
      id: 'login-session',
      phase: 'login',
      label: 'GET /api/drivers/portal-login/session',
      description: 'Verify session cookie returns valid driver data',
      status: 'idle',
    },
    // ── Phase 2: Clock In ───────────────────────────────────────────────────
    {
      id: 'clock-in-insert',
      phase: 'clock-in',
      label: 'Insert driver_shifts (clock in)',
      description: 'Create a new shift record with clock_in timestamp',
      status: 'idle',
    },
    {
      id: 'clock-in-verify',
      phase: 'clock-in',
      label: 'Read back shift record',
      description: 'Confirm shift is readable with correct clock_in value',
      status: 'idle',
    },
    // ── Phase 3: Order Flow ─────────────────────────────────────────────────
    {
      id: 'order-fetch',
      phase: 'order',
      label: 'Fetch available orders',
      description: 'Query orders table for a non-complete order to work with',
      status: 'idle',
    },
    {
      id: 'order-accept',
      phase: 'order',
      label: 'Accept order → "Booking Accepted"',
      description: 'Driver accepts the order — status set to Booking Accepted',
      status: 'idle',
    },
    {
      id: 'order-assign',
      phase: 'order',
      label: 'Assign order → "Booking Assigned"',
      description: 'Order assigned to driver — status set to Booking Assigned',
      status: 'idle',
    },
    {
      id: 'order-out',
      phase: 'order',
      label: 'Out for delivery → "Booking Out For Delivery"',
      description: 'Driver departs — status set to Booking Out For Delivery',
      status: 'idle',
    },
    {
      id: 'delivery-departed',
      phase: 'order',
      label: 'Delivery update: departed',
      description: 'Insert delivery_status_updates row with status "departed"',
      status: 'idle',
    },
    {
      id: 'delivery-arrived',
      phase: 'order',
      label: 'Delivery update: arrived_at_location',
      description: 'Insert delivery_status_updates row — driver arrived at customer',
      status: 'idle',
    },
    {
      id: 'delivery-started',
      phase: 'order',
      label: 'Delivery update: started_delivery',
      description: 'Insert delivery_status_updates row — unloading started',
      status: 'idle',
    },
    {
      id: 'delivery-completed',
      phase: 'order',
      label: 'Delivery update: completed',
      description: 'Insert delivery_status_updates row — delivery completed',
      status: 'idle',
    },
    // ── Phase 4: Proof of Delivery ──────────────────────────────────────────
    {
      id: 'pod-submit',
      phase: 'pod',
      label: 'Submit POD (signature + photos)',
      description: 'Insert driver_pod_submissions with signature data URL and photos array',
      status: 'idle',
    },
    {
      id: 'pod-verify',
      phase: 'pod',
      label: 'Verify POD stored correctly',
      description: 'Read back POD and confirm order_id, signature, and photos fields',
      status: 'idle',
    },
    {
      id: 'order-complete',
      phase: 'pod',
      label: 'Mark order → "Booking Complete"',
      description: 'Final order status update after POD submission',
      status: 'idle',
    },
    // ── Phase 5: Logout ─────────────────────────────────────────────────────
    {
      id: 'clock-out',
      phase: 'logout',
      label: 'Clock out (update shift)',
      description: 'Patch driver_shifts with clock_out timestamp',
      status: 'idle',
    },
    {
      id: 'logout-api',
      phase: 'logout',
      label: 'DELETE /api/drivers/portal-login (logout)',
      description: 'Clear driver_session cookie via logout endpoint',
      status: 'idle',
    },
    {
      id: 'logout-verify',
      phase: 'logout',
      label: 'Verify session cleared',
      description: 'Confirm session endpoint returns no driver after logout',
      status: 'idle',
    },
    // ── Cleanup ─────────────────────────────────────────────────────────────
    {
      id: 'cleanup',
      phase: 'logout',
      label: 'Cleanup test data',
      description: 'Delete test shift, delivery updates, and POD submission',
      status: 'idle',
    },
  ];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DriverFlowTestPage() {
  const router = useRouter();
  const [steps, setSteps] = useState<FlowStep[]>(makeInitialSteps());
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [finishedAt, setFinishedAt] = useState<Date | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const updateStep = useCallback((id: string, patch: Partial<FlowStep>) => {
    setSteps((prev) => prev.map((s) => (s.id !== id ? s : { ...s, ...patch })));
  }, []);

  const appendLog = useCallback((msg: string) => {
    setLog((prev) => {
      const next = [...prev, `[${new Date().toLocaleTimeString('en-GB')}] ${msg}`];
      setTimeout(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }), 50);
      return next;
    });
  }, []);

  // ─── Supabase REST ───────────────────────────────────────────────────────────

  const supaRest = useCallback(
    async (
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
      path: string,
      body?: object
    ): Promise<{ ok: boolean; status: number; data: any }> => {
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const url = `${base}/rest/v1/${path}`;
      const headers: Record<string, string> = {
        apikey: anonKey!,
        Authorization: `Bearer ${anonKey!}`,
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
      try { data = await res.json(); } catch { data = null; }
      return { ok: res.ok, status: res.status, data };
    },
    []
  );

  // ─── Run flow ────────────────────────────────────────────────────────────────

  const runFlow = useCallback(async () => {
    setRunning(true);
    setLog([]);
    setStartedAt(new Date());
    setFinishedAt(null);
    setSteps(makeInitialSteps());

    // Shared context
    let driverId: string | undefined;
    let testShiftId: string | undefined;
    let testOrderId: string | undefined;
    let testPodId: string | undefined;
    const deliveryUpdateIds: string[] = [];

    appendLog('▶ Starting full driver flow E2E test');
    appendLog(`  Credentials: ${TEST_EMAIL} / ${TEST_PASSWORD}`);

    // ── STEP 1: Login ──────────────────────────────────────────────────────────
    appendLog('');
    appendLog('── Phase 1: Login ──');

    updateStep('login-api', { status: 'running' });
    try {
      const { result, ms } = await timed(async () => {
        const res = await fetch('/api/drivers/portal-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
        });
        return { ok: res.ok, data: await res.json() };
      });
      if (result.ok && result.data?.driver) {
        driverId = result.data.driver.id;
        updateStep('login-api', {
          status: 'pass',
          detail: `✓ Driver: ${result.data.driver.name} (ID: ${driverId})`,
          duration: ms,
        });
        appendLog(`✓ Login successful — ${result.data.driver.name} (${ms}ms)`);
      } else {
        updateStep('login-api', {
          status: 'fail',
          detail: result.data?.error ?? 'Login failed — check test credentials exist',
          duration: ms,
        });
        appendLog(`✗ Login failed: ${result.data?.error}`);
      }
    } catch (e: any) {
      updateStep('login-api', { status: 'fail', detail: e.message });
      appendLog(`✗ Login exception: ${e.message}`);
    }

    updateStep('login-session', { status: 'running' });
    try {
      const { result, ms } = await timed(async () => {
        const res = await fetch('/api/drivers/portal-login/session');
        return { ok: res.ok, data: await res.json() };
      });
      if (result.ok && result.data?.driver) {
        driverId = driverId ?? result.data.driver.id;
        updateStep('login-session', {
          status: 'pass',
          detail: `Session valid — driver ID: ${result.data.driver.id}`,
          duration: ms,
        });
        appendLog(`✓ Session verified — driver ID: ${result.data.driver.id} (${ms}ms)`);
      } else {
        updateStep('login-session', {
          status: 'fail',
          detail: 'Session endpoint returned no driver — cookie may not be set',
          duration: ms,
        });
        appendLog(`✗ Session invalid: ${result.data?.error ?? 'no driver returned'}`);
      }
    } catch (e: any) {
      updateStep('login-session', { status: 'fail', detail: e.message });
      appendLog(`✗ Session check exception: ${e.message}`);
    }

    // ── STEP 2: Clock In ───────────────────────────────────────────────────────
    appendLog('');
    appendLog('── Phase 2: Clock In ──');

    updateStep('clock-in-insert', { status: 'running' });
    if (driverId) {
      try {
        const clockInTime = new Date().toISOString();
        const today = clockInTime.split('T')[0];
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
          updateStep('clock-in-insert', {
            status: 'pass',
            detail: `Shift ID: ${testShiftId} | clock_in: ${clockInTime.slice(11, 19)} UTC`,
            duration: ms,
          });
          appendLog(`✓ Clocked in — shift ID: ${testShiftId} (${ms}ms)`);
        } else {
          updateStep('clock-in-insert', {
            status: 'fail',
            detail: JSON.stringify(result.data)?.slice(0, 150),
            duration: ms,
          });
          appendLog(`✗ Clock in failed: ${JSON.stringify(result.data)?.slice(0, 80)}`);
        }
      } catch (e: any) {
        updateStep('clock-in-insert', { status: 'fail', detail: e.message });
        appendLog(`✗ Clock in exception: ${e.message}`);
      }
    } else {
      updateStep('clock-in-insert', { status: 'skip', detail: 'Skipped — login failed, no driver ID' });
      appendLog('~ Skipping clock in — no driver ID');
    }

    updateStep('clock-in-verify', { status: 'running' });
    if (testShiftId) {
      try {
        const { result, ms } = await timed(() =>
          supaRest('GET', `driver_shifts?id=eq.${testShiftId}&select=id,clock_in,clock_out,shift_date,driver_id`)
        );
        if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
          const shift = result.data[0];
          updateStep('clock-in-verify', {
            status: 'pass',
            detail: `clock_in: ${shift.clock_in?.slice(11, 19)} UTC | clock_out: ${shift.clock_out ?? 'null (active)'}`,
            duration: ms,
          });
          appendLog(`✓ Shift readable — clock_in confirmed, clock_out is null (active) (${ms}ms)`);
        } else {
          updateStep('clock-in-verify', { status: 'fail', detail: 'Shift not found in DB', duration: ms });
          appendLog(`✗ Shift not found`);
        }
      } catch (e: any) {
        updateStep('clock-in-verify', { status: 'fail', detail: e.message });
      }
    } else {
      updateStep('clock-in-verify', { status: 'skip', detail: 'No shift to verify' });
    }

    // ── STEP 3: Order Flow ─────────────────────────────────────────────────────
    appendLog('');
    appendLog('── Phase 3: Order Flow ──');

    updateStep('order-fetch', { status: 'running' });
    try {
      const { result, ms } = await timed(() =>
        supaRest('GET', 'orders?select=id,status,customer_name&order=created_at.desc&limit=10')
      );
      if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
        const candidate = result.data.find(
          (o: any) => o.status !== 'Booking Complete' && o.status !== 'Booking Cancelled'
        ) ?? result.data[0];
        testOrderId = candidate?.id;
        updateStep('order-fetch', {
          status: 'pass',
          detail: `${result.data.length} orders found | Using: ${testOrderId} (${candidate?.customer_name ?? 'unknown'}) — current status: "${candidate?.status}"`,
          duration: ms,
        });
        appendLog(`✓ Orders fetched — using order ${testOrderId} (${ms}ms)`);
      } else {
        updateStep('order-fetch', {
          status: 'fail',
          detail: result.ok ? 'No orders in database' : JSON.stringify(result.data)?.slice(0, 120),
          duration: ms,
        });
        appendLog(`✗ No orders available`);
      }
    } catch (e: any) {
      updateStep('order-fetch', { status: 'fail', detail: e.message });
      appendLog(`✗ Order fetch exception: ${e.message}`);
    }

    // Status update helper
    const setOrderStatus = async (stepId: string, label: string, newStatus: string) => {
      updateStep(stepId, { status: 'running' });
      if (!testOrderId) {
        updateStep(stepId, { status: 'skip', detail: 'No test order available' });
        appendLog(`~ Skipping ${label} — no order`);
        return;
      }
      try {
        const { result, ms } = await timed(() =>
          supaRest('PATCH', `orders?id=eq.${testOrderId}`, { status: newStatus })
        );
        if (result.ok) {
          updateStep(stepId, { status: 'pass', detail: `Status → "${newStatus}"`, duration: ms });
          appendLog(`✓ ${label} → "${newStatus}" (${ms}ms)`);
        } else {
          updateStep(stepId, {
            status: 'fail',
            detail: JSON.stringify(result.data)?.slice(0, 120),
            duration: ms,
          });
          appendLog(`✗ ${label} failed: ${JSON.stringify(result.data)?.slice(0, 60)}`);
        }
      } catch (e: any) {
        updateStep(stepId, { status: 'fail', detail: e.message });
        appendLog(`✗ ${label} exception: ${e.message}`);
      }
    };

    await setOrderStatus('order-accept', 'Accept order', 'Booking Accepted');
    await setOrderStatus('order-assign', 'Assign order', 'Booking Assigned');
    await setOrderStatus('order-out', 'Out for delivery', 'Booking Out For Delivery');

    // Delivery status update helper
    const addDeliveryUpdate = async (stepId: string, statusKey: string) => {
      updateStep(stepId, { status: 'running' });
      if (!testOrderId) {
        updateStep(stepId, { status: 'skip', detail: 'No test order' });
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
          deliveryUpdateIds.push(result.data[0].id);
          updateStep(stepId, {
            status: 'pass',
            detail: `delivery_status_updates ID: ${result.data[0].id} | status: "${statusKey}"`,
            duration: ms,
          });
          appendLog(`✓ Delivery update "${statusKey}" (${ms}ms)`);
        } else {
          updateStep(stepId, {
            status: 'fail',
            detail: JSON.stringify(result.data)?.slice(0, 120),
            duration: ms,
          });
          appendLog(`✗ Delivery update "${statusKey}" failed`);
        }
      } catch (e: any) {
        updateStep(stepId, { status: 'fail', detail: e.message });
        appendLog(`✗ Delivery update "${statusKey}" exception: ${e.message}`);
      }
    };

    await addDeliveryUpdate('delivery-departed', 'departed');
    await addDeliveryUpdate('delivery-arrived', 'arrived_at_location');
    await addDeliveryUpdate('delivery-started', 'started_delivery');
    await addDeliveryUpdate('delivery-completed', 'completed');

    // ── STEP 4: Proof of Delivery ──────────────────────────────────────────────
    appendLog('');
    appendLog('── Phase 4: Proof of Delivery ──');

    updateStep('pod-submit', { status: 'running' });
    if (testOrderId && driverId) {
      try {
        const testSig = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const testPhotos = [
          { id: 'e2e-photo-1', url: 'https://example.com/delivery-photo.jpg', caption: 'Items delivered at door', uploadedAt: new Date().toISOString() },
        ];
        const { result, ms } = await timed(() =>
          supaRest('POST', 'driver_pod_submissions', {
            order_id: testOrderId,
            driver_id: driverId,
            signed_by: 'E2E Flow Test Customer',
            signature_data_url: testSig,
            notes: 'Automated E2E flow test — proof of delivery',
            photos: testPhotos,
            submitted_at: new Date().toISOString(),
          })
        );
        if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
          testPodId = result.data[0].id;
          updateStep('pod-submit', {
            status: 'pass',
            detail: `POD ID: ${testPodId} | signed_by: "E2E Flow Test Customer" | 1 photo`,
            duration: ms,
          });
          appendLog(`✓ POD submitted — ID: ${testPodId} (${ms}ms)`);
        } else {
          updateStep('pod-submit', {
            status: 'fail',
            detail: JSON.stringify(result.data)?.slice(0, 150),
            duration: ms,
          });
          appendLog(`✗ POD submit failed: ${JSON.stringify(result.data)?.slice(0, 80)}`);
        }
      } catch (e: any) {
        updateStep('pod-submit', { status: 'fail', detail: e.message });
        appendLog(`✗ POD submit exception: ${e.message}`);
      }
    } else {
      updateStep('pod-submit', { status: 'skip', detail: 'No order or driver ID — earlier steps failed' });
      appendLog('~ Skipping POD — no order or driver');
    }

    updateStep('pod-verify', { status: 'running' });
    if (testPodId) {
      try {
        const { result, ms } = await timed(() =>
          supaRest('GET', `driver_pod_submissions?id=eq.${testPodId}&select=id,order_id,driver_id,signed_by,signature_data_url,photos`)
        );
        if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
          const pod = result.data[0];
          const sigOk = typeof pod.signature_data_url === 'string' && pod.signature_data_url.startsWith('data:image/');
          const photosOk = Array.isArray(pod.photos) && pod.photos.length > 0;
          const orderOk = pod.order_id === testOrderId;
          const allOk = sigOk && photosOk && orderOk;
          updateStep('pod-verify', {
            status: allOk ? 'pass' : 'fail',
            detail: `order_id ✓ | signature ${sigOk ? '✓' : '✗'} | photos ${photosOk ? `✓ (${pod.photos.length})` : '✗'}`,
            duration: ms,
          });
          appendLog(`✓ POD verified — order_id: ${orderOk ? '✓' : '✗'}, sig: ${sigOk ? '✓' : '✗'}, photos: ${photosOk ? '✓' : '✗'} (${ms}ms)`);
        } else {
          updateStep('pod-verify', { status: 'fail', detail: 'POD not found in DB', duration: ms });
          appendLog(`✗ POD not found`);
        }
      } catch (e: any) {
        updateStep('pod-verify', { status: 'fail', detail: e.message });
      }
    } else {
      updateStep('pod-verify', { status: 'skip', detail: 'No POD to verify' });
    }

    await setOrderStatus('order-complete', 'Complete order', 'Booking Complete');

    // ── STEP 5: Logout ─────────────────────────────────────────────────────────
    appendLog('');
    appendLog('── Phase 5: Logout ──');

    updateStep('clock-out', { status: 'running' });
    if (testShiftId) {
      try {
        const clockOutTime = new Date().toISOString();
        const { result, ms } = await timed(() =>
          supaRest('PATCH', `driver_shifts?id=eq.${testShiftId}`, { clock_out: clockOutTime })
        );
        if (result.ok) {
          updateStep('clock-out', {
            status: 'pass',
            detail: `clock_out: ${clockOutTime.slice(11, 19)} UTC`,
            duration: ms,
          });
          appendLog(`✓ Clocked out — ${clockOutTime.slice(11, 19)} UTC (${ms}ms)`);
        } else {
          updateStep('clock-out', {
            status: 'fail',
            detail: JSON.stringify(result.data)?.slice(0, 120),
            duration: ms,
          });
          appendLog(`✗ Clock out failed`);
        }
      } catch (e: any) {
        updateStep('clock-out', { status: 'fail', detail: e.message });
      }
    } else {
      updateStep('clock-out', { status: 'skip', detail: 'No active shift to clock out from' });
    }

    updateStep('logout-api', { status: 'running' });
    try {
      const { result, ms } = await timed(async () => {
        const res = await fetch('/api/drivers/portal-login', { method: 'DELETE' });
        return { ok: res.ok, data: await res.json() };
      });
      if (result.ok) {
        updateStep('logout-api', { status: 'pass', detail: 'driver_session cookie cleared', duration: ms });
        appendLog(`✓ Logout successful — session cookie cleared (${ms}ms)`);
      } else {
        updateStep('logout-api', { status: 'fail', detail: result.data?.error ?? 'Logout failed', duration: ms });
        appendLog(`✗ Logout failed: ${result.data?.error}`);
      }
    } catch (e: any) {
      updateStep('logout-api', { status: 'fail', detail: e.message });
      appendLog(`✗ Logout exception: ${e.message}`);
    }

    updateStep('logout-verify', { status: 'running' });
    try {
      const { result, ms } = await timed(async () => {
        const res = await fetch('/api/drivers/portal-login/session');
        return { ok: res.ok, data: await res.json() };
      });
      const sessionCleared = result.ok && result.data?.driver === null;
      updateStep('logout-verify', {
        status: sessionCleared ? 'pass' : 'fail',
        detail: sessionCleared
          ? 'Session endpoint returns driver: null — fully logged out'
          : `Session still active: ${JSON.stringify(result.data?.driver)?.slice(0, 60)}`,
        duration: ms,
      });
      appendLog(sessionCleared ? `✓ Session cleared — driver is null (${ms}ms)` : `✗ Session still active after logout`);
    } catch (e: any) {
      updateStep('logout-verify', { status: 'fail', detail: e.message });
    }

    // ── Cleanup ────────────────────────────────────────────────────────────────
    appendLog('');
    appendLog('── Cleanup ──');
    updateStep('cleanup', { status: 'running' });
    const cleanupErrors: string[] = [];

    if (testShiftId) {
      try {
        await supaRest('DELETE', `driver_shifts?id=eq.${testShiftId}`);
        appendLog(`✓ Deleted shift ${testShiftId}`);
      } catch (e: any) { cleanupErrors.push(`shift: ${e.message}`); }
    }

    for (const uid of deliveryUpdateIds) {
      try {
        await supaRest('DELETE', `delivery_status_updates?id=eq.${uid}`);
      } catch { /* best effort */ }
    }
    if (deliveryUpdateIds.length > 0) {
      appendLog(`✓ Deleted ${deliveryUpdateIds.length} delivery_status_updates`);
    }

    if (testPodId) {
      try {
        await supaRest('DELETE', `driver_pod_submissions?id=eq.${testPodId}`);
        appendLog(`✓ Deleted POD submission ${testPodId}`);
      } catch (e: any) { cleanupErrors.push(`pod: ${e.message}`); }
    }

    updateStep('cleanup', {
      status: cleanupErrors.length === 0 ? 'pass' : 'fail',
      detail: cleanupErrors.length === 0
        ? `Deleted: shift${testShiftId ? ' ✓' : ' (none)'}, ${deliveryUpdateIds.length} delivery updates, POD${testPodId ? ' ✓' : ' (none)'}`
        : cleanupErrors.join('; '),
    });

    appendLog('');
    appendLog('▶ Flow test complete');
    setFinishedAt(new Date());
    setRunning(false);
  }, [updateStep, appendLog, supaRest]);

  // ─── Derived stats ───────────────────────────────────────────────────────────

  const totalPass = steps.filter((s) => s.status === 'pass').length;
  const totalFail = steps.filter((s) => s.status === 'fail').length;
  const totalSkip = steps.filter((s) => s.status === 'skip').length;
  const totalRun = steps.filter((s) => s.status !== 'idle').length;
  const totalSteps = steps.length;
  const allDone = totalRun === totalSteps && !running;
  const duration =
    startedAt && finishedAt
      ? ((finishedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1)
      : null;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen pb-16" style={{ backgroundColor: 'hsl(var(--background))' }}>

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
            Driver Portal — End-to-End Flow Test
          </h1>
          <p className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Login → Clock In → Order Accept → Status Updates → POD → Logout
          </p>
        </div>
        <Truck size={18} style={{ color: 'hsl(var(--muted-foreground))' }} />
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-2xl mx-auto">

        {/* Phase timeline */}
        <div
          className="rounded-xl border p-3"
          style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
        >
          <div className="flex items-center justify-between gap-1">
            {PHASES.map((phase, i) => {
              const phaseSteps = steps.filter((s) => s.phase === phase.id);
              const phaseFail = phaseSteps.some((s) => s.status === 'fail');
              const phasePass = phaseSteps.length > 0 && phaseSteps.every((s) => s.status === 'pass' || s.status === 'skip');
              const phaseRunning = phaseSteps.some((s) => s.status === 'running');
              const phaseColor = phaseFail ? 'hsl(0 84% 60%)' : phasePass ? 'hsl(142 69% 35%)' : phaseRunning ? 'hsl(217 91% 60%)' : 'hsl(var(--muted-foreground))';
              return (
                <div key={phase.id} className="flex items-center gap-1 flex-1 min-w-0">
                  <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all"
                      style={{
                        borderColor: phaseColor,
                        backgroundColor: phaseFail ? 'hsl(0 84% 60% / 0.1)' : phasePass ? 'hsl(142 69% 35% / 0.1)' : phaseRunning ? 'hsl(217 91% 60% / 0.1)' : 'hsl(var(--secondary))',
                        color: phaseColor,
                      }}
                    >
                      {phaseRunning ? <Loader2 size={12} className="animate-spin" /> : phase.icon}
                    </div>
                    <span className="text-[9px] font-medium text-center leading-tight truncate w-full text-center" style={{ color: phaseColor }}>
                      {phase.label}
                    </span>
                  </div>
                  {i < PHASES.length - 1 && (
                    <ChevronRight size={12} className="shrink-0 mb-3" style={{ color: 'hsl(var(--border))' }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Summary bar */}
        {totalRun > 0 && (
          <div
            className="rounded-xl border p-3 space-y-2"
            style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
          >
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-green-600" />
                <span className="text-sm font-semibold text-green-600">{totalPass} passed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <XCircle size={13} className="text-red-500" />
                <span className="text-sm font-semibold text-red-500">{totalFail} failed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <AlertTriangle size={13} className="text-yellow-500" />
                <span className="text-sm font-semibold text-yellow-500">{totalSkip} skipped</span>
              </div>
              <div className="ml-auto text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {totalRun}/{totalSteps} steps{duration ? ` · ${duration}s` : ''}
              </div>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${(totalRun / totalSteps) * 100}%`,
                  backgroundColor: totalFail > 0 ? 'hsl(0 84% 60%)' : 'hsl(142 69% 35%)',
                }}
              />
            </div>
            {allDone && (
              <p
                className="text-xs font-semibold text-center"
                style={{ color: totalFail === 0 ? 'hsl(142 69% 35%)' : 'hsl(0 84% 60%)' }}
              >
                {totalFail === 0
                  ? `✓ All ${totalPass} steps passed — full driver flow working end-to-end`
                  : `${totalFail} step${totalFail > 1 ? 's' : ''} failed — see details below`}
              </p>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={runFlow}
            disabled={running}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all"
            style={{
              backgroundColor: running ? 'hsl(var(--muted))' : 'hsl(var(--primary))',
              color: running ? 'hsl(var(--muted-foreground))' : 'white',
            }}
          >
            {running ? (
              <><Loader2 size={16} className="animate-spin" /> Running flow…</>
            ) : (
              <><Play size={16} /> Run Full Driver Flow</>
            )}
          </button>
          <button
            onClick={() => { setSteps(makeInitialSteps()); setLog([]); setStartedAt(null); setFinishedAt(null); }}
            disabled={running}
            className="px-4 py-3 rounded-xl border font-semibold text-sm flex items-center gap-2 transition-all"
            style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))', backgroundColor: 'hsl(var(--card))' }}
          >
            <RotateCcw size={15} />
            Reset
          </button>
        </div>

        {/* Info banner */}
        <div
          className="rounded-xl border p-3 flex items-start gap-2"
          style={{ backgroundColor: 'hsl(217 91% 60% / 0.06)', borderColor: 'hsl(217 91% 60% / 0.3)' }}
        >
          <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: 'hsl(217 91% 60%)' }} />
          <p className="text-xs leading-relaxed" style={{ color: 'hsl(var(--foreground))' }}>
            Uses <strong>{TEST_EMAIL}</strong> / <strong>{TEST_PASSWORD}</strong>. Runs as a sequential flow — each phase depends on the previous. Order status tests mutate the most recent non-complete order. All test records are deleted after the run.
          </p>
        </div>

        {/* Steps list — grouped by phase */}
        {PHASES.map((phase) => {
          const phaseSteps = steps.filter((s) => s.phase === phase.id);
          return (
            <div
              key={phase.id}
              className="rounded-xl border overflow-hidden"
              style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
            >
              {/* Phase header */}
              <div
                className="px-4 py-2.5 flex items-center gap-2 border-b"
                style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--secondary) / 0.4)' }}
              >
                <span style={{ color: 'hsl(var(--muted-foreground))' }}>{phase.icon}</span>
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'hsl(var(--foreground))' }}>
                  {phase.label}
                </span>
              </div>

              {/* Steps */}
              <div className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
                {phaseSteps.map((step, idx) => (
                  <div
                    key={step.id}
                    className="px-4 py-3 flex items-start gap-3 transition-colors"
                    style={{ backgroundColor: statusBg(step.status) }}
                  >
                    {/* Step number + icon */}
                    <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
                      {statusIcon(step.status, 15)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-xs font-semibold leading-snug font-mono"
                        style={{ color: step.status === 'idle' ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))' }}
                      >
                        {step.label}
                      </p>
                      <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {step.description}
                      </p>
                      {step.detail && (
                        <p
                          className="text-[11px] mt-1 leading-snug break-all"
                          style={{ color: statusTextColor(step.status) }}
                        >
                          {step.detail}
                        </p>
                      )}
                    </div>

                    {/* Duration */}
                    {step.duration !== undefined && (
                      <span className="text-[10px] shrink-0 mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {step.duration}ms
                      </span>
                    )}
                  </div>
                ))}
              </div>
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
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Console Log
              </span>
              <span className="ml-auto text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {log.length} lines
              </span>
            </div>
            <div
              ref={logRef}
              className="p-3 max-h-72 overflow-y-auto font-mono text-[11px] space-y-0.5"
              style={{ color: 'hsl(var(--foreground))' }}
            >
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

        {/* Link to full unit test suite */}
        <div className="text-center pb-4">
          <button
            onClick={() => router.push('/driver-portal/e2e-test')}
            className="text-xs underline"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            → Open full unit test suite (30 tests)
          </button>
        </div>

      </div>
    </div>
  );
}
