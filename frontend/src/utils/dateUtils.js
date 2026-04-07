export function getDaysLeft(expiryDate) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDate);
  exp.setHours(0, 0, 0, 0);
  return Math.floor((exp - now) / 86400000);
}

export function getStatus(expiryDate) {
  const days = getDaysLeft(expiryDate);
  if (days < 0) return 'Expired';
  if (days <= 2) return 'Expiring Soon';
  return 'Safe';
}

export function formatDate(date, opts = {}) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...opts
  });
}

export function toInputDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function statusConfig(status) {
  const map = {
    'Safe': {
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/15',
      border: 'border-emerald-500/30',
      ring: 'bg-emerald-400',
      dot: 'bg-emerald-400',
      icon: '✅',
      badge: 'status-safe'
    },
    'Expiring Soon': {
      color: 'text-amber-400',
      bg: 'bg-amber-500/15',
      border: 'border-amber-500/30',
      ring: 'bg-amber-400',
      dot: 'bg-amber-400',
      icon: '⏰',
      badge: 'status-warning'
    },
    'Expired': {
      color: 'text-red-400',
      bg: 'bg-red-500/15',
      border: 'border-red-500/30',
      ring: 'bg-red-400',
      dot: 'bg-red-400',
      icon: '🚨',
      badge: 'status-danger'
    }
  };
  return map[status] || map['Safe'];
}

export function daysLabel(days) {
  if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} ago`;
  if (days === 0) return 'Expires TODAY';
  if (days === 1) return 'Expires TOMORROW';
  return `${days} days left`;
}

// Sort items: Expired first, then Expiring Soon, then Safe, within each group by date
export function sortItems(items) {
  const order = { 'Expired': 0, 'Expiring Soon': 1, 'Safe': 2 };
  return [...items].sort((a, b) => {
    const statusDiff = order[a.status] - order[b.status];
    if (statusDiff !== 0) return statusDiff;
    return new Date(a.expiryDate) - new Date(b.expiryDate);
  });
}
