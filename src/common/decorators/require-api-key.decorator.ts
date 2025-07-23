import { UseGuards, applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse, ApiHeader } from '@nestjs/swagger';
import { ApiKeyGuard } from '../guards/api-key.guard';

export function RequireApiKey() {
  return applyDecorators(
    UseGuards(ApiKeyGuard),
    ApiHeader({
      name: 'x-api-key',
      description: 'API key for authentication',
      required: true,
    }),
    ApiUnauthorizedResponse({ 
      description: 'Invalid or missing API key',
      schema: {
        type: 'object',
        properties: {
          statusCode: { type: 'number', example: 401 },
          message: { type: 'string', example: 'Invalid API key' },
          error: { type: 'string', example: 'Unauthorized' }
        }
      }
    })
  );
}