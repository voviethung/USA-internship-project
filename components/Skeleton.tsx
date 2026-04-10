'use client';

/** Skeleton loading placeholder components */

export function SkeletonLine({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-200 ${className}`}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100 space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 animate-pulse rounded-full bg-slate-200" />
        <div className="flex-1 space-y-2">
          <SkeletonLine className="h-4 w-3/4" />
          <SkeletonLine className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonResult() {
  return (
    <div className="flex-1 space-y-3 px-4 py-4">
      {/* Transcript skeleton */}
      <div className="rounded-xl bg-white p-4 shadow-sm space-y-2">
        <SkeletonLine className="h-3 w-24" />
        <SkeletonLine className="h-4 w-full" />
        <SkeletonLine className="h-4 w-2/3" />
      </div>

      {/* Translation skeleton */}
      <div className="rounded-xl bg-white p-4 shadow-sm space-y-2">
        <SkeletonLine className="h-3 w-28" />
        <SkeletonLine className="h-4 w-full" />
        <SkeletonLine className="h-4 w-3/4" />
      </div>

      {/* Reply skeleton */}
      <div className="rounded-xl border-2 border-blue-100 bg-blue-50/50 p-4 shadow-sm space-y-3">
        <SkeletonLine className="h-3 w-32" />
        <div className="flex items-start gap-2">
          <div className="flex-1 space-y-2">
            <SkeletonLine className="h-4 w-full" />
            <SkeletonLine className="h-4 w-1/2" />
          </div>
          <div className="h-9 w-9 animate-pulse rounded-full bg-slate-200" />
        </div>
        <SkeletonLine className="h-4 w-5/6" />
      </div>
    </div>
  );
}

export function SkeletonHistoryList() {
  return (
    <div className="space-y-3 px-4 py-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonProfile() {
  return (
    <div className="space-y-4 px-4 py-4">
      {/* Avatar card */}
      <div className="rounded-xl bg-white p-4 shadow-sm flex items-center gap-3">
        <div className="h-14 w-14 animate-pulse rounded-full bg-slate-200" />
        <div className="flex-1 space-y-2">
          <SkeletonLine className="h-5 w-32" />
          <SkeletonLine className="h-3 w-48" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white p-4 shadow-sm text-center space-y-2">
          <SkeletonLine className="h-7 w-12 mx-auto" />
          <SkeletonLine className="h-3 w-24 mx-auto" />
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm text-center space-y-2">
          <SkeletonLine className="h-7 w-12 mx-auto" />
          <SkeletonLine className="h-3 w-24 mx-auto" />
        </div>
      </div>

      {/* Form */}
      <div className="rounded-xl bg-white p-4 shadow-sm space-y-4">
        <SkeletonLine className="h-5 w-24" />
        <SkeletonLine className="h-10 w-full rounded-lg" />
        <SkeletonLine className="h-10 w-full rounded-lg" />
        <SkeletonLine className="h-10 w-full rounded-lg" />
      </div>
    </div>
  );
}
