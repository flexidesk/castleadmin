import nodemailer from 'nodemailer';

// ─── Transporter ─────────────────────────────────────────────────────────────

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// ─── Status Config ────────────────────────────────────────────────────────────

interface StatusConfig {
  subject: string;
  headline: string;
  message: string;
  color: string;
  emoji: string;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  'Booking Accepted': {
    subject: 'Your booking has been accepted',
    headline: 'Booking Accepted',
    message: 'Great news! Your booking has been received and accepted. We will keep you updated as it progresses.',
    color: '#6366f1',
    emoji: '✅',
  },
  'Booking Assigned': {
    subject: 'A driver has been assigned to your booking',
    headline: 'Driver Assigned',
    message: 'A driver has been assigned to your booking. Your delivery is being prepared and will be on its way soon.',
    color: '#f59e0b',
    emoji: '🚗',
  },
  'Booking Out For Delivery': {
    subject: 'Your order is out for delivery',
    headline: 'Out For Delivery',
    message: 'Your order is on its way! Your driver is heading to your address. Please ensure someone is available to receive the delivery.',
    color: '#3b82f6',
    emoji: '🚚',
  },
  'Booking Complete': {
    subject: 'Your order has been delivered',
    headline: 'Delivery Complete',
    message: 'Your order has been successfully delivered. Thank you for choosing us! If you have any questions, please don\'t hesitate to get in touch.',
    color: '#22c55e',
    emoji: '🎉',
  },
  'Payment Pending': {
    subject: 'Payment required for your booking',
    headline: 'Payment Pending',
    message: 'Your booking has a pending payment. Please arrange payment at your earliest convenience to avoid any delays to your delivery.',
    color: '#ef4444',
    emoji: '💳',
  },
};

// ─── HTML Template ────────────────────────────────────────────────────────────

function buildEmailHtml(params: {
  customerName: string;
  orderId: string;
  status: string;
  config: StatusConfig;
  bookingDate?: string;
  deliveryWindow?: string;
}): string {
  const { customerName, orderId, status, config, bookingDate, deliveryWindow } = params;

  const dateStr = bookingDate
    ? new Date(bookingDate).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${config.subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background-color:${config.color};padding:32px 40px;text-align:center;">
              <p style="margin:0;font-size:36px;">${config.emoji}</p>
              <h1 style="margin:12px 0 0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">${config.headline}</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 16px;font-size:16px;color:#111827;">Hi <strong>${customerName}</strong>,</p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">${config.message}</p>

              <!-- Order Details Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Booking Details</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:4px 0;font-size:14px;color:#6b7280;width:40%;">Booking ID</td>
                        <td style="padding:4px 0;font-size:14px;color:#111827;font-weight:600;font-family:monospace;">${orderId}</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;font-size:14px;color:#6b7280;">Status</td>
                        <td style="padding:4px 0;">
                          <span style="display:inline-block;background-color:${config.color}20;color:${config.color};font-size:12px;font-weight:600;padding:2px 10px;border-radius:999px;">${status.replace('Booking ', '')}</span>
                        </td>
                      </tr>
                      ${dateStr ? `
                      <tr>
                        <td style="padding:4px 0;font-size:14px;color:#6b7280;">Booking Date</td>
                        <td style="padding:4px 0;font-size:14px;color:#111827;">${dateStr}</td>
                      </tr>` : ''}
                      ${deliveryWindow ? `
                      <tr>
                        <td style="padding:4px 0;font-size:14px;color:#6b7280;">Delivery Window</td>
                        <td style="padding:4px 0;font-size:14px;color:#111827;">${deliveryWindow}</td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;">
                If you have any questions about your booking, please contact us and reference your booking ID.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;border-top:1px solid #e5e7eb;padding:24px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                This is an automated notification from ${process.env.SMTP_FROM_NAME ?? 'Castle Admin'}.<br/>
                Please do not reply to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sendOrderStatusEmail(params: {
  customerEmail: string;
  customerName: string;
  orderId: string;
  status: string;
  bookingDate?: string;
  deliveryWindow?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { customerEmail, customerName, orderId, status, bookingDate, deliveryWindow } = params;

  const config = STATUS_CONFIG[status];
  if (!config) {
    // No email template for this status — silently skip
    return { success: true };
  }

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('SMTP credentials not configured — skipping email notification');
    return { success: false, error: 'SMTP not configured' };
  }

  try {
    const transporter = createTransporter();
    const html = buildEmailHtml({ customerName, orderId, status, config, bookingDate, deliveryWindow });

    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME ?? 'Castle Admin'}" <${process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER}>`,
      to: customerEmail,
      subject: `${config.emoji} ${config.subject} — ${orderId}`,
      html,
    });

    return { success: true };
  } catch (err: any) {
    console.error('sendOrderStatusEmail error:', err?.message ?? err);
    return { success: false, error: err?.message ?? 'Unknown error' };
  }
}
