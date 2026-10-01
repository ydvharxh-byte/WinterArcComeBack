"use client";

import Link from "next/link";
import { BookOpen, Compass, Home, RotateCcw } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-accent/15 text-accent ring-1 ring-accent/30 shadow-lg shadow-accent/10 mb-6">
        <Compass className="size-8 animate-pulse" />
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel2 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-mute mb-3">
        404 · Not Found
      </span>
      <h1 className="font-display text-2xl font-bold tracking-tight text-fog sm:text-3xl">
        Page or Topic Not Found
      </h1>
      <p className="mt-2 max-w-md text-sm text-mute leading-relaxed">
        The requested chapter, topic, or view could not be located. It might still be indexing or was moved.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-xs font-semibold text-white shadow-sm transition-all hover:brightness-110 active:brightness-95"
        >
          <Home className="size-3.5" /> Return to Dashboard
        </Link>
        <Link
          href="/study"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-panel2 px-4 text-xs font-semibold text-fog transition-all hover:border-line2 hover:bg-[#1a2942]"
        >
          <BookOpen className="size-3.5 text-accent" /> Browse Study Hub
        </Link>
        <button
          onClick={() => {
            if (typeof window !== "undefined") window.location.reload();
          }}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-panel2 px-4 text-xs font-semibold text-mute transition-all hover:text-fog hover:bg-[#1a2942] cursor-pointer"
        >
          <RotateCcw className="size-3.5" /> Refresh
        </button>
      </div>
    </div>
  );
}
