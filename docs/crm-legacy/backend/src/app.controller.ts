import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('/health')
  getHealth() {
    return {
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      services: {
        api: 'running',
        database: 'pending_docker',
      },
    };
  }

  @Get('/api/v1/dashboard/stats')
  getDashboardStats() {
    return {
      totalLeads: 34,
      leadsGrowth: 18.6,
      openOpportunities: 6,
      opportunitiesValue: 22350000,
      closedWon: 8,
      revenue: 31700000,
      revenueGrowth: 24.3,
      conversionRate: 32,
    };
  }
}
