import React, { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { Camera, Image as ImageIcon, Loader2, Save, X } from 'lucide-react';
import { uploadImage, createItem } from '../utils/api';
import { toInputDate } from '../utils/dateUtils';

const MAX_MANUAL_NAME_LEN = 200;

export default function AddItemPanel({ onSuccess, onCancel }) {
  const [mode, setMode]             = useState('scan'); // 'scan' | 'manual'
  const [file, setFile]             = useState(null);
  const [preview, setPreview]       = useState(null);
  const [uploading, setUploading]   = useState(false);
  const [uploadPct, setUploadPct]   = useState(0);
  const [ocrResult, setOcrResult]   = useState(null); // { detectedDate, ocrText, confidence, candidates }
  const [productName, setProductName] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [saving, setSaving]         = useState(false);
  const [showOcrText, setShowOcrText] = useState(false);

  // Camera States
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const containerRef = useRef(null);
  const viewfinderRef = useRef(null);

  // Cleanup Camera on unmount
  useEffect(() => {
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    try {
      setIsCameraOpen(true);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment', 
          width: { ideal: 4096 }, 
          height: { ideal: 2160 },
          advanced: [{ focusMode: 'continuous' }] 
        } 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error(err);
      toast.error('Could not access camera. Please check permissions.');
      setIsCameraOpen(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  const takePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const viewfinder = viewfinderRef.current;
    
    if (video && canvas && container && viewfinder) {
      const context = canvas.getContext('2d');
      
      const videoRect = video.getBoundingClientRect();
      const viewfinderRect = viewfinder.getBoundingClientRect();
      
      // Calculate object-cover scaling and offset
      const cw = videoRect.width;
      const ch = videoRect.height;
      const vw = video.videoWidth;
      const vh = video.videoHeight;

      // SAFETY: If video hasn't loaded dimensions yet, wait or do full-frame
      if (!vw || !vh || !cw || !ch) {
        console.warn('Video dimensions not ready for crop mapping.');
        return;
      }
      
      const scale = Math.max(cw / vw, ch / vh);
      const rw = vw * scale;
      const rh = vh * scale;
      const ox = (rw - cw) / 2;
      const oy = (rh - ch) / 2;
      
      // Get viewfinder coordinates relative to the video container
      const left = viewfinderRect.left - videoRect.left;
      const top = viewfinderRect.top - videoRect.top;
      
      // Map to native video coordinates
      const sourceX = (left + ox) / scale;
      const sourceY = (top + oy) / scale;
      const sourceWidth = viewfinderRect.width / scale;
      const sourceHeight = viewfinderRect.height / scale;
      
      // Increase padding to 20% to avoid "Line cannot be recognized" error at edges
      const paddingX = sourceWidth * 0.2;
      const paddingY = sourceHeight * 0.2;
      
      let finalX = Math.max(0, sourceX - paddingX);
      let finalY = Math.max(0, sourceY - paddingY);
      let finalWidth = Math.min(vw - finalX, sourceWidth + (paddingX * 2));
      let finalHeight = Math.min(vh - finalY, sourceHeight + (paddingY * 2));

      // SAFETY: If the crop area is extremely small or invalid, use the full central area instead
      if (finalWidth < 200 || finalHeight < 100) {
        console.warn('Crop area too small, using full frame fallback.');
        finalX = 0;
        finalY = 0;
        finalWidth = vw;
        finalHeight = vh;
      }

      canvas.width = finalWidth;
      canvas.height = finalHeight;
      context.drawImage(
        video, 
        finalX, finalY, finalWidth, finalHeight,
        0, 0, finalWidth, finalHeight
      );
      
      canvas.toBlob((blob) => {
        stopCamera();
        const newFile = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
        handleFile(newFile, true);
      }, 'image/jpeg', 0.85);
    }
  };

  // ─── File handling ──────────────────────────────────────────────────────────
  const handleFile = useCallback((f, autoDetect = false) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast.error('Please select an image file');
    if (f.size > 15 * 1024 * 1024) return toast.error('Image too large (max 15MB)');

    setFile(f);
    setOcrResult(null);
    setExpiryDate('');

    const reader = new FileReader();
    reader.onload = e => {
      setPreview(e.target.result);
      if (autoDetect) {
         // Need a minor timeout to allow state to settle
         setTimeout(() => handleDetect(f), 50);
      }
    };
    reader.readAsDataURL(f);
  }, []);

  // ─── OCR Detect ─────────────────────────────────────────────────────────────
  const handleDetect = async (targetFile = file) => {
    if (!targetFile) return;
    setUploading(true);
    setUploadPct(0);
    setOcrResult(null);

    const toastId = toast.loading('🤖 Scanning with AI...');

    try {
      const result = await uploadImage(targetFile, (pct) => setUploadPct(pct));

      setOcrResult(result);

      if (result.detectedDate) {
        const d = new Date(result.detectedDate);
        setExpiryDate(toInputDate(d));
        toast.success(
          `✅ Expiry date detected!${result.aiConfidence ? ' (AI Powered)' : ''}`,
          { id: toastId, duration: 3000 }
        );
      } else {
        toast.error(
          '⚠️ Couldn\'t detect date automatically. Please enter it manually.',
          { id: toastId, duration: 4000 }
        );
      }
    } catch (err) {
      toast.error('Scan failed: ' + err.message, { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  // ─── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!productName.trim()) return toast.error('Please enter a product name');
    if (!expiryDate) return toast.error('Please enter the expiry date');

    setSaving(true);
    try {
      await createItem({
        name: productName.trim(),
        expiryDate,
        imagePath: ocrResult?.imagePath || null,
        ocrText: ocrResult?.ocrText || null,
        detectedByOCR: !!(ocrResult?.detectedDate)
      });
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save item');
    } finally {
      setSaving(false);
    }
  };

  const clearImage = () => {
    setFile(null);
    setPreview(null);
    setOcrResult(null);
    setExpiryDate('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const canSave = productName.trim() && expiryDate;

  return (
    <div className="p-4 space-y-4 animate-fade-in flex flex-col gap-2">

      {/* Mode Tabs */}
      <div className="flex bg-slate-800/60 rounded-xl p-1">
        {[
          { key: 'scan', icon: '📷', label: 'Scan Image' },
          { key: 'manual', icon: '✏️', label: 'Manual Entry' }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => {
                setMode(tab.key);
                if (tab.key === 'manual' && isCameraOpen) stopCamera();
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
              mode === tab.key
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Scan Mode */}
      {mode === 'scan' && (
        <div className="space-y-4">
          {!preview ? (
            <div className="flex flex-col gap-1.5">
              {isCameraOpen ? (
                <div ref={containerRef} className="relative aspect-video rounded-2xl overflow-hidden bg-black border-2 border-emerald-500/30 group">
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 border-[30px] border-black/20 pointer-events-none"></div>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div ref={viewfinderRef} className="w-64 h-32 border-2 border-emerald-500/70 rounded-xl border-dashed bg-emerald-500/10"></div>
                  </div>

                  <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center gap-6 px-4">
                    <button 
                      onClick={stopCamera}
                      className="p-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 backdrop-blur-md rounded-full transition"
                    >
                      <X className="w-6 h-6" />
                    </button>
                    
                    <button 
                      onClick={takePhoto}
                      className="w-16 h-16 bg-white rounded-full border-4 border-slate-300 flex items-center justify-center p-1 active:scale-95 transition"
                    >
                      <div className="w-full h-full bg-slate-100 rounded-full border-[3px] border-emerald-500/40"></div>
                    </button>
                    
                    <div className="w-12 h-12"></div>
                  </div>
                  <canvas ref={canvasRef} className="hidden" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={startCamera}
                    className="flex flex-col items-center justify-center gap-2 p-5 border-2 border-dashed border-slate-700 bg-slate-800/40 rounded-xl hover:border-emerald-500/50 hover:bg-slate-800/60 transition h-36"
                  >
                    <div className="p-3 bg-emerald-500/10 rounded-full">
                      <Camera className="w-7 h-7 text-emerald-400" />
                    </div>
                    <span className="text-sm font-semibold text-slate-200">Scan Label</span>
                  </button>

                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-2 p-5 border-2 border-dashed border-slate-700 bg-slate-800/40 rounded-xl hover:border-emerald-500/50 hover:bg-slate-800/60 transition h-36"
                  >
                    <div className="p-3 bg-blue-500/10 rounded-full">
                      <ImageIcon className="w-7 h-7 text-blue-400" />
                    </div>
                    <span className="text-sm font-semibold text-slate-200">Upload Photo</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={e => handleFile(e.target.files[0], true)}
                      className="hidden"
                    />
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Preview + OCR Controls */
            <div className="card p-4 space-y-3">
              <div className="relative">
                <img
                  src={preview}
                  alt="Product preview"
                  className="w-full max-h-64 object-contain rounded-xl bg-slate-900 border border-slate-700/50"
                />
                <button
                  onClick={clearImage}
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm hover:bg-black/80 transition-colors"
                >✕</button>
                {ocrResult?.detectedDate && (
                  <div className="absolute bottom-2 left-2 bg-emerald-500 text-white text-xs font-semibold px-2 py-1.5 rounded-lg shadow-lg flex items-center gap-1.5">
                    ✅ Date Found {ocrResult?.aiConfidence && <span className="opacity-75">| AI Powered</span>}
                  </div>
                )}
              </div>

              {/* Upload progress */}
              {uploading && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin"/> Processing...</span>
                    <span>{uploadPct}%</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-300"
                      style={{ width: `${uploadPct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* OCR Results */}
              {ocrResult && !uploading && (
                <div className={`text-xs p-3 rounded-xl border ${
                  ocrResult.detectedDate
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                }`}>
                  {ocrResult.detectedDate ? (
                    <>
                      <p className="font-semibold text-sm">✅ Date successfully parsed</p>
                      <p className="text-slate-400 mt-0.5">
                         {ocrResult.aiConfidence ? 'Generated via AI' : `Regex Confidence: ${ocrResult.confidence}%`}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-sm">⚠️ Date not found</p>
                      <p className="text-slate-400 mt-0.5">Please enter the date manually below</p>
                    </>
                  )}
                  {ocrResult.ocrText && (
                    <button
                      onClick={() => setShowOcrText(v => !v)}
                      className="mt-1 text-slate-500 hover:text-slate-300 text-xs underline"
                    >
                      {showOcrText ? '▲ Hide' : '▼ Show'} Extracted text
                    </button>
                  )}
                  {showOcrText && ocrResult.ocrText && (
                    <pre className="mt-2 text-[10px] text-slate-400 bg-slate-900/60 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-28">
                      {ocrResult.ocrText}
                    </pre>
                  )}
                </div>
              )}

              {/* Alternative candidates */}
              {ocrResult?.candidates?.length > 1 && (
                <div className="space-y-1">
                  <p className="text-xs text-slate-500">Other detected dates:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ocrResult.candidates.map((c, i) => (
                      <button
                        key={i}
                        onClick={() => setExpiryDate(toInputDate(new Date(c.date)))}
                        className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-2.5 py-1.5 rounded-lg border border-slate-600 transition-colors"
                      >
                        {new Date(c.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {c.hasKeyword && ' 🎯'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!ocrResult && (
                <button
                  onClick={() => handleDetect(file)}
                  disabled={uploading}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  <Loader2 className={uploading ? "animate-spin w-4 h-4" : "hidden"} />
                  <span>🤖</span> Detect Expiry Date
                </button>
              )}

              {ocrResult && !ocrResult.detectedDate && !uploading && (
                <button
                  onClick={() => handleDetect(file)}
                  className="btn-secondary w-full text-sm py-2.5"
                >
                  🔄 Retry Scan
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Form Fields (always visible) */}
      <div className="card p-4 space-y-4">
        <div>
          <label className="text-xs text-slate-400 mb-1.5 block font-medium">Product Name *</label>
          <input
            type="text"
            value={productName}
            onChange={e => setProductName(e.target.value.slice(0, MAX_MANUAL_NAME_LEN))}
            placeholder="e.g. Organic Milk, Paracetamol..."
            className="input-field shadow-inner"
            maxLength={MAX_MANUAL_NAME_LEN}
          />
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1.5 block font-medium flex items-center gap-2">
            Expiry Date *
            {ocrResult?.detectedDate && (
              <span className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 px-1.5 py-0.5 rounded">🤖 Auto-filled</span>
            )}
          </label>
          <input
            type="date"
            value={expiryDate}
            onChange={e => setExpiryDate(e.target.value)}
            className="input-field shadow-inner"
            min={new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)}
          />
          {expiryDate && (() => {
            const now = new Date(); now.setHours(0,0,0,0);
            const exp = new Date(expiryDate); exp.setHours(0,0,0,0);
            const diff = Math.floor((exp - now) / 86400000);
            return (
              <p className={`text-xs mt-1.5 font-medium flex items-center gap-1 ${diff < 0 ? 'text-red-400' : diff <= 2 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {diff < 0 ? `⚠️ Expired ${Math.abs(diff)} day(s) ago` : diff === 0 ? '⚠️ Expires today' : diff === 1 ? '⏰ Expires tomorrow' : `✅ Good for ${diff} days`}
              </p>
            );
          })()}
        </div>
      </div>

      {/* Save Button */}
      <div className="space-y-2 mt-2">
        <button
          onClick={handleSave}
          disabled={!canSave || saving || isCameraOpen || uploading}
          className={`btn-primary w-full flex items-center justify-center gap-2 py-4 text-base shadow-lg transition-all ${
            (!canSave || uploading) ? 'opacity-50 grayscale cursor-not-allowed' : 'hover:scale-[1.01] shadow-emerald-500/20 active:scale-95'
          }`}
        >
          {saving ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</>
          ) : (
            <><Save className="w-5 h-5" /> Save to Inventory</>
          )}
        </button>
        <button onClick={onCancel} className="btn-secondary w-full py-3 text-sm border-transparent hover:bg-slate-700/50">
          Cancel
        </button>
      </div>
    </div>
  );
}
