import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableHead, TableHeader, TableRow, TableSkeletonRows } from '@/components/ui/table';

export default function Loading() {
  return (
    <div className="flex h-full flex-col overflow-hidden" role="status" aria-label="Cargando contactos">
      <PageHeader title="Contactos" description="Cargando…" />
      <div className="px-4 pb-8 pt-2 sm:px-8">
        <Card className="overflow-hidden">
          <div className="flex gap-2.5 border-b border-line px-5 py-3">
            <Skeleton className="h-9 w-72 rounded-full" />
            <Skeleton className="h-9 w-80 rounded-full" />
          </div>
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Contacto</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead align="right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableSkeletonRows rows={7} cols={4} />
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
