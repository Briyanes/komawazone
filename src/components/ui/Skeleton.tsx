import { cn } from '@/lib/cn';

interface SkeletonProps {
  className?: string;
  lines?: number;
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

export function MangaCardSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="w-full aspect-[3/4] rounded-lg" />
      <Skeleton className="h-4 w-4/5 rounded" />
      <Skeleton className="h-3 w-1/2 rounded" />
    </div>
  );
}

export function ChapterItemSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3">
      <Skeleton className="size-10 rounded-md shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4 rounded" />
        <Skeleton className="h-3 w-1/3 rounded" />
      </div>
    </div>
  );
}

export function MangaDetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Skeleton className="w-32 h-44 rounded-lg shrink-0" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-6 w-4/5 rounded" />
          <Skeleton className="h-4 w-1/2 rounded" />
          <Skeleton className="h-4 w-2/3 rounded" />
        </div>
      </div>
      <Skeleton className="h-20 w-full rounded-lg" />
    </div>
  );
}
