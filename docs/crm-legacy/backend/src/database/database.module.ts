import { Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';

export const DatabaseProvider = {
  provide: 'DATABASE_CONNECTION',
  useFactory: (configService: ConfigService) => {
    const pool = new Pool({
      connectionString: configService.get('DATABASE_URL'),
    });

    return drizzle(pool, { logger: true });
  },
  inject: [ConfigService],
};

@Module({
  providers: [DatabaseProvider],
  exports: [DatabaseProvider],
})
export class DatabaseModule {}
