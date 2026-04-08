import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@/lib/db/server';

function initVapid(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL || 'admin@castleadmin.com';

  if (!publicKey || !privateKey || publicKey === 'your-vapid-public-key-here') {
    return false;
  }

  try {
    webpush.setVapidDetails(`mailto:${email}`, publicKey, privateKey);
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { title, message } = await req.json();

    if (!title || !message) {
      return NextResponse.json({ error: 'title and message are required' }, { status: 400 });
    }

    const db = await createClient();

    const { data: drivers } = await db
      .from('drivers')
      .select('id, name, email')
      .eq('status', 'active');

    const { data: staff } = await db
      .from('staff')
      .select('id, name, email')
      .eq('status', 'active');

    const driverCount = drivers?.length ?? 0;
    const staffCount = staff?.length ?? 0;
    const totalRecipients = driverCount + staffCount;

    const driverNotifications = (drivers ?? []).map((d: any) => ({
      alert_type: 'admin_alert',
      title,
      message,
      driver_id: d.id,
      metadata: JSON.stringify({ severity: 'info', broadcast: true, recipient_type: 'driver' }),
      is_dismissed: false,
      is_archived: false,
    }));

    const staffNotifications = (staff ?? []).map((s: any) => ({
      alert_type: 'admin_alert',
      title,
      message,
      metadata: JSON.stringify({ severity: 'info', broadcast: true, recipient_type: 'staff', staff_id: s.id }),
      is_dismissed: false,
      is_archived: false,
    }));

    const broadcastNotification = {
      alert_type: 'admin_alert',
      title,
      message,
      metadata: JSON.stringify({
        severity: 'info',
        broadcast: true,
        recipient_type: 'all',
        driver_count: driverCount,
        staff_count: staffCount,
      }),
      is_dismissed: false,
      is_archived: false,
    };

    const allNotifications = [...driverNotifications, ...staffNotifications, broadcastNotification];

    if (allNotifications.length > 0) {
      await db.from('notifications').insert(allNotifications);
    }

    let pushSent = 0;
    let pushTotal = 0;

    if (initVapid()) {
      const { data: subscriptions } = await db
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth');

      if (subscriptions && subscriptions.length > 0) {
        pushTotal = subscriptions.length;
        const payload = JSON.stringify({
          title,
          body: message,
          icon: '/icons/icon.svg',
          badge: '/icons/icon.svg',
          tag: 'test-broadcast',
          data: { broadcast: true },
          requireInteraction: false,
        });

        const results = await Promise.allSettled(
          subscriptions.map((sub: any) =>
            webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload
            )
          )
        );

        const expiredEndpoints: string[] = [];
        results.forEach((result, i) => {
          if (result.status === 'rejected') {
            const err = result.reason as { statusCode?: number };
            if (err?.statusCode === 410 || err?.statusCode === 404) {
              expiredEndpoints.push(subscriptions[i].endpoint);
            }
          }
        });

        if (expiredEndpoints.length > 0) {
          await db.from('push_subscriptions').delete().in('endpoint', expiredEndpoints);
        }

        pushSent = results.filter((r) => r.status === 'fulfilled').length;
      }
    }

    return NextResponse.json({
      success: true,
      recipients: { drivers: driverCount, staff: staffCount, total: totalRecipients },
      push: { sent: pushSent, total: pushTotal },
    });
  } catch (err) {
    console.error('test-broadcast error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
