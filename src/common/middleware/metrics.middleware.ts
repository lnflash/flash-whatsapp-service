import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as promClient from 'prom-client';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  private register: promClient.Registry;
  private httpRequestDurationMicroseconds: promClient.Histogram<string>;
  private httpRequestCounter: promClient.Counter<string>;
  private httpRequestErrorCounter: promClient.Counter<string>;

  constructor() {
    // Create a Registry which registers the metrics
    this.register = new promClient.Registry();
    // Enable the default metrics
    promClient.collectDefaultMetrics({ register: this.register });

    // Define custom metrics
    this.httpRequestDurationMicroseconds = new promClient.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.register],
    });

    this.httpRequestCounter = new promClient.Counter({
      name: 'http_request_count',
      help: 'Counter for total HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.register],
    });

    this.httpRequestErrorCounter = new promClient.Counter({
      name: 'http_request_error_count',
      help: 'Counter for HTTP request errors',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.register],
    });
  }

  use(req: Request, res: Response, next: NextFunction) {
    // Skip metrics endpoint itself to avoid infinite loop
    if (req.path === '/metrics') {
      if (req.method === 'GET') {
        res.set('Content-Type', this.register.contentType);
        res.end(this.register.metrics());
      }
      return;
    }

    // Skip health endpoint from metrics
    if (req.path === '/health') {
      return next();
    }

    // Start time
    const start = process.hrtime();

    // Capture original end to intercept response
    const originalEnd = res.end;

    // Capture middleware instance for use in the response handler
    const middleware = this;

    // Override end
    res.end = function (this: Response, ...args: any[]) {
      // Calculate duration
      const duration = process.hrtime(start);
      const durationInSeconds = duration[0] + duration[1] / 1e9;

      // Normalize route path
      let route = req.route ? req.route.path : req.path;

      // For dynamic routes, replace parameters with placeholders
      if (req.params) {
        Object.keys(req.params).forEach((param) => {
          route = route.replace(req.params[param], `:${param}`);
        });
      }

      // Record metrics
      middleware.httpRequestDurationMicroseconds
        .labels(req.method, route, res.statusCode.toString())
        .observe(durationInSeconds);

      middleware.httpRequestCounter.labels(req.method, route, res.statusCode.toString()).inc();

      // Record errors separately
      if (res.statusCode >= 400) {
        middleware.httpRequestErrorCounter
          .labels(req.method, route, res.statusCode.toString())
          .inc();
      }

      // Call original end
      return originalEnd.apply(res, args);
    };

    next();
  }
}
