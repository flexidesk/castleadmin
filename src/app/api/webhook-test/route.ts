import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy endpoint for the Webhook Tester UI.
 * Forwards GET/POST requests to the local /api/woocommerce/webhook route
 * so the browser doesn't need to make cross-origin requests.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { method, queryParams, postBody } = body as {
      method: 'GET' | 'POST';
      queryParams?: Record<string, string>;
      postBody?: unknown;
    };

    const origin = req.nextUrl.origin;
    let targetUrl = `${origin}/api/woocommerce/webhook`;

    if (method === 'GET' && queryParams) {
      const qs = new URLSearchParams(queryParams).toString();
      if (qs) targetUrl += `?${qs}`;
    }

    const start = Date.now();

    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': req.headers.get('user-agent') ?? 'WebhookTester',
        'X-Forwarded-For': req.headers.get('x-forwarded-for') ?? '127.0.0.1',
      },
    };

    if (method === 'POST' && postBody !== undefined) {
      fetchOptions.body = typeof postBody === 'string' ? postBody : JSON.stringify(postBody);
    }

    const res = await fetch(targetUrl, fetchOptions);
    const duration = Date.now() - start;

    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const contentType = res.headers.get('content-type') ?? '';
    let responseBody: unknown;
    if (contentType.includes('application/json')) {
      responseBody = await res.json();
    } else {
      responseBody = await res.text();
    }

    return NextResponse.json({
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
      body: responseBody,
      duration,
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: 0,
        statusText: 'Proxy Error',
        headers: {},
        body: { error: (err as Error).message },
        duration: 0,
      },
      { status: 200 }
    );
  }
}
