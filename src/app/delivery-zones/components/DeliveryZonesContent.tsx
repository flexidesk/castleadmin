'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MapPin, Plus, Trash2, Edit3, Save, X, User, CheckCircle2, Map as MapIcon, Layers } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LatLng {
  lat: number;
  lng: number;
}

interface DeliveryZone {
  id: string;
  name: string;
  description: string | null;
  color: string;
  polygon_geojson: {
    type: string;
    coordinates: number[][][];
  };
  driver_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface Driver {
  id: string;
  name: string;
  status: string;
  zone: string | null;
}

const ZONE_COLORS = [
  '#3b82f6', '#22c55e', '#f97316', '#a855f7',
  '#ec4899', '#14b8a6', '#eab308', '#ef4444',
];

// ─── Leaflet Map Component ────────────────────────────────────────────────────

interface LeafletMapProps {
  zones: DeliveryZone[];
  drawingPoints: LatLng[];
  isDrawing: boolean;
  selectedZoneId: string | null;
  onMapClick: (lat: number, lng: number) => void;
  onZoneClick: (id: string) => void;
  newZoneColor: string;
}

function LeafletMap({ zones, drawingPoints, isDrawing, selectedZoneId, onMapClick, onZoneClick, newZoneColor }: LeafletMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const zoneLayersRef = useRef<Map<string, any>>(new Map());
  const drawingPolyRef = useRef<any>(null);
  const drawingMarkersRef = useRef<any[]>([]);
  const clickHandlerRef = useRef<((e: any) => void) | null>(null);

  // Keep stable refs to callbacks to avoid stale closures
  const onMapClickRef = useRef(onMapClick);
  const onZoneClickRef = useRef(onZoneClick);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
  useEffect(() => { onZoneClickRef.current = onZoneClick; }, [onZoneClick]);

  // ── Inject Leaflet CSS once ────────────────────────────────────────────────
  useEffect(() => {
    const id = 'leaflet-css';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.crossOrigin = '';
    document.head.appendChild(link);
  }, []);

  // ── Init map once ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    let destroyed = false;

    import('leaflet').then((mod) => {
      if (destroyed || !mapContainerRef.current || mapRef.current) return;
      const L = mod.default;

      // Fix default icon paths
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapContainerRef.current!, {
        center: [52.636, -1.139],
        zoom: 10,
        zoomControl: true,
        preferCanvas: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;

      // Invalidate size after a short delay to handle container layout
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize();
        }
      }, 200);
    });

    return () => {
      destroyed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // ── Drawing click handler ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove previous handler
    if (clickHandlerRef.current) {
      map.off('click', clickHandlerRef.current);
      clickHandlerRef.current = null;
    }

    if (isDrawing) {
      map.getContainer().style.cursor = 'crosshair';
      const handler = (e: any) => {
        onMapClickRef.current(e.latlng.lat, e.latlng.lng);
      };
      clickHandlerRef.current = handler;
      map.on('click', handler);
    } else {
      map.getContainer().style.cursor = '';
    }
  }, [isDrawing]);

  // ── Render existing zones ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    import('leaflet').then((mod) => {
      const L = mod.default;
      if (!mapRef.current) return;

      // Remove old layers
      zoneLayersRef.current.forEach((layer) => {
        try { map.removeLayer(layer); } catch {}
      });
      zoneLayersRef.current.clear();

      zones.forEach((zone) => {
        const coords = zone.polygon_geojson?.coordinates?.[0];
        if (!coords || coords.length < 3) return;

        const latLngs: [number, number][] = coords.map(([lng, lat]: number[]) => [lat, lng]);
        const isSelected = zone.id === selectedZoneId;

        const polygon = L.polygon(latLngs, {
          color: zone.color,
          fillColor: zone.color,
          fillOpacity: isSelected ? 0.35 : 0.2,
          weight: isSelected ? 3 : 1.5,
          dashArray: isSelected ? '6,3' : undefined,
        }).addTo(map);

        polygon.bindTooltip(zone.name, {
          permanent: true,
          direction: 'center',
          className: 'zone-label-tooltip',
        });

        polygon.on('click', (e: any) => {
          L.DomEvent.stopPropagation(e);
          onZoneClickRef.current(zone.id);
        });

        zoneLayersRef.current.set(zone.id, polygon);
      });
    });
  }, [zones, selectedZoneId]);

  // ── Render drawing preview ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    import('leaflet').then((mod) => {
      const L = mod.default;
      if (!mapRef.current) return;

      // Clear previous drawing
      if (drawingPolyRef.current) {
        try { map.removeLayer(drawingPolyRef.current); } catch {}
        drawingPolyRef.current = null;
      }
      drawingMarkersRef.current.forEach((m) => {
        try { map.removeLayer(m); } catch {}
      });
      drawingMarkersRef.current = [];

      if (drawingPoints.length === 0) return;

      const latLngs: [number, number][] = drawingPoints.map((p) => [p.lat, p.lng]);

      if (latLngs.length >= 2) {
        drawingPolyRef.current = L.polygon(latLngs, {
          color: newZoneColor,
          fillColor: newZoneColor,
          fillOpacity: 0.15,
          weight: 2,
          dashArray: '6,4',
        }).addTo(map);
      }

      const dotIcon = L.divIcon({
        className: '',
        html: `<div style="width:12px;height:12px;border-radius:50%;background:${newZoneColor};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });

      drawingPoints.forEach((p) => {
        const marker = L.marker([p.lat, p.lng], { icon: dotIcon, interactive: false }).addTo(map);
        drawingMarkersRef.current.push(marker);
      });
    });
  }, [drawingPoints, newZoneColor]);

  return (
    <>
      <style>{`
        .zone-label-tooltip {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          font-size: 11px;
          font-weight: 700;
          color: #1e293b;
          white-space: nowrap;
          text-shadow: 0 0 3px white, 0 0 3px white;
        }
        .zone-label-tooltip::before { display: none !important; }
        .leaflet-container { border-radius: 0 0 0.75rem 0.75rem; }
        .leaflet-control-attribution { font-size: 9px; }
      `}</style>
      <div
        ref={mapContainerRef}
        style={{ width: '100%', height: '100%', minHeight: '440px' }}
      />
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DeliveryZonesContent() {
  const supabase = createClient();
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<LatLng[]>([]);

  // Selected / editing
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);
  const [showNewZoneForm, setShowNewZoneForm] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneDesc, setNewZoneDesc] = useState('');
  const [newZoneColor, setNewZoneColor] = useState(ZONE_COLORS[0]);
  const [newZoneDriverId, setNewZoneDriverId] = useState<string>('');

  // ─── Load Data ──────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [zonesRes, driversRes] = await Promise.all([
        supabase.from('delivery_zones').select('*').order('created_at', { ascending: true }),
        supabase.from('drivers').select('id, name, status, zone').order('name', { ascending: true }),
      ]);
      if (zonesRes.error) throw new Error(zonesRes.error.message);
      if (driversRes.error) throw new Error(driversRes.error.message);
      if (zonesRes.data) setZones(zonesRes.data);
      if (driversRes.data) setDrivers(driversRes.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to load delivery zones: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Drawing ─────────────────────────────────────────────────────────────────

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setDrawingPoints((prev) => {
      // Check if clicking near first point to close polygon (within ~500m)
      if (prev.length >= 3) {
        const first = prev[0];
        const dist = Math.sqrt(Math.pow(lat - first.lat, 2) + Math.pow(lng - first.lng, 2));
        if (dist < 0.005) {
          setShowNewZoneForm(true);
          setIsDrawing(false);
          return prev;
        }
      }
      return [...prev, { lat, lng }];
    });
  }, []);

  const startDrawing = () => {
    setDrawingPoints([]);
    setIsDrawing(true);
    setShowNewZoneForm(false);
    setSelectedZoneId(null);
    setEditingZone(null);
  };

  const cancelDrawing = () => {
    setIsDrawing(false);
    setDrawingPoints([]);
    setShowNewZoneForm(false);
  };

  const finishDrawing = () => {
    if (drawingPoints.length < 3) {
      toast.error('Draw at least 3 points to create a zone');
      return;
    }
    setShowNewZoneForm(true);
    setIsDrawing(false);
  };

  // ─── Save New Zone ───────────────────────────────────────────────────────────

  const saveNewZone = async () => {
    if (!newZoneName.trim()) { toast.error('Zone name is required'); return; }
    if (drawingPoints.length < 3) { toast.error('Draw a zone on the map first'); return; }
    setSaving(true);
    try {
      const coords = [...drawingPoints, drawingPoints[0]].map((p) => [p.lng, p.lat]);
      const geojson = { type: 'Polygon', coordinates: [coords] };
      const { data, error } = await supabase.from('delivery_zones').insert({
        name: newZoneName.trim(),
        description: newZoneDesc.trim() || null,
        color: newZoneColor,
        polygon_geojson: geojson,
        driver_id: newZoneDriverId || null,
        is_active: true,
      }).select().single();
      if (error) throw error;
      if (data) setZones((prev) => [...prev, data]);
      setNewZoneName('');
      setNewZoneDesc('');
      setNewZoneColor(ZONE_COLORS[0]);
      setNewZoneDriverId('');
      setDrawingPoints([]);
      setShowNewZoneForm(false);
      toast.success('Delivery zone created');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create zone');
    } finally {
      setSaving(false);
    }
  };

  // ─── Update Zone ─────────────────────────────────────────────────────────────

  const saveZoneEdit = async () => {
    if (!editingZone) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('delivery_zones').update({
        name: editingZone.name,
        description: editingZone.description,
        color: editingZone.color,
        driver_id: editingZone.driver_id,
        is_active: editingZone.is_active,
        updated_at: new Date().toISOString(),
      }).eq('id', editingZone.id);
      if (error) throw error;
      setZones((prev) => prev.map((z) => z.id === editingZone.id ? { ...z, ...editingZone } : z));
      setEditingZone(null);
      toast.success('Zone updated');
    } catch {
      toast.error('Failed to update zone');
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete Zone ─────────────────────────────────────────────────────────────

  const deleteZone = async (id: string) => {
    if (!confirm('Delete this delivery zone?')) return;
    try {
      const { error } = await supabase.from('delivery_zones').delete().eq('id', id);
      if (error) throw error;
      setZones((prev) => prev.filter((z) => z.id !== id));
      if (selectedZoneId === id) setSelectedZoneId(null);
      toast.success('Zone deleted');
    } catch {
      toast.error('Failed to delete zone');
    }
  };

  // ─── Toggle Active ────────────────────────────────────────────────────────────

  const toggleZoneActive = async (id: string, active: boolean) => {
    try {
      const { error } = await supabase.from('delivery_zones').update({ is_active: active, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      setZones((prev) => prev.map((z) => z.id === id ? { ...z, is_active: active } : z));
    } catch {
      toast.error('Failed to update zone');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'hsl(var(--primary))' }} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>Delivery Zones</h1>
          <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Draw delivery zones on the map and assign them to drivers
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDrawing ? (
            <>
              <button
                onClick={finishDrawing}
                disabled={drawingPoints.length < 3}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: 'hsl(var(--primary))' }}
              >
                <CheckCircle2 size={15} /> Finish Zone ({drawingPoints.length} pts)
              </button>
              <button
                onClick={cancelDrawing}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
              >
                <X size={15} /> Cancel
              </button>
            </>
          ) : (
            <button
              onClick={startDrawing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: 'hsl(var(--primary))' }}
            >
              <Plus size={15} /> Draw New Zone
            </button>
          )}
        </div>
      </div>

      {/* Drawing instructions */}
      {isDrawing && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border" style={{ backgroundColor: 'hsl(var(--primary) / 0.05)', borderColor: 'hsl(var(--primary) / 0.2)' }}>
          <MapPin size={16} style={{ color: 'hsl(var(--primary))' }} />
          <p className="text-sm" style={{ color: 'hsl(var(--primary))' }}>
            <strong>Drawing mode:</strong> Click on the map to add polygon points ({drawingPoints.length} added).
            {drawingPoints.length >= 3
              ? 'Click "Finish Zone" or click near the first point to close the polygon.' :' Add at least 3 points to define the zone boundary.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map */}
        <div className="lg:col-span-2 space-y-4">
          <div
            className="rounded-xl border overflow-hidden flex flex-col"
            style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', height: '520px' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: 'hsl(var(--border))' }}>
              <div className="flex items-center gap-2">
                <MapIcon size={15} style={{ color: 'hsl(var(--primary))' }} />
                <span className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>Live Zone Map</span>
                {isDrawing && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium animate-pulse" style={{ backgroundColor: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))' }}>
                    Drawing…
                  </span>
                )}
              </div>
              <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {zones.filter((z) => z.is_active).length} active zone{zones.filter((z) => z.is_active).length !== 1 ? 's' : ''}
              </span>
            </div>
            {/* Map fills remaining height */}
            <div className="flex-1 relative" style={{ minHeight: 0 }}>
              <LeafletMap
                zones={zones.filter((z) => z.is_active)}
                drawingPoints={drawingPoints}
                isDrawing={isDrawing}
                selectedZoneId={selectedZoneId}
                onMapClick={handleMapClick}
                onZoneClick={(id) => {
                  setSelectedZoneId(id === selectedZoneId ? null : id);
                  setEditingZone(null);
                }}
                newZoneColor={newZoneColor}
              />
            </div>
          </div>

          {/* New Zone Form */}
          {showNewZoneForm && (
            <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--primary) / 0.3)' }}>
              <h3 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                Save New Zone <span className="font-normal" style={{ color: 'hsl(var(--muted-foreground))' }}>({drawingPoints.length} points drawn)</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Zone Name *</label>
                  <input
                    type="text"
                    value={newZoneName}
                    onChange={(e) => setNewZoneName(e.target.value)}
                    placeholder="e.g. North Zone"
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Assign Driver</label>
                  <select
                    value={newZoneDriverId}
                    onChange={(e) => setNewZoneDriverId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  >
                    <option value="">— No driver assigned —</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Description</label>
                  <input
                    type="text"
                    value={newZoneDesc}
                    onChange={(e) => setNewZoneDesc(e.target.value)}
                    placeholder="Optional description"
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Zone Colour</label>
                  <div className="flex gap-2 flex-wrap">
                    {ZONE_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setNewZoneColor(c)}
                        className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                        style={{
                          backgroundColor: c,
                          borderColor: newZoneColor === c ? 'hsl(var(--foreground))' : 'transparent',
                          boxShadow: newZoneColor === c ? '0 0 0 2px white inset' : undefined,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={cancelDrawing}
                  className="px-4 py-2 rounded-lg text-sm border"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                >
                  Discard
                </button>
                <button
                  onClick={saveNewZone}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                  style={{ backgroundColor: 'hsl(var(--primary))' }}
                >
                  <Save size={14} /> {saving ? 'Saving…' : 'Save Zone'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Zone List / Detail Panel */}
        <div className="space-y-4">
          {/* Zone list */}
          <div className="rounded-xl border" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
              <div className="flex items-center gap-2">
                <Layers size={15} style={{ color: 'hsl(var(--primary))' }} />
                <span className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>Zones ({zones.length})</span>
              </div>
            </div>
            <div className="divide-y" style={{ divideColor: 'hsl(var(--border))' }}>
              {zones.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <MapPin size={24} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>No zones yet. Draw one on the map.</p>
                </div>
              ) : (
                zones.map((zone) => {
                  const driver = drivers.find((d) => d.id === zone.driver_id);
                  const isSelected = zone.id === selectedZoneId;
                  return (
                    <div
                      key={zone.id}
                      className="px-4 py-3 cursor-pointer transition-colors"
                      style={{ backgroundColor: isSelected ? 'hsl(var(--primary) / 0.05)' : undefined }}
                      onClick={() => { setSelectedZoneId(isSelected ? null : zone.id); setEditingZone(null); }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: zone.color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: 'hsl(var(--foreground))' }}>{zone.name}</p>
                          <p className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            {driver ? driver.name : 'No driver assigned'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                            style={zone.is_active
                              ? { backgroundColor: '#dcfce7', color: '#16a34a' }
                              : { backgroundColor: '#f1f5f9', color: '#64748b' }}
                          >
                            {zone.is_active ? 'Active' : 'Off'}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingZone({ ...zone }); setSelectedZoneId(zone.id); }}
                            className="p-1 rounded hover:bg-secondary"
                            title="Edit zone"
                          >
                            <Edit3 size={13} style={{ color: 'hsl(var(--muted-foreground))' }} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteZone(zone.id); }}
                            className="p-1 rounded hover:bg-destructive/10"
                            title="Delete zone"
                          >
                            <Trash2 size={13} style={{ color: 'hsl(var(--destructive))' }} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Edit Zone Panel */}
          {editingZone && (
            <div className="rounded-xl border p-4 space-y-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Edit Zone</h3>
                <button onClick={() => setEditingZone(null)}>
                  <X size={15} style={{ color: 'hsl(var(--muted-foreground))' }} />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Name</label>
                  <input
                    type="text"
                    value={editingZone.name}
                    onChange={(e) => setEditingZone((z) => z ? { ...z, name: e.target.value } : z)}
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Description</label>
                  <input
                    type="text"
                    value={editingZone.description ?? ''}
                    onChange={(e) => setEditingZone((z) => z ? { ...z, description: e.target.value } : z)}
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Assign Driver</label>
                  <select
                    value={editingZone.driver_id ?? ''}
                    onChange={(e) => setEditingZone((z) => z ? { ...z, driver_id: e.target.value || null } : z)}
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  >
                    <option value="">— No driver —</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Colour</label>
                  <div className="flex gap-2 flex-wrap">
                    {ZONE_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setEditingZone((z) => z ? { ...z, color: c } : z)}
                        className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                        style={{
                          backgroundColor: c,
                          borderColor: editingZone.color === c ? 'hsl(var(--foreground))' : 'transparent',
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Active</span>
                  <button
                    onClick={() => setEditingZone((z) => z ? { ...z, is_active: !z.is_active } : z)}
                    className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                    style={{ backgroundColor: editingZone.is_active ? 'hsl(var(--primary))' : 'hsl(var(--border))' }}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${editingZone.is_active ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingZone(null)}
                  className="flex-1 px-3 py-2 rounded-lg text-sm border"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveZoneEdit}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                  style={{ backgroundColor: 'hsl(var(--primary))' }}
                >
                  <Save size={13} /> {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {/* Driver Coverage Summary */}
          <div className="rounded-xl border p-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
              <User size={14} style={{ color: 'hsl(var(--primary))' }} /> Driver Coverage
            </h3>
            <div className="space-y-2">
              {drivers.slice(0, 6).map((driver) => {
                const driverZones = zones.filter((z) => z.driver_id === driver.id);
                return (
                  <div key={driver.id} className="flex items-center justify-between">
                    <span className="text-xs truncate" style={{ color: 'hsl(var(--foreground))' }}>{driver.name}</span>
                    {driverZones.length > 0 ? (
                      <div className="flex items-center gap-1">
                        {driverZones.map((z) => (
                          <span key={z.id} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: z.color }} title={z.name} />
                        ))}
                        <span className="text-[10px] ml-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          {driverZones.length} zone{driverZones.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>No zone</span>
                    )}
                  </div>
                );
              })}
              {drivers.length === 0 && (
                <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>No drivers found</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
