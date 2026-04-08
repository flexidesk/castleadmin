'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';

interface BrandingConfig {
  logoUrl: string | null;
  appName: string;
  loading: boolean;
  refresh: () => void;
}

const BrandingContext = createContext<BrandingConfig>({
  logoUrl: null,
  appName: 'CastleAdmin',
  loading: true,
  refresh: () => {},
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [appName, setAppName] = useState('CastleAdmin');
  const [loading, setLoading] = useState(true);

  const fetchBranding = useCallback(async () => {
    try {
      const db = createClient();
      const { data } = await db
        .from('fleet_config')
        .select('app_logo_url, company_name')
        .limit(1)
        .maybeSingle();

      if (data?.app_logo_url) setLogoUrl(data.app_logo_url);
      if (data?.company_name) setAppName(data.company_name);
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  return (
    <BrandingContext.Provider value={{ logoUrl, appName, loading, refresh: fetchBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
