import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
  style?: React.CSSProperties
}

export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-muted',
        className
      )}
      style={style}
    />
  )
}

// Pre-built skeleton variants for common use cases
export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <Skeleton className="h-32 w-full rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  )
}

export function SkeletonChart({ className, height = 400 }: SkeletonProps & { height?: number }) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-6 w-24" />
      </div>
      <Skeleton className="w-full rounded-lg" style={{ height }} />
      <div className="flex justify-center gap-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  )
}

export function SkeletonMap({ className, height = 400 }: SkeletonProps & { height?: number }) {
  return (
    <div className={cn('space-y-4', className)}>
      <Skeleton className="h-6 w-32" />
      <div className="relative">
        <Skeleton className="w-full rounded-lg" style={{ height }} />
        {/* Fake map markers */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex gap-8 opacity-30">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-4 w-4 rounded-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function SkeletonList({ count = 3, className }: SkeletonProps & { count?: number }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-2 w-2 rounded-full" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonStatsCard({ className }: SkeletonProps) {
  return (
    <div className={cn('p-4 rounded-xl border border-border bg-card', className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-12" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
    </div>
  )
}
