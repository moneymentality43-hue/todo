"use client";

import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

// Small modal that sits above the goal dialog. Portalled so the dialog's transform cannot trap its fixed positioning.
export default function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-[#222222] bg-[#0a0a0a] p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-headline text-sm font-bold text-white">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-600 flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
