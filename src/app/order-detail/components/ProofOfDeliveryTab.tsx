'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Upload, CheckCircle2, PenLine, Trash2, Image as ImageIcon, RefreshCw, FileCheck, AlertTriangle, ZoomIn, Clock,  } from 'lucide-react';
import { AppOrder as Order } from '@/lib/services/ordersService';
import AppImage from '@/components/ui/AppImage';
import Modal from '@/components/ui/Modal';

interface Props {
  order: Order;
}

interface UploadedImage {
  id: string;
  url: string;
  caption: string;
  uploadedAt: string;
  file?: File;
}

export default function ProofOfDeliveryTab({ order }: Props) {
  const existingPOD = order.pod;
  const isComplete = !!existingPOD?.completedAt;

  const [images, setImages] = useState<UploadedImage[]>(
    existingPOD?.images.map((img) => ({
      id: img.id,
      url: img.url,
      caption: img.caption,
      uploadedAt: img.uploadedAt,
    })) || []
  );
  const [isDragging, setIsDragging] = useState(false);
  const [signedBy, setSignedBy] = useState(existingPOD?.signedBy || '');
  const [termsAccepted, setTermsAccepted] = useState(existingPOD?.termsAccepted || false);
  const [notes, setNotes] = useState(existingPOD?.notes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [hasSignature, setHasSignature] = useState(!!existingPOD?.signatureDataUrl);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<UploadedImage | null>(null);
  const [editingCaption, setEditingCaption] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  // Canvas drawing
  const getPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => {
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
    if (isComplete) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsDrawing(true);
    lastPos.current = getPos(e, canvas);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || isComplete) return;
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

  // File upload
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
      const newImage: UploadedImage = {
        id: `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        url,
        caption: file.name.replace(/\.[^/.]+$/, ''),
        uploadedAt: new Date().toISOString(),
        file,
      };
      setImages((prev) => [...prev, newImage]);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
    toast.success('Image removed');
  };

  const updateCaption = (id: string, caption: string) => {
    setImages((prev) => prev.map((img) => img.id === id ? { ...img, caption } : img));
    setEditingCaption(null);
  };

  const handleSavePOD = async () => {
    if (images.length === 0) {
      toast.error('Please upload at least one proof of delivery image');
      return;
    }
    if (!signedBy.trim()) {
      toast.error('Please enter the name of the person who signed');
      return;
    }
    if (!hasSignature) {
      toast.error('Customer signature is required to complete proof of delivery');
      return;
    }
    if (!termsAccepted) {
      toast.error('Customer must accept the terms of hire before completing delivery');
      return;
    }

    setIsSaving(true);
    // TODO: BACKEND — POST /wp-json/castleadmin/v1/orders/{id}/pod with FormData containing images[], signatureDataUrl, signedBy, termsAccepted, notes
    await new Promise((r) => setTimeout(r, 1200));
    setIsSaving(false);
    toast.success('Proof of delivery saved. Booking marked as Complete.');
  };

  const canSave = images.length > 0 && signedBy.trim() && hasSignature && termsAccepted;

  return (
    <div className="space-y-7 max-w-3xl">
      {/* Completion banner */}
      {isComplete && existingPOD && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl border"
          style={{
            backgroundColor: 'hsl(142 69% 35% / 0.05)',
            borderColor: 'hsl(142 69% 35% / 0.25)',
          }}
        >
          <FileCheck size={18} style={{ color: 'hsl(142 69% 30%)' }} className="shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'hsl(142 69% 28%)' }}>
              Proof of delivery completed
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Signed by {existingPOD.signedBy} ·{' '}
              {existingPOD.completedAt &&
                new Date(existingPOD.completedAt).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
            </p>
          </div>
        </div>
      )}

      {/* Image upload section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
            <ImageIcon size={15} style={{ color: 'hsl(var(--primary))' }} />
            Delivery Photos
            <span
              className="text-xs font-medium px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}
            >
              {images.length}
            </span>
          </h3>
          {!isComplete && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              <Upload size={12} />
              Add Photos
            </button>
          )}
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
        {!isComplete && (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-150 mb-4"
            style={{
              borderColor: isDragging ? 'hsl(var(--primary))' : 'hsl(var(--border))',
              backgroundColor: isDragging ? 'hsl(var(--primary) / 0.04)' : 'hsl(var(--secondary) / 0.3)',
            }}
          >
            <Upload
              size={24}
              className="mx-auto mb-2"
              style={{ color: isDragging ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}
            />
            <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>
              {isDragging ? 'Drop images here' : 'Drag & drop delivery photos here'}
            </p>
            <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
              or click to browse — JPG, PNG, HEIC up to 10MB each
            </p>
          </div>
        )}

        {/* Image grid */}
        {images.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {images.map((img) => (
              <div key={img.id} className="group relative rounded-xl overflow-hidden border aspect-[4/3]"
                style={{ borderColor: 'hsl(var(--border))' }}>
                <AppImage
                  src={img.url}
                  alt={`Delivery photo: ${img.caption}`}
                  fill
                  className="object-cover"
                  unoptimized={img.url.startsWith('blob:')}
                />
                {/* Overlay on hover */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-150 flex items-center justify-center gap-2">
                  <button
                    onClick={() => setLightboxImage(img)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-white/90 hover:bg-white"
                    aria-label="View full image"
                  >
                    <ZoomIn size={14} style={{ color: 'hsl(var(--foreground))' }} />
                  </button>
                  {!isComplete && (
                    <button
                      onClick={() => removeImage(img.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-white/90 hover:bg-white"
                      aria-label="Remove image"
                    >
                      <Trash2 size={14} style={{ color: 'hsl(var(--destructive))' }} />
                    </button>
                  )}
                </div>
                {/* Caption */}
                <div
                  className="absolute bottom-0 left-0 right-0 px-2 py-1.5"
                  style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
                >
                  {editingCaption === img.id ? (
                    <input
                      autoFocus
                      defaultValue={img.caption}
                      className="w-full bg-transparent text-white text-xs outline-none border-b border-white/50"
                      onBlur={(e) => updateCaption(img.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') updateCaption(img.id, (e.target as HTMLInputElement).value);
                        if (e.key === 'Escape') setEditingCaption(null);
                      }}
                    />
                  ) : (
                    <p
                      className="text-white text-[10px] truncate cursor-pointer"
                      onClick={() => !isComplete && setEditingCaption(img.id)}
                      title={isComplete ? img.caption : 'Click to edit caption'}
                    >
                      {img.caption}
                    </p>
                  )}
                </div>
                {/* Upload timestamp */}
                <div className="absolute top-1.5 left-1.5">
                  <span
                    className="text-[9px] font-medium px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: 'white' }}
                  >
                    <Clock size={8} className="inline mr-0.5" />
                    {new Date(img.uploadedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            className="text-center py-8 rounded-xl border"
            style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--secondary) / 0.3)' }}
          >
            <ImageIcon size={28} className="mx-auto mb-2" style={{ color: 'hsl(var(--muted-foreground))' }} />
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              No delivery photos uploaded yet
            </p>
          </div>
        )}
      </div>

      {/* Signature section */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3" style={{ color: 'hsl(var(--foreground))' }}>
          <PenLine size={15} style={{ color: 'hsl(var(--primary))' }} />
          Customer Signature
        </h3>

        {/* Signed by name */}
        <div className="mb-4">
          <label htmlFor="signed-by" className="label">
            Signed By (Full Name)
          </label>
          <p className="helper-text">The name of the person accepting the delivery and signing the terms</p>
          <input
            id="signed-by"
            type="text"
            placeholder="e.g. Rachel Thornton"
            value={signedBy}
            onChange={(e) => setSignedBy(e.target.value)}
            disabled={isComplete}
            className="input-base mt-1"
          />
        </div>

        {/* Signature canvas */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Signature Pad {isComplete ? '(locked)' : '— draw below using mouse or touch'}
            </p>
            {!isComplete && (
              <button
                onClick={clearSignature}
                className="text-xs flex items-center gap-1 hover:text-destructive transition-colors"
                style={{ color: 'hsl(var(--muted-foreground))' }}
              >
                <Trash2 size={11} />
                Clear
              </button>
            )}
          </div>
          <div
            className="rounded-xl border overflow-hidden"
            style={{
              borderColor: hasSignature ? 'hsl(var(--primary) / 0.4)' : 'hsl(var(--border))',
              backgroundColor: isComplete ? 'hsl(var(--secondary) / 0.3)' : 'hsl(var(--card))',
            }}
          >
            {isComplete && existingPOD?.signatureDataUrl ? (
              <AppImage
                src={existingPOD.signatureDataUrl}
                alt="Customer signature for terms of hire"
                width={600}
                height={160}
                className="w-full"
              />
            ) : (
              <canvas
                ref={canvasRef}
                width={600}
                height={160}
                className="w-full touch-none"
                style={{
                  cursor: isComplete ? 'not-allowed' : 'crosshair',
                  display: 'block',
                }}
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={endDraw}
                aria-label="Signature pad — draw customer signature here"
              />
            )}
          </div>
          {!hasSignature && !isComplete && (
            <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <PenLine size={11} />
              Draw the customer's signature above to confirm acceptance
            </p>
          )}
          {hasSignature && (
            <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: 'hsl(142 69% 30%)' }}>
              <CheckCircle2 size={11} />
              Signature captured
            </p>
          )}
        </div>
      </div>

      {/* Terms of hire */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3" style={{ color: 'hsl(var(--foreground))' }}>
          <FileCheck size={15} style={{ color: 'hsl(var(--primary))' }} />
          Terms of Hire
        </h3>

        <div
          className="p-4 rounded-xl border mb-4 text-xs space-y-2 max-h-48 overflow-y-auto scrollbar-thin"
          style={{
            borderColor: 'hsl(var(--border))',
            backgroundColor: 'hsl(var(--secondary) / 0.4)',
            color: 'hsl(var(--muted-foreground))',
          }}
        >
          <p className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
            Castle Hire Terms &amp; Conditions
          </p>
          <p><strong>1. Safety:</strong> The hirer is responsible for ensuring the bouncy castle is used safely. Adult supervision is required at all times. Maximum user weight and age restrictions must be observed as displayed on the unit.</p>
          <p><strong>2. Weather:</strong> The bouncy castle must be deflated and not used in wind speeds exceeding 24mph, heavy rain, or lightning. The driver will advise at setup.</p>
          <p><strong>3. Footwear:</strong> No shoes, sharp objects, face paint, or silly string are permitted on or near the inflatable.</p>
          <p><strong>4. Damage:</strong> The hirer accepts responsibility for any damage caused through misuse. Accidental damage may be covered under the standard hire agreement — please ask the driver for details.</p>
          <p><strong>5. Collection:</strong> The inflatable must be accessible and ready for collection within the agreed collection window. Late collection fees may apply.</p>
          <p><strong>6. Power:</strong> The hirer is responsible for providing a suitable power supply (13A socket within 25 metres) unless a generator has been arranged. Do not use an extension lead longer than 25 metres.</p>
          <p><strong>7. Liability:</strong> CastleAdmin Ltd accepts no liability for injury arising from misuse of the equipment. By signing, the hirer confirms they have read, understood, and accepted all terms.</p>
        </div>

        <label
          className={`flex items-start gap-3 cursor-pointer p-4 rounded-xl border transition-all duration-150 ${isComplete ? 'cursor-default' : ''}`}
          style={{
            borderColor: termsAccepted ? 'hsl(142 69% 35% / 0.3)' : 'hsl(var(--border))',
            backgroundColor: termsAccepted ? 'hsl(142 69% 35% / 0.04)' : 'hsl(var(--card))',
          }}
        >
          <div className="relative mt-0.5">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => !isComplete && setTermsAccepted(e.target.checked)}
              disabled={isComplete}
              className="sr-only"
              aria-label="Customer accepts terms of hire"
            />
            <div
              className="w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-150"
              style={{
                borderColor: termsAccepted ? 'hsl(142 69% 35%)' : 'hsl(var(--border))',
                backgroundColor: termsAccepted ? 'hsl(142 69% 35%)' : 'transparent',
              }}
            >
              {termsAccepted && <CheckCircle2 size={12} color="white" />}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium">
              Customer accepts the Terms of Hire
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              By checking this box, you confirm that the customer ({signedBy || 'customer name'}) has read and agreed to
              the full terms of hire above, and that this confirmation was given in person at time of delivery.
            </p>
          </div>
        </label>
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="pod-notes" className="label">
          Delivery Notes <span className="font-normal" style={{ color: 'hsl(var(--muted-foreground))' }}>(optional)</span>
        </label>
        <textarea
          id="pod-notes"
          rows={3}
          placeholder="e.g. Castle set up in rear garden. Customer happy with placement. Gate code 1234."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={isComplete}
          className="input-base resize-none"
        />
      </div>

      {/* Validation summary */}
      {!isComplete && (
        <div
          className="p-4 rounded-xl border space-y-2"
          style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--secondary) / 0.4)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Completion Checklist
          </p>
          {[
            { label: 'At least one delivery photo uploaded', done: images.length > 0 },
            { label: 'Signed by name entered', done: signedBy.trim().length > 0 },
            { label: 'Customer signature captured', done: hasSignature },
            { label: 'Terms of hire accepted', done: termsAccepted },
          ].map(({ label, done }) => (
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
        </div>
      )}

      {/* Save button */}
      {!isComplete && (
        <button
          onClick={handleSavePOD}
          disabled={!canSave || isSaving}
          className="btn-primary w-full justify-center py-3"
        >
          {isSaving ? (
            <>
              <RefreshCw size={15} className="animate-spin" />
              Saving Proof of Delivery…
            </>
          ) : (
            <>
              <FileCheck size={15} />
              Save Proof of Delivery &amp; Complete Booking
            </>
          )}
        </button>
      )}

      {/* Lightbox modal */}
      <Modal
        open={!!lightboxImage}
        onClose={() => setLightboxImage(null)}
        title={lightboxImage?.caption || 'Delivery Photo'}
        size="lg"
      >
        {lightboxImage && (
          <div className="space-y-3">
            <AppImage
              src={lightboxImage.url}
              alt={`Full size delivery photo: ${lightboxImage.caption}`}
              width={800}
              height={500}
              className="w-full rounded-lg object-contain"
              unoptimized={lightboxImage.url.startsWith('blob:')}
            />
            <div className="flex items-center justify-between text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <span>{lightboxImage.caption}</span>
              <span>
                Uploaded{' '}
                {new Date(lightboxImage.uploadedAt).toLocaleTimeString('en-GB', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}