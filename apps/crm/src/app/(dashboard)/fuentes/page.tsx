import { Globe2, MousePointerClick, Send } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
            <Card key={event.label} className="border-0 shadow-sm">
              <CardContent className="flex items-center gap-3 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  {event.label.includes('CTA') ? (
                    <MousePointerClick className="h-5 w-5" />
                  ) : event.label.includes('Formularios') ? (
                    <Send className="h-5 w-5" />
                  ) : (
                    <Globe2 className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">{event.label}</p>
                  <p className="text-2xl font-bold text-slate-900">{event.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm">Leads por fuente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.sourceRows.map((row) => (
                <div key={row.source}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700">{row.source}</span>
                    <span className="text-xs font-semibold text-slate-900">{row.leads}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-blue-500" style={{ width: `${row.percentage}%` }} />
                  </div>
                </div>
              ))}
              {report.sourceRows.length === 0 && (
                <p className="text-xs text-slate-400">Aun no hay leads capturados.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm">Ultimos formularios</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {report.recentSubmissions.map((submission) => (
                  <div key={submission.id} className="py-3">
                    <p className="text-xs font-semibold text-slate-800">{submission.contactName}</p>
                    <p className="text-[11px] text-slate-500">{submission.formName}</p>
                    <p className="mt-0.5 truncate text-[10px] text-slate-400">{submission.pageUrl}</p>
                  </div>
                ))}
                {report.recentSubmissions.length === 0 && (
                  <p className="py-3 text-xs text-slate-400">Aun no hay submissions registrados.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
