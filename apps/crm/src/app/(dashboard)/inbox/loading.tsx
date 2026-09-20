import { Skeleton } from '@/components/ui/skeleton';

/** Esqueleto de la lista mientras carga /inbox. */
export default function Loading() {
  return (
    <div
      className="flex min-h-0 flex-1 overflow-hidden"
      role="status"
      aria-label="Cargando conversaciones"
    >
      <div className="w-full space-y-3 pb-3 pl-16 pr-4 pt-5 md:pl-5 md:pr-5 lg:w-[340px] lg:shrink-0 lg:border-r lg:border-line">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-10 w-full rounded-full" />
        <div className="space-y-px pt-2">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="flex items-start gap-3 border-b border-line py-3.5">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden min-w-0 flex-1 lg:block" />
    </div>
  );
}
