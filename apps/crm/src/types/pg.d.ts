declare module 'pg' {
  type ClientConfig = {
    connectionString: string;
    ssl?: {
      ca: string;
      rejectUnauthorized: boolean;
    };
  };

  export class Client {
    constructor(config: ClientConfig);
    connect(): Promise<void>;
    query<Row>(text: string): Promise<{ rows: Row[] }>;
    end(): Promise<void>;
  }
}
