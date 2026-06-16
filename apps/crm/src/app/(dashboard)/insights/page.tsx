import { Header } from '@/components/layout/header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAiInsights } from '@/lib/ops-data';

export const dynamic = 'force-dynamic';

export default async function InsightsPage() {
  const insights = await getAiInsights();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Insights IA" subtitle="Scoring, resumenes y siguiente mejor accion" />
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {insights.map((insight) => (
          <Card key={insight.id} className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-sm">{insight.title}</CardTitle>
                <div className="flex items-center gap-2">
                  {insight.score !== null && <Badge variant="info">{insight.score}</Badge>}
                  <Badge variant={insight.status === 'OPEN' ? 'warning' : 'outline'}>{insight.status}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-slate-500">
              <p>{insight.description}</p>
              <p>
                {insight.contact
                  ? `Contacto: ${insight.contact.firstName} ${insight.contact.lastName}`
                  : 'Sin contacto asociado'}
              </p>
              <p>Tipo: {insight.type}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
