import { NextRequest, NextResponse } from 'next/server';

// Inline SVG castle icon — same design as public/icons/icon.svg
function buildSvg(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
  <rect width="512" height="512" rx="80" fill="#1e3a5f"/>
  <rect x="40" y="40" width="432" height="432" rx="60" fill="#1e40af"/>
  <rect x="156" y="200" width="60" height="160" fill="#ffffff"/>
  <rect x="296" y="200" width="60" height="160" fill="#ffffff"/>
  <rect x="136" y="160" width="100" height="50" fill="#ffffff"/>
  <rect x="276" y="160" width="100" height="50" fill="#ffffff"/>
  <rect x="136" y="140" width="20" height="30" fill="#ffffff"/>
  <rect x="166" y="140" width="20" height="30" fill="#ffffff"/>
  <rect x="196" y="140" width="20" height="30" fill="#ffffff"/>
  <rect x="276" y="140" width="20" height="30" fill="#ffffff"/>
  <rect x="306" y="140" width="20" height="30" fill="#ffffff"/>
  <rect x="336" y="140" width="20" height="30" fill="#ffffff"/>
  <rect x="216" y="280" width="80" height="80" rx="40" fill="#1e40af"/>
  <rect x="216" y="300" width="80" height="60" fill="#1e40af"/>
  <rect x="170" y="340" width="172" height="20" fill="#60a5fa"/>
  <path d="M220 390 L248 418 L292 370" stroke="#60a5fa" stroke-width="18" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const size = Math.min(Math.max(parseInt(searchParams.get('size') || '192', 10), 16), 512);

  const svg = buildSvg(size);

  // Return SVG with image/png content-type workaround:
  // Browsers accept SVG served as image/svg+xml in manifests, but Chrome's
  // installability checker requires image/png for the 192 and 512 icons.
  // We serve the SVG with the correct PNG content-type via a data-URI redirect
  // so the browser renders it as a raster image.
  //
  // The cleanest cross-platform solution: serve the SVG as SVG (image/svg+xml)
  // but declare it as PNG in the manifest — Chrome 2024+ accepts SVG icons.
  // For maximum compatibility we serve actual SVG bytes with image/svg+xml.

  return new NextResponse(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}
