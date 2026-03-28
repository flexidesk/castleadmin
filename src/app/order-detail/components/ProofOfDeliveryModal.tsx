'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { MapPin, CreditCard, Banknote, Upload, PenLine, Trash2, Image as ImageIcon, CheckCircle2, AlertTriangle, RefreshCw, FileCheck, ZoomIn, Loader2, Navigation,  } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import AppImage from '@/components/ui/AppImage';
import { createClient } from '@/lib/supabase/client';
import { AppOrder } from '@/lib/services/ordersService';

interface UploadedImage {
  id: string;
  url: string;
  caption: string;
  uploadedAt: string;
  file?: File;
}

interface GpsCoords {
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface Props {
  open: boolean;
  order: AppOrder;
  onClose: () => void;
  onCompleted: () => void;
}

const DEFAULT_TERMS = `1. Safety: The hirer is responsible for ensuring the bouncy castle is used safely. Adult supervision is required at all times. Maximum user weight and age restrictions must be observed as displayed on the unit.

2. Weather: The bouncy castle must be deflated and not used in wind speeds exceeding 24mph, heavy rain, or lightning. The driver will advise at setup.

3. Footwear: No shoes, sharp objects, face paint, or silly string are permitted on or near the inflatable.

4. Damage: The hirer accepts responsibility for any damage caused through misuse. Accidental damage may be covered under the standard hire agreement — please ask the driver for details.

5. Collection: The inflatable must be accessible and ready for collection within the agreed collection window. Late collection fees may apply.

6. Power: The hirer is responsible for providing a suitable power supply (13A socket within 25 metres) unless a generator has been arranged. Do not use an extension lead longer than 25 metres.

7. Liability: CastleAdmin Ltd accepts no liability for injury arising from misuse of the equipment. By signing, the hirer confirms they have read, understood, and accepted all terms.`;

export default function ProofOfDeliveryModal({ open, order, onClose, onCompleted }: Props) {
  // GPS
  const [gps, setGps] = useState<GpsCoords | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card'>('Cash');
  const [paymentAmount, setPaymentAmount] = useState<string>(
    order.totalDue != null ? String(order.totalDue) : ''
  );

  // Images
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<UploadedImage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notes
  const [notes, setNotes] = useState('');

  // Signature
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [signedBy, setSignedBy] = useState('');

  // Terms
  const [termsText, setTermsText] = useState(DEFAULT_TERMS);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loadingTerms, setLoadingTerms] = useState(false);

  // Saving
  const [isSaving, setIsSaving] = useState(false);

  // Load terms from system_config
  useEffect(() => {
    if (!open) return;
    setLoadingTerms(true);
    const supabase = createClient();
    supabase
      .from('system_config')
      .select('config_value')
      .eq('config_key', 'terms_of_hire')
      .single()
      .then(({ data }) => {
        if (data?.config_value) setTermsText(data.config_value);
        setLoadingTerms(false);
      })
      .catch(() => setLoadingTerms(false));
  }, [open]);

  // Auto-capture GPS when modal opens
  useEffect(() => {
    if (!open) return;
    captureGps();
  }, [open]);

  const captureGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by this browser.');
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(`Unable to capture GPS: ${err.message}`);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // Canvas drawing helpers
  const getPos = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement
  ) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsDrawing(true);
    lastPos.current = getPos(e, canvas);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e, canvas);
    if (lastPos.current) {
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = 'hsl(215, 25%, 12%)';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      setHasSignature(true);
    }
    lastPos.current = pos;
  };

  const endDraw = () => {
    setIsDrawing(false);
    lastPos.current = null;
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  // Image handling
  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not a valid image file`);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} exceeds the 10MB limit`);
        return;
      }
      const url = URL.createObjectURL(file);
      setImages((prev) => [
        ...prev,
        {
          id: `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          url,
          caption: file.name.replace(/\.[^/.]+$/, ''),
          uploadedAt: new Date().toISOString(),
          file,
        },
      ]);
    });
  };

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const canSave =
    !!gps &&
    images.length > 0 &&
    signedBy.trim().length > 0 &&
    hasSignature &&
    termsAccepted &&
    paymentAmount.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);

    try {
      const canvas = canvasRef.current;
      const signatureDataUrl = canvas ? canvas.toDataURL('image/png') : null;

      const podData = {
        completedAt: new Date().toISOString(),
        signedBy: signedBy.trim(),
        signatureDataUrl,
        termsAccepted: true,
        notes: notes.trim(),
        gps: gps
          ? {
              latitude: gps.latitude,
              longitude: gps.longitude,
              accuracy: gps.accuracy,
              capturedAt: new Date().toISOString(),
            }
          : null,
        payment: {
          method: paymentMethod,
          amount: parseFloat(paymentAmount) || 0,
          recordedAt: new Date().toISOString(),
        },
        images: images.map((img) => ({
          id: img.id,
          url: img.url,
          caption: img.caption,
          uploadedAt: img.uploadedAt,
        })),
      };

      const supabase = createClient();

      // Save POD data and update payment info on the order
      const { error: podError } = await supabase
        .from('orders')
        .update({
          pod: podData,
          status: 'Booking Complete',
          payment_method: paymentMethod,
          payment_amount: parseFloat(paymentAmount) || 0,
          payment_status: 'Paid',
          payment_recorded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      if (podError) throw podError;

      toast.success('Proof of delivery saved. Booking marked as Complete.');
      onCompleted();
    } catch (err: any) {
      toast.error(`Failed to save proof of delivery: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const checklist = [
    { label: 'GPS coordinates captured', done: !!gps },
    { label: 'Payment amount entered', done: paymentAmount.trim().length > 0 },
    { label: 'At least one delivery photo uploaded', done: images.length > 0 },
    { label: 'Signed by name entered', done: signedBy.trim().length > 0 },
    { label: 'Customer signature captured', done: hasSignature },
    { label: 'Terms of hire accepted', done: termsAccepted },
  ];

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Proof of Delivery"
        description={`Complete all sections below to mark booking ${order.id} as delivered.`}
        size="lg"
      >
        <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-1 scrollbar-thin">

          {/* ── 1. GPS Coordinates ─────────────────────────────────────── */}
          <section>
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3" style={{ color: 'hsl(var(--foreground))' }}>
              <MapPin size={15} style={{ color: 'hsl(var(--primary))' }} />
              GPS Location
            </h3>
            {gpsLoading ? (
              <div className="flex items-center gap-2 p-3 rounded-lg border text-sm" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                <Loader2 size={14} className="animate-spin" />
                Capturing GPS coordinates…
              </div>
            ) : gps ? (
              <div className="p-3 rounded-lg border text-sm space-y-1" style={{ borderColor: 'hsl(142 69% 35% / 0.3)', backgroundColor: 'hsl(142 69% 35% / 0.05)' }}>
                <div className="flex items-center gap-2" style={{ color: 'hsl(142 69% 28%)' }}>
                  <CheckCircle2 size={14} />
                  <span className="font-medium">Location captured</span>
                </div>
                <p className="text-xs font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {gps.latitude.toFixed(6)}, {gps.longitude.toFixed(6)} · ±{Math.round(gps.accuracy)}m accuracy
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {gpsError && (
                  <div className="flex items-start gap-2 p-3 rounded-lg border text-sm" style={{ borderColor: 'hsl(var(--destructive) / 0.3)', backgroundColor: 'hsl(var(--destructive) / 0.05)', color: 'hsl(var(--destructive))' }}>
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    {gpsError}
                  </div>
                )}
                <button onClick={captureGps} className="btn-secondary text-sm">
                  <Navigation size={14} />
                  Capture GPS Location
                </button>
              </div>
            )}
          </section>

          {/* ── 2. Payment ─────────────────────────────────────────────── */}
          <section>
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3" style={{ color: 'hsl(var(--foreground))' }}>
              <CreditCard size={15} style={{ color: 'hsl(var(--primary))' }} />
              Payment on Delivery
            </h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                {(['Cash', 'Card'] as const).map((method) => (
                  <button
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                      paymentMethod === method ? 'border-primary' : ''
                    }`}
                    style={{
                      borderColor: paymentMethod === method ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                      backgroundColor: paymentMethod === method ? 'hsl(var(--primary) / 0.08)' : 'hsl(var(--card))',
                      color: paymentMethod === method ? 'hsl(var(--primary))' : 'hsl(var(--foreground))',
                    }}
                  >
                    {method === 'Cash' ? <Banknote size={15} /> : <CreditCard size={15} />}
                    {method}
                  </button>
                ))}
              </div>
              <div>
                <label className="label">Amount Collected (£)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="input-base mt-1"
                />
                {order.totalDue != null && (
                  <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Total due on delivery: <strong>£{Number(order.totalDue).toFixed(2)}</strong>
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* ── 3. Delivery Photos ─────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
                <ImageIcon size={15} style={{ color: 'hsl(var(--primary))' }} />
                Delivery Photos
                <span className="text-xs font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}>
                  {images.length}
                </span>
              </h3>
              <button onClick={() => fileInputRef.current?.click()} className="btn-secondary text-xs py-1.5 px-3">
                <Upload size={12} />
                Add Photos
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-150 mb-3"
              style={{
                borderColor: isDragging ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                backgroundColor: isDragging ? 'hsl(var(--primary) / 0.04)' : 'hsl(var(--secondary) / 0.3)',
              }}
            >
              <Upload size={20} className="mx-auto mb-1.5" style={{ color: isDragging ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }} />
              <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {isDragging ? 'Drop images here' : 'Drag & drop or click to upload photos'}
              </p>
            </div>
            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {images.map((img) => (
                  <div key={img.id} className="group relative rounded-lg overflow-hidden border aspect-[4/3]" style={{ borderColor: 'hsl(var(--border))' }}>
                    <AppImage src={img.url} alt={`Delivery photo: ${img.caption}`} fill className="object-cover" unoptimized={img.url.startsWith('blob:')} />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-1.5">
                      <button onClick={() => setLightboxImage(img)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded bg-white/90">
                        <ZoomIn size={12} />
                      </button>
                      <button onClick={() => removeImage(img.id)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded bg-white/90">
                        <Trash2 size={12} style={{ color: 'hsl(var(--destructive))' }} />
                      </button>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
                      <p className="text-white text-[9px] truncate">{img.caption}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── 4. Notes ───────────────────────────────────────────────── */}
          <section>
            <label htmlFor="pod-modal-notes" className="label">
              Delivery Notes <span className="font-normal" style={{ color: 'hsl(var(--muted-foreground))' }}>(optional)</span>
            </label>
            <textarea
              id="pod-modal-notes"
              rows={2}
              placeholder="e.g. Castle set up in rear garden. Customer happy with placement."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input-base resize-none mt-1"
            />
          </section>

          {/* ── 5. Terms of Hire ───────────────────────────────────────── */}
          <section>
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3" style={{ color: 'hsl(var(--foreground))' }}>
              <FileCheck size={15} style={{ color: 'hsl(var(--primary))' }} />
              Terms of Hire
            </h3>
            {loadingTerms ? (
              <div className="h-32 rounded-xl skeleton" />
            ) : (
              <div
                className="p-4 rounded-xl border mb-3 text-xs space-y-1.5 max-h-40 overflow-y-auto scrollbar-thin whitespace-pre-wrap"
                style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--secondary) / 0.4)', color: 'hsl(var(--muted-foreground))' }}
              >
                {termsText}
              </div>
            )}
            <label
              className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border transition-all duration-150"
              style={{
                borderColor: termsAccepted ? 'hsl(142 69% 35% / 0.3)' : 'hsl(var(--border))',
                backgroundColor: termsAccepted ? 'hsl(142 69% 35% / 0.04)' : 'hsl(var(--card))',
              }}
            >
              <div className="relative mt-0.5 shrink-0">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="sr-only"
                />
                <div
                  className="w-5 h-5 rounded border-2 flex items-center justify-center transition-all"
                  style={{
                    borderColor: termsAccepted ? 'hsl(142 69% 35%)' : 'hsl(var(--border))',
                    backgroundColor: termsAccepted ? 'hsl(142 69% 35%)' : 'transparent',
                  }}
                >
                  {termsAccepted && <CheckCircle2 size={12} color="white" />}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">Customer accepts the Terms of Hire</p>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Confirm the customer has read and agreed to the terms above in person at time of delivery.
                </p>
              </div>
            </label>
          </section>

          {/* ── 6. Customer Signature ──────────────────────────────────── */}
          <section>
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3" style={{ color: 'hsl(var(--foreground))' }}>
              <PenLine size={15} style={{ color: 'hsl(var(--primary))' }} />
              Customer Signature
            </h3>
            <div className="mb-3">
              <label htmlFor="pod-signed-by" className="label">Signed By (Full Name)</label>
              <input
                id="pod-signed-by"
                type="text"
                placeholder="e.g. Rachel Thornton"
                value={signedBy}
                onChange={(e) => setSignedBy(e.target.value)}
                className="input-base mt-1"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Signature Pad — draw below using mouse or touch
                </p>
                <button
                  onClick={clearSignature}
                  className="text-xs flex items-center gap-1 transition-colors"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  <Trash2 size={11} />
                  Clear
                </button>
              </div>
              <div
                className="rounded-xl border overflow-hidden"
                style={{ borderColor: hasSignature ? 'hsl(var(--primary) / 0.4)' : 'hsl(var(--border))' }}
              >
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={140}
                  className="w-full touch-none"
                  style={{ cursor: 'crosshair', display: 'block', backgroundColor: 'hsl(var(--card))' }}
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={endDraw}
                  onMouseLeave={endDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={endDraw}
                  aria-label="Signature pad"
                />
              </div>
              {hasSignature ? (
                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'hsl(142 69% 30%)' }}>
                  <CheckCircle2 size={11} />
                  Signature captured
                </p>
              ) : (
                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  <PenLine size={11} />
                  Draw the customer's signature above
                </p>
              )}
            </div>
          </section>

          {/* ── Checklist ──────────────────────────────────────────────── */}
          <section
            className="p-4 rounded-xl border space-y-2"
            style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--secondary) / 0.4)' }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Completion Checklist
            </p>
            {checklist.map(({ label, done }) => (
              <div key={label} className="flex items-center gap-2 text-xs">
                {done ? (
                  <CheckCircle2 size={13} style={{ color: 'hsl(142 69% 30%)' }} />
                ) : (
                  <AlertTriangle size={13} style={{ color: 'hsl(var(--destructive))' }} />
                )}
                <span style={{ color: done ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}>
                  {label}
                </span>
              </div>
            ))}
          </section>

          {/* ── Actions ────────────────────────────────────────────────── */}
          <div className="flex gap-2 pt-1">
            <button className="btn-secondary flex-1 justify-center" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button
              className="btn-primary flex-1 justify-center"
              onClick={handleSave}
              disabled={!canSave || isSaving}
            >
              {isSaving ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <FileCheck size={14} />
                  Complete Delivery
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Lightbox */}
      <Modal
        open={!!lightboxImage}
        onClose={() => setLightboxImage(null)}
        title={lightboxImage?.caption || 'Delivery Photo'}
        size="lg"
      >
        {lightboxImage && (
          <AppImage
            src={lightboxImage.url}
            alt={`Full size: ${lightboxImage.caption}`}
            width={800}
            height={500}
            className="w-full rounded-lg object-contain"
            unoptimized={lightboxImage.url.startsWith('blob:')}
          />
        )}
      </Modal>
    </>
  );
}
