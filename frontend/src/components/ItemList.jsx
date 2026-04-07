import React, { useState } from 'react';
import ItemCard from './ItemCard';

export default function ItemList({ items, loading, onDelete, onUpdate, filter, search }) {
  if (loading) {
    return (
      <div className="px-4 pt-2 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="card p-4 h-24 skeleton rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!items.length) {
    const isEmpty = !filter || filter === 'all';
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="text-6xl mb-4">
          {search ? '🔍' : isEmpty ? '📦' : filter === 'Safe' ? '✅' : filter === 'Expiring Soon' ? '⏰' : '🗑️'}
        </div>
        <p className="text-slate-300 font-semibold text-lg mb-1">
          {search
            ? `No results for "${search}"`
            : isEmpty
              ? 'No items yet'
              : `No ${filter} items`}
        </p>
        <p className="text-slate-500 text-sm">
          {search
            ? 'Try a different search term'
            : isEmpty
              ? 'Tap + Add to scan or enter a product'
              : 'Items in this category will appear here'}
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-2 pb-4 space-y-3">
      {items.map((item, idx) => (
        <ItemCard
          key={item._id}
          item={item}
          onDelete={onDelete}
          onUpdate={onUpdate}
          style={{ animationDelay: `${idx * 40}ms` }}
        />
      ))}
    </div>
  );
}
