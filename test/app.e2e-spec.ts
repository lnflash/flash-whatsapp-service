import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup-e2e';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await createTestApp();
  }, 10000);

  afterEach(async () => {
    await app.close();
  });

  it('/health (GET) health check', () => {
    return request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok' });
  });
});
