'use client';

import { useState, useRef, useCallback } from 'react';
import { AppOrder } from '@/lib/services/ordersService';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  Upload, PenLine, Trash2, Image as ImageIcon, FileCheck,
  CheckCircle2, RefreshCw, ZoomIn, X,
} from 'lucide-react';

interface Props {
  order: AppOrder;
  onComplete: () => void;
}

interface UploadedPhoto {
  id: string;
  url: string;
  caption: string;
  file?: File;
}

export default function DriverPODUpload({ order, onComplete }: Props) {
  const isAlreadyComplete = order.status === 'Booking Complete' && !!order.pod?.completedAt;

  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [signedBy, setSignedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<UploadedPhoto | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

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
    if (isAlreadyComplete) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsDrawing(true);
    lastPos.current = getPos(e, canvas);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || isAlreadyComplete) return;
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
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not a valid image`);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 10MB limit`);
        return;
      }
      const url = URL.createObjectURL(file);
      setPhotos((prev) => [
        ...prev,
        {
          id: `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          url,
          caption: file.name.replace(/\.[^/.]+$/, ''),
          file,
        },
      ]);
    });
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSubmit = async () => {
    if (photos.length === 0) {
      toast.error('Please upload at least one delivery photo');
      return;
    }
    if (!signedBy.trim()) {
      toast.error('Please enter the name of the person who received the delivery');
      return;
    }
    if (!hasSignature) {
      toast.error('Customer signature is required');
      return;
    }

    setIsSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      // Get signature data URL
      const signatureDataUrl = canvasRef.current?.toDataURL('image/png') ?? '';

      // Build photos array (use object URLs for now; in production upload to storage)
      const photosPayload = photos.map((p) => ({
        id: p.id,
        url: p.url,
        caption: p.caption,
        uploadedAt: new Date().toISOString(),
      }));

      // Find driver linked to this user
      let driverId: string | null = null;
      if (user) {
        const { data: driverData } = await supabase
          .from('drivers')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();
        driverId = driverData?.id ?? null;
      }

      // If no linked driver, try to get from order
      if (!driverId && order.driver?.id) {
        driverId = order.driver.id;
      }

      if (driverId) {
        // Save POD submission to Supabase
        const { error: podError } = await supabase
          .from('driver_pod_submissions')
          .insert({
            order_id: order.id,
            driver_id: driverId,
            signed_by: signedBy.trim(),
            signature_data_url: signatureDataUrl,
            notes: notes.trim() || null,
            photos: photosPayload,
            submitted_at: new Date().toISOString(),
          });

        if (podError) {
          console.error('POD save error:', podError.message);
        }
      }

      // Update order POD field and mark complete
      const podData = {
        signedBy: signedBy.trim(),
        signatureDataUrl,
        notes: notes.trim() || null,
        images: photosPayload,
        completedAt: new Date().toISOString(),
        termsAccepted: true,
      };

      await supabase
        .from('orders')
        .update({
          pod: podData,
          status: 'Booking Complete',
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      onComplete();
    } catch (err) {
      console.error('POD submit error:', err);
      toast.error('Failed to submit proof of delivery');
    } finally {
      setIsSaving(false);
    }
  };

  const canSubmit = photos.length > 0 && signedBy.trim() && hasSignature;

  if (isAlreadyComplete && order.pod) {
    return (
      <div
        className="rounded-xl border p-6 text-center space-y-3"
        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(142 69% 35% / 0.3)' }}
      >
        <CheckCircle2 size={40} className="mx-auto" style={{ color: 'hsl(142 69% 35%)' }} />
        <div>
          <p className="font-semibold" style={{ color: 'hsl(142 69% 28%)' }}>
            Proof of Delivery Submitted
          </p>
          <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Signed by {order.pod.signedBy} ·{' '}
            {order.pod.completedAt &&
              new Date(order.pod.completedAt).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'long', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
          </p>
        </div>
        {order.pod.images?.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            {order.pod.images.map((img: any) => (
              <div key={img.id} className="aspect-square rounded-lg overflow-hidden">
                <img src={img.url} alt={img.caption || 'Delivery photo'} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Photo Upload */}
      <div
        className="rounded-xl border p-4"
        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
            <ImageIcon size={15} style={{ color: 'hsl(var(--primary))' }} />
            Delivery Photos
            {photos.length > 0 && (
              <span
                className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}
              >
                {photos.length}
              </span>
            )}
          </h3>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary text-xs py-1.5 px-3"
          >
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
          aria-label="Upload delivery photos"
        />

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all mb-3"
          style={{
            borderColor: isDragging ? 'hsl(var(--primary))' : 'hsl(var(--border))',
            backgroundColor: isDragging ? 'hsl(var(--primary) / 0.05)' : 'transparent',
          }}
        >
          <Upload size={22} className="mx-auto mb-2" style={{ color: 'hsl(var(--muted-foreground))' }} />
          <p className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>
            Tap to take photo or upload
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Max 10MB per image
          </p>
        </div>

        {/* Photo grid */}
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((photo) => (
              <div key={photo.id} className="relative group aspect-square rounded-lg overflow-hidden">
                <img
                  src={photo.url}
                  alt={photo.caption || 'Delivery photo'}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    onClick={() => setLightboxPhoto(photo)}
                    className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                  >
                    <ZoomIn size={14} className="text-white" />
                  </button>
                  <button
                    onClick={() => removePhoto(photo.id)}
                    className="p-1.5 rounded-full bg-white/20 hover:bg-red-500/60 transition-colors"
                  >
                    <Trash2 size={14} className="text-white" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Signature */}
      <div
        className="rounded-xl border p-4"
        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
            <PenLine size={15} style={{ color: 'hsl(var(--primary))' }} />
            Customer Signature
          </h3>
          {hasSignature && (
            <button
              onClick={clearSignature}
              className="flex items-center gap-1 text-xs py-1 px-2 rounded-lg transition-colors hover:bg-secondary"
              style={{ color: 'hsl(var(--muted-foreground))' }}
            >
              <RefreshCw size={11} />
              Clear
            </button>
          )}
        </div>

        <div
          className="rounded-xl overflow-hidden border"
          style={{ borderColor: hasSignature ? 'hsl(var(--primary))' : 'hsl(var(--border))' }}
        >
          <canvas
            ref={canvasRef}
            width={600}
            height={180}
            className="w-full touch-none"
            style={{
              backgroundColor: 'hsl(var(--background))',
              cursor: 'crosshair',
              display: 'block',
            }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
        </div>
        {!hasSignature && (
          <p className="text-xs mt-1.5 text-center" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Ask customer to sign above
          </p>
        )}
      </div>

      {/* Signed By */}
      <div
        className="rounded-xl border p-4"
        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
      >
        <label className="text-sm font-semibold block mb-2" style={{ color: 'hsl(var(--foreground))' }}>
          Received By (Name)
        </label>
        <input
          type="text"
          value={signedBy}
          onChange={(e) => setSignedBy(e.target.value)}
          placeholder="Enter customer's full name"
          className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none transition-all"
          style={{
            backgroundColor: 'hsl(var(--background))',
            borderColor: 'hsl(var(--border))',
            color: 'hsl(var(--foreground))',
          }}
        />
      </div>

      {/* Notes */}
      <div
        className="rounded-xl border p-4"
        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
      >
        <label className="text-sm font-semibold block mb-2" style={{ color: 'hsl(var(--foreground))' }}>
          Delivery Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any notes about the delivery..."
          rows={3}
          className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none transition-all resize-none"
          style={{
            backgroundColor: 'hsl(var(--background))',
            borderColor: 'hsl(var(--border))',
            color: 'hsl(var(--foreground))',
          }}
        />
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit || isSaving}
        className="w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
        style={{
          backgroundColor: canSubmit ? 'hsl(var(--primary))' : 'hsl(var(--secondary))',
          color: canSubmit ? 'white' : 'hsl(var(--muted-foreground))',
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          opacity: isSaving ? 0.7 : 1,
        }}
      >
        {isSaving ? (
          <>
            <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            Submitting...
          </>
        ) : (
          <>
            <FileCheck size={16} />
            Submit Proof of Delivery
          </>
        )}
      </button>

      {/* Validation hints */}
      {!canSubmit && (
        <div className="space-y-1">
          {photos.length === 0 && (
            <p className="text-xs flex items-center gap-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              Upload at least one delivery photo
            </p>
          )}
          {!signedBy.trim() && (
            <p className="text-xs flex items-center gap-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              Enter the name of the person who received the delivery
            </p>
          )}
          {!hasSignature && (
            <p className="text-xs flex items-center gap-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              Collect customer signature
            </p>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
          onClick={() => setLightboxPhoto(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-full"
            style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
            onClick={() => setLightboxPhoto(null)}
          >
            <X size={20} className="text-white" />
          </button>
          <img
            src={lightboxPhoto.url}
            alt={lightboxPhoto.caption || 'Delivery photo'}
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
