import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { OpportunitiesService } from './opportunities.service';

@Controller('api/v1/opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Get()
  findAll(@Query('stage') stage?: string) {
    return this.opportunitiesService.findAll(stage);
  }

  @Get('stats')
  getStats() {
    return this.opportunitiesService.getDashboardStats();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.opportunitiesService.findOne(id);
  }

  @Post()
  create(@Body() body: any) {
    return this.opportunitiesService.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.opportunitiesService.update(id, body);
  }

  @Put(':id/stage')
  updateStage(@Param('id') id: string, @Body('stage') stage: string) {
    return this.opportunitiesService.updateStage(id, stage);
  }
}
