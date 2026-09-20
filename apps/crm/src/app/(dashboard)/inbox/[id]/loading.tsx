import { Skeleton } from '@/components/ui/skeleton';

/** Esqueleto de la conversación (cabecera, hilo y composer) mientras carga. */
export default function Loading() {
  return (
    <div
      className="flex min-h-0 flex-1 overflow-hidden"
      role="status"
      aria-label="Cargando conversación"
    >
      <div className="hidden w-[320px] shrink-0 space-y-3 border-r border-line p-5 lg:block xl:w-[340px]">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-10 w-full rounded-full" />
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-start gap-3 pt-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-[68px] items-center gap-3 border-b border-line bg-paper pl-16 pr-4 md:pl-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
        <div className="flex-1 space-y-4 p-6">
          <Skeleton className="h-14 w-2/3 rounded-2xl" />
          <Skeleton className="ml-auto h-12 w-1/2 rounded-2xl" />
          <Skeleton className="h-10 w-1/3 rounded-2xl" />
        </div>
        <div className="border-t border-line bg-paper p-4">
          <Skeleton className="h-[88px] w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
