import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="flex h-full flex-col overflow-hidden" role="status" aria-label="Cargando pipeline">
      <PageHeader title="Pipeline de ventas" description="Cargando…" />
      <div className="space-y-5 px-4 pt-2 sm:px-8">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[132px] rounded-2xl" />
          ))}
        </div>
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-72 w-[288px] shrink-0 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
