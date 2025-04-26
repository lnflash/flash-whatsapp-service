# Phase 3: Core Functionality - Detailed Implementation Plan

Based on our experience implementing Phases 1 and 2, this document outlines a detailed, step-by-step plan for implementing Phase 3 of the Flash WhatsApp Bot Service.

## Overview

Phase 3 focuses on implementing the core functionalities that will provide value to Flash users:
- Balance checking with proper MFA
- Payment notifications
- AI-powered support
- Event-driven communication

## Lessons Learned from Phases 1 & 2

1. **Error Handling & Type Safety**
   - Strengthen null checks and type assertions
   - Implement more robust error boundaries

2. **Testing Strategy**
   - Write unit tests alongside components rather than after
   - Mock external dependencies consistently

3. **Dependency Management**
   - Carefully manage async dependency initialization
   - Improve handling of service unavailability

## Detailed Implementation Plan

### Step 1: Balance Check Enhancement

1. **Create Balance Service**
   - Create `/src/modules/flash-api/services/balance.service.ts`
   - Implement secure balance query to Flash API
   - Add proper error handling and retry logic

2. **Implement Rich Message Templates**
   - Create `/src/modules/whatsapp/templates/balance-template.ts`
   - Design human-friendly balance presentation
   - Support both BTC and fiat currency displays

3. **Add Caching Layer**
   - Implement balance caching with short TTL
   - Add invalidation triggers for relevant events
   - Ensure proper data encryption

4. **Enhance MFA Requirements**
   - Refine MFA guard for financial operations
   - Add risk-based MFA triggering (e.g., time-based, amount-based)
   - Improve session timeout handling

**Technical Considerations:**
- Use GraphQL fragments for consistent API responses
- Implement proper numeric handling for Bitcoin amounts
- Ensure currency formatting is locale-aware

### Step 2: Payment Notification System

1. **Create Notification Module**
   - Set up `/src/modules/notifications` directory structure
   - Design notification models and DTOs
   - Create notification template engine

2. **Implement Event Listeners**
   - Connect to RabbitMQ events for payment events
   - Create handlers for different notification types
   - Implement idempotent notification processing

3. **Outbound Message Queue**
   - Build reliable outbound message queue
   - Implement retry logic for failed sends
   - Add delivery confirmation tracking

4. **User Preferences**
   - Create notification preferences storage
   - Implement opt-in/opt-out functionality
   - Add notification frequency controls

**Technical Considerations:**
- Use message acknowledgment to prevent duplicate notifications
- Implement backoff strategy for failed sends
- Use transaction IDs for deduplication

### Step 3: AI Support Integration Enhancement

1. **Enhance Context Management**
   - Refine context passing to Maple AI
   - Implement conversation memory with proper security
   - Create context pruning for long conversations

2. **Build Conversation Flows**
   - Implement guided conversation patterns
   - Create fallback mechanisms for AI failures
   - Add quick-reply suggestions for common questions

3. **Implement FAQ Knowledge Base**
   - Create structured FAQ repository
   - Add retrieval-augmented generation for accurate answers
   - Implement periodic knowledge base updates

4. **User Feedback Mechanism**
   - Add simple feedback collection for AI responses
   - Implement feedback logging for improvement
   - Create reporting for AI performance

**Technical Considerations:**
- Use throttling to prevent API abuse
- Implement proper logging for AI interactions
- Create circuit breakers for AI service dependency

### Step 4: Command Engine Enhancement

1. **Extend Command Parser**
   - Add more command patterns and aliases
   - Implement fuzzy matching for commands
   - Add contextual command suggestions

2. **Add Transaction Commands**
   - Create payment request command
   - Implement transaction history command
   - Add invoice generation command

3. **Implement Help System**
   - Create detailed, context-aware help
   - Build command category organization
   - Add progressive disclosure of commands

4. **Create Admin Commands**
   - Implement service status commands
   - Add user management commands
   - Create analytics and reporting commands

**Technical Considerations:**
- Use command registry pattern for extensibility
- Implement proper permission checking
- Add telemetry for command usage

### Step 5: Integration & Testing

1. **Integration Testing**
   - Create end-to-end tests for main user flows
   - Build integration test environment with mocks
   - Implement contract tests for API dependencies

2. **Load Testing**
   - Design performance testing scenarios
   - Implement simulated load patterns
   - Create performance baselines and thresholds

3. **Security Review**
   - Conduct comprehensive security audit
   - Implement additional security measures
   - Document security considerations

4. **Documentation**
   - Update API documentation
   - Create operational guides
   - Document user flows and edge cases

## Technical Challenges and Solutions

### Challenge 1: Reliable Event Processing
**Solution:** Implement the Outbox Pattern to ensure event publication reliability. Events will be stored in the database first, then published to RabbitMQ by a separate process.

### Challenge 2: Maintaining Conversation Context
**Solution:** Store conversation state in Redis with proper encryption, implementing a TTL-based strategy to manage conversation memory.

### Challenge 3: Handling API Downtime
**Solution:** Implement circuit breakers for all external API calls with proper fallback mechanisms and user-friendly degradation.

### Challenge 4: Securing Sensitive Data
**Solution:** Enhance data minimization practices with a clear data lifecycle policy, ensuring sensitive information is never persisted longer than necessary.

## Timeline and Milestones

1. **Week 1: Balance Check Enhancement**
   - Day 1-2: Implement Balance Service
   - Day 3-4: Create Rich Message Templates
   - Day 5: Implement Caching Layer

2. **Week 2: Payment Notification System**
   - Day 1-2: Create Notification Module
   - Day 3: Implement Event Listeners
   - Day 4-5: Build Outbound Message Queue

3. **Week 3: AI Support Integration**
   - Day 1-2: Enhance Context Management
   - Day 3-4: Build Conversation Flows
   - Day 5: Implement FAQ Knowledge Base

4. **Week 4: Command Engine & Integration**
   - Day 1-2: Extend Command Parser
   - Day 3: Add Transaction Commands
   - Day 4-5: Integration Testing and Documentation

## Dependencies and Prerequisites

1. Access to Flash API endpoints for balance and transaction data
2. Twilio API credentials configured for production use
3. Maple AI API access with required models and capabilities
4. RabbitMQ instance configured with required queues and exchanges
5. Redis instance with appropriate memory allocation

## Conclusion

Phase 3 will deliver the core value proposition of the Flash WhatsApp Service, enabling users to check balances, receive notifications, and get AI-powered support. This phase builds on the secure foundation established in Phases 1 and 2, with a focus on reliability, performance, and user experience.

By following this detailed plan, the development team can implement Phase 3 efficiently, with clear milestones and a focus on quality and security.