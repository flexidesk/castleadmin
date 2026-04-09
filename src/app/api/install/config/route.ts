import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const configDir = path.join(process.cwd(), 'storage');
const configPath = path.join(configDir, 'install-config.json');

function ensureConfigDir() {
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

function sanitizeConfig(data: any) {
  return {
    DB_HOST: String(data.DB_HOST || '').trim(),
    DB_PORT: String(data.DB_PORT || '3306').trim(),
    DB_NAME: String(data.DB_NAME || '').trim(),
    DB_USER: String(data.DB_USER || '').trim(),
    DB_PASSWORD: String(data.DB_PASSWORD || ''),
    DATABASE_SSL: data.DATABASE_SSL ? 'true' : 'false',
  };
}

export async function GET() {
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);

      return NextResponse.json({
        config: {
          DB_HOST: parsed.DB_HOST || '',
          DB_PORT: parsed.DB_PORT || '3306',
          DB_NAME: parsed.DB_NAME || '',
          DB_USER: parsed.DB_USER || '',
          DATABASE_SSL: parsed.DATABASE_SSL || 'false',
        },
      });
    }

    return NextResponse.json({
      config: {
        DB_HOST: process.env.DB_HOST || '',
        DB_PORT: process.env.DB_PORT || '3306',
        DB_NAME: process.env.DB_NAME || '',
        DB_USER: process.env.DB_USER || '',
        DATABASE_SSL: process.env.DATABASE_SSL || 'false',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to load installer config' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const config = sanitizeConfig(body);

    const missing = ['DB_HOST', 'DB_NAME', 'DB_USER'].filter(
      (key) => !config[key as keyof typeof config]
    );
    if (missing.length) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(', ')}` },
        { status: 400 }
      );
    }

    ensureConfigDir();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to save installer config' },
      { status: 500 }
    );
  }
}
