import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

// Mock amqplib at the module level
jest.mock('amqplib', () => {
  // Create mocks with proper TypeScript types
  const mockChannel = {
    assertQueue: jest.fn().mockResolvedValue({}),
    sendToQueue: jest.fn().mockReturnValue(true),
    consume: jest.fn().mockImplementation((queue, callback) => {
      // Store callback for later use in tests
      mockChannel.consumeCallback = callback;
      return Promise.resolve({});
    }),
    consumeCallback: null,
    ack: jest.fn(),
    reject: jest.fn(),
    close: jest.fn().mockResolvedValue({}),
  };

  const mockConnection = {
    createChannel: jest.fn().mockResolvedValue(mockChannel),
    on: jest.fn(),
    close: jest.fn().mockResolvedValue({}),
  };

  return {
    connect: jest.fn().mockResolvedValue(mockConnection),
    // Expose the mocks for test verification
    __getMockChannel: () => mockChannel,
    __getMockConnection: () => mockConnection,
  };
});

describe('EventsService', () => {
  let service: EventsService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              switch (key) {
                case 'rabbitmq.url':
                  return 'amqp://localhost:5672';
                case 'rabbitmq.queueName':
                  return 'test-queue';
                default:
                  return undefined;
              }
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    configService = module.get<ConfigService>(ConfigService);

    // Call onModuleInit manually as Jest doesn't trigger lifecycle hooks
    await service.onModuleInit();
  });

  afterEach(async () => {
    // Clean up
    await service.onModuleDestroy();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should connect to RabbitMQ on init', () => {
    expect(amqp.connect).toHaveBeenCalledWith('amqp://localhost:5672');
  });

  describe('publishEvent', () => {
    it('should publish an event to RabbitMQ', async () => {
      const eventType = 'test-event';
      const eventData = { test: 'data' };
      const mockChannel = require('amqplib').__getMockChannel();

      const result = await service.publishEvent(eventType, eventData);

      // Check that sendToQueue was called with correct parameters
      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        'test-queue',
        expect.any(Buffer),
        expect.objectContaining({
          persistent: true,
          contentType: 'application/json',
        }),
      );

      // Verify the result
      expect(result).toBe(true);

      // Check the message content
      const sentMessage = JSON.parse(mockChannel.sendToQueue.mock.calls[0][1].toString());
      expect(sentMessage.type).toBe(eventType);
      expect(sentMessage.data).toEqual(eventData);
      expect(sentMessage.timestamp).toBeDefined();
    });
  });

  describe('subscribeToEvents', () => {
    it('should subscribe to events with a callback function', async () => {
      // Create a mock callback
      const mockCallback = jest.fn();
      const mockChannel = require('amqplib').__getMockChannel();

      // Subscribe to events
      await service.subscribeToEvents(mockCallback);

      // Check that consume was called with the correct queue name
      expect(mockChannel.consume).toHaveBeenCalledWith('test-queue', expect.any(Function));

      // Get the callback that was registered
      const registeredCallback = mockChannel.consume.mock.calls[0][1];

      // Test the callback by simulating a message
      const mockMsg = {
        content: Buffer.from(
          JSON.stringify({
            type: 'test-event',
            data: { id: 123 },
            timestamp: new Date().toISOString(),
          }),
        ),
      };

      // Call the registered callback directly
      await registeredCallback(mockMsg);

      // Verify callback was called with correct args
      expect(mockCallback).toHaveBeenCalledWith('test-event', { id: 123 });

      // Verify message was acknowledged
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    });
  });
});
