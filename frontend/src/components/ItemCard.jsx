import React, { useState, useRef } from 'react';
import { formatDate, toInputDate, getDaysLeft, daysLabel, statusConfig } from '../utils/dateUtils';
import { imageUrl } from '../utils/api';
import { toast } from 'react-hot-toast';

export default function ItemCard({ item, onDelete, onUpdate, style }) {
  const [expanded, setExpanded]   = useState(false);
  const [editing, setEditing]     = useState(false);
  const [editName, setEditName]   = useState(item.name);
  const [editDate, setEditDate]   = useState(toInputDate(item.expiryDate));
  const [saving, setSaving]       = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [imgError, setImgError]   = useState(false);
  const [showImg, setShowImg]     = useState(false);

  const days    = getDaysLeft(item.expiryDate);
  const status  = item.status || (days < 0 ? 'Expired' : days <= 2 ? 'Expiring Soon' : 'Safe');
  const cfg     = statusConfig(status);

  // Touch swipe to delete
  const touchStartX = useRef(null);
  const cardRef = useRef(null);

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd   = (e) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (diff > 80 && !editing) {
      handleDelete();
    }
    touchStartX.current = null;
  };

  const handleSave = async () => {
    if (!editName.trim() || !editDate) return toast.error('Name and date required');
    setSaving(true);
    await onUpdate(item._id, { name: editName.trim(), expiryDate: editDate });
    setSaving(false);
    setEditing(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete(item._id);
  };

  const progress = Math.max(0, Math.min(100, days <= 0 ? 0 : days >= 365 ? 100 : (days / 365) * 100));

  return (
    <div
      ref={cardRef}
      className={`card overflow-hidden item-enter transition-all duration-200 ${deleting ? 'opacity-0 scale-95' : ''}`}
      style={style}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Status accent bar */}
      <div className={`h-1 w-full ${status === 'Safe' ? 'bg-emerald-500' : status === 'Expiring Soon' ? 'bg-amber-500' : 'bg-red-500'}`} />

      <div className="p-4">
        {editing ? (
          /* ── Edit Mode ── */
          <div className="space-y-3">
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              className="input-field text-sm"
              placeholder="Product name"
              autoFocus
            />
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Expiry Date</label>
              <input
                type="date"
                value={editDate}
                onChange={e => setEditDate(e.target.value)}
                className="input-field text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 py-2 text-sm">
                {saving ? '⟳ Saving...' : '✓ Save'}
              </button>
              <button onClick={() => { setEditing(false); setEditName(item.name); setEditDate(toInputDate(item.expiryDate)); }}
                className="btn-secondary flex-1 py-2 text-sm">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          /* ── View Mode ── */
          <>
            <div className="flex items-start gap-3">
              {/* Image thumbnail */}
              {item.imagePath && !imgError ? (
                <button onClick={() => setShowImg(true)} className="flex-shrink-0">
                  <img
                    src={imageUrl(item.imagePath)}
                    alt={item.name}
                    onError={() => setImgError(true)}
                    className="w-12 h-12 rounded-xl object-cover border border-slate-700"
                  />
                </button>
              ) : (
                <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-xl ${cfg.bg} border ${cfg.border}`}>
                  {status === 'Safe' ? '📦' : status === 'Expiring Soon' ? '⏰' : '🗑️'}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-white font-semibold text-sm leading-tight truncate pr-2">
                    {item.name}
                  </h3>
                  <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                    {status === 'Expiring Soon' ? 'SOON' : status.toUpperCase()}
                  </span>
                </div>
                <p className={`text-xs mt-0.5 font-medium ${cfg.color}`}>
                  {daysLabel(days)}
                </p>
                <p className="text-slate-500 text-xs mt-0.5">
                  Expires: {formatDate(item.expiryDate)}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-3 h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  status === 'Safe' ? 'bg-emerald-500' : status === 'Expiring Soon' ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${status === 'Expired' ? 100 : progress}%` }}
              />
            </div>

            {/* Actions row */}
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-2">
                {item.detectedByOCR && (
                  <span className="text-[10px] text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded-full border border-slate-700/50">
                    🤖 OCR
                  </span>
                )}
                {item.imagePath && (
                  <button onClick={() => setShowImg(true)} className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors">
                    📷 View
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setEditing(true)}
                  className="p-2 text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all"
                  title="Edit"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                  title="Delete"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Full image modal */}
      {showImg && item.imagePath && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setShowImg(false)}
        >
          <img
            src={imageUrl(item.imagePath)}
            alt={item.name}
            className="max-w-full max-h-full rounded-2xl object-contain"
          />
          <button
            onClick={() => setShowImg(false)}
            className="absolute top-4 right-4 text-white bg-black/50 rounded-full w-9 h-9 flex items-center justify-center text-lg"
          >✕</button>
        </div>
      )}
    </div>
  );
}
