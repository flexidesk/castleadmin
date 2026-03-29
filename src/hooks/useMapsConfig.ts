'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface MapsConfig {
  useGoogleMaps: boolean;
  apiKey: string | null;
}

let cachedConfig: MapsConfig | null = null;
let fetchPromise: Promise<MapsConfig> | null = null;

async function fetchMapsConfig(): Promise<MapsConfig> {
  if (cachedConfig) return cachedConfig;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase.
      from('system_integrations').
      select('is_enabled, api_key').
      eq('slug', 'google-maps').
      maybeSingle();

      const config: MapsConfig = {
        useGoogleMaps: !!(data?.is_enabled && data?.api_key),
        apiKey: data?.api_key ?? null
      };
      cachedConfig = config;
      return config;
    } catch {
      return { useGoogleMaps: false, apiKey: null };
    }
  })();

  return fetchPromise;
}

export function useMapsConfig(): MapsConfig & {loading: boolean;} {
  const [config, setConfig] = useState<MapsConfig>({ useGoogleMaps: false, apiKey: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMapsConfig().then((cfg) => {
      setConfig(cfg);
      setLoading(false);
    });
  }, []);

  return { ...config, loading };
}

/**
 * Returns the Leaflet tile layer URL and attribution based on maps config.
 * Google Maps tiles work via Leaflet without an API key (uses public tile servers).
 * For geocoding, use googleGeocode() when useGoogleMaps is true.
 */
export function getTileLayerConfig(useGoogleMaps: boolean): {
  url: string;
  attribution: string;
  maxZoom: number;
  subdomains?: string;
} {
  if (useGoogleMaps) {
    return {
      url: 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
      attribution: '© <a href="https://maps.google.com">Google Maps</a>',
      maxZoom: 20,
      subdomains: '0123'
    };
  }
  return {
    url: "https://img.rocket.new/generatedImages/rocket_gen_img_1ccd4453f-1765997373689.png",
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  };
}

/**
 * Geocode an address using Google Maps Geocoding API.
 * Returns [lat, lng] or null if not found.
 */
export async function googleGeocode(query: string, apiKey: string): Promise<[number, number] | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'OK' && data.results?.length > 0) {
      const { lat, lng } = data.results[0].geometry.location;
      return [lat, lng];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Geocode using either Google Maps or Nominatim depending on config.
 */
export async function geocodeAddress(
query: string,
config: MapsConfig,
nominatimHeaders?: Record<string, string>)
: Promise<[number, number] | null> {
  if (config.useGoogleMaps && config.apiKey) {
    return googleGeocode(query, config.apiKey);
  }
  // Fallback to Nominatim
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
      { headers: nominatimHeaders ?? {} }
    );
    const results = await res.json();
    if (!results?.length) return null;
    return [parseFloat(results[0].lat), parseFloat(results[0].lon)];
  } catch {
    return null;
  }
}