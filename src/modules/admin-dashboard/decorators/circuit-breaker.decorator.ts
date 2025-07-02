import { Logger } from '@nestjs/common';

interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeout?: number;
  timeout?: number;
}

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime?: Date;
  private readonly logger = new Logger('CircuitBreaker');

  constructor(
    private readonly name: string,
    private readonly options: CircuitBreakerOptions = {},
  ) {
    this.options.failureThreshold = options.failureThreshold || 5;
    this.options.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.options.timeout = options.timeout || 10000; // 10 seconds
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
      } else {
        throw new Error(`Circuit breaker is OPEN for ${this.name}`);
      }
    }

    try {
      const result = await this.executeWithTimeout(operation);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Operation timeout for ${this.name}`)),
          this.options.timeout,
        ),
      ),
    ]);
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === CircuitState.HALF_OPEN) {
      this.logger.log(`Circuit breaker ${this.name} is now CLOSED`);
    }
    this.state = CircuitState.CLOSED;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.failureCount >= this.options.failureThreshold!) {
      this.state = CircuitState.OPEN;
      this.logger.warn(`Circuit breaker ${this.name} is now OPEN after ${this.failureCount} failures`);
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;
    const timeSinceLastFailure = Date.now() - this.lastFailureTime.getTime();
    return timeSinceLastFailure >= this.options.resetTimeout!;
  }
}

// Store circuit breakers by method
const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Circuit breaker decorator to protect critical operations
 */
export function WithCircuitBreaker(options?: CircuitBreakerOptions) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const className = target.constructor.name;
    const methodName = `${className}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      let circuitBreaker = circuitBreakers.get(methodName);
      if (!circuitBreaker) {
        circuitBreaker = new CircuitBreaker(methodName, options);
        circuitBreakers.set(methodName, circuitBreaker);
      }

      return circuitBreaker.execute(() => originalMethod.apply(this, args));
    };

    return descriptor;
  };
}