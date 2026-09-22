import { Globe2, MousePointerClick, Send } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { getLeadSourceReport } from '@/lib/crm-data';

export const dynamic = 'force-dynamic';

export default async function FuentesPage() {
  const report = await getLeadSourceReport();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Fuentes de leads" subtitle="Atribucion inicial desde sitio, formularios y campanas" />
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <div className="grid gap-4 lg:grid-cols-3">
          {report.eventRows.map((event) => (
            <StatCard
              key={event.label}
              label={event.label}
              value={event.value}
              size="sm"
              icon={
                event.label.includes('CTA')
                  ? MousePointerClick
                  : event.label.includes('Formularios')
                    ? Send
                    : Globe2
              }
            />
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Leads por fuente</CardTitle>
            </CardHeader>
            <div className="space-y-3 p-6 pt-0">
              {report.sourceRows.map((row) => (
                <div key={row.source}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-graphite">{row.source}</span>
                    <span className="text-xs font-semibold text-carbon">{row.leads}</span>
                  </div>
                  <div className="h-2 rounded-full bg-ivory">
                    <div className="h-2 rounded-full bg-electric" style={{ width: `${row.percentage}%` }} />
                  </div>
                </div>
              ))}
              {report.sourceRows.length === 0 && <p className="text-xs text-soft">Aun no hay leads capturados.</p>}
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Ultimos formularios</CardTitle>
            </CardHeader>
            <div className="divide-y divide-line px-6 pb-2">
              {report.recentSubmissions.map((submission) => (
                <div key={submission.id} className="py-3">
                  <p className="text-xs font-semibold text-carbon">{submission.contactName}</p>
                  <p className="text-[11px] text-soft">{submission.formName}</p>
                  <p className="mt-0.5 truncate text-[10px] text-soft">{submission.pageUrl}</p>
                </div>
              ))}
              {report.recentSubmissions.length === 0 && (
                <p className="py-3 text-xs text-soft">Aun no hay submissions registrados.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
