# Quality Assurance Guide

## Testing Strategy

### Unit Testing
- Test individual services and components
- Mock external dependencies (Redis, Flash API)
- Achieve >80% code coverage
- Run with: `yarn test`

### Integration Testing
- Test service interactions
- Use test Redis instance
- Mock WhatsApp Web.js client
- Run with: `yarn test:e2e`

### Manual Testing Checklist

#### Account Linking Flow
- [ ] Send "link" command
- [ ] Receive OTP via Flash app
- [ ] Enter correct OTP - verify success
- [ ] Enter incorrect OTP - verify error
- [ ] Try expired OTP - verify rejection
- [ ] Check session persistence

#### Balance Checking
- [ ] Send "balance" when linked
- [ ] Verify correct currency display
- [ ] Send "balance" when unlinked - verify error
- [ ] Send "refresh" to update balance
- [ ] Verify 2 decimal precision
- [ ] Test multiple currencies (USD, JMD, EUR)

#### Error Handling
- [ ] Send unknown command
- [ ] Test with Flash API down
- [ ] Test with Redis down
- [ ] Test network timeouts
- [ ] Verify graceful error messages

#### Performance Testing
- [ ] Send rapid commands
- [ ] Verify rate limiting
- [ ] Check cache effectiveness
- [ ] Monitor memory usage
- [ ] Test concurrent users

## Test Data

### Test Phone Numbers
```
+1234567890 - Test account with USD
+8769876543 - Test account with JMD
+441234567890 - Test account with EUR
```

### Test Commands
```
help - Show available commands
link - Start account linking
verify 123456 - Complete verification
balance - Check wallet balance
refresh - Force balance update
```

## Automated Testing

### CI/CD Pipeline
- Runs on every pull request
- Executes unit and integration tests
- Performs linting and type checking
- Generates coverage reports

### Test Coverage Requirements
- Minimum 80% overall coverage
- 100% coverage for critical paths:
  - Authentication flow
  - Balance calculation
  - Currency conversion

## Security Testing

### Authentication
- [ ] OTP expires after 5 minutes
- [ ] Rate limiting on verification attempts
- [ ] Session tokens properly encrypted
- [ ] No sensitive data in logs

### API Security
- [ ] Auth tokens never exposed
- [ ] GraphQL queries parameterized
- [ ] Input validation on all commands
- [ ] XSS prevention in responses

### Data Protection
- [ ] Redis data encrypted
- [ ] Environment variables secured
- [ ] No hardcoded credentials
- [ ] Audit logs maintained

## Performance Benchmarks

### Response Times
- Command parsing: <10ms
- Balance query (cached): <50ms
- Balance query (fresh): <500ms
- AI response: <2s

### Throughput
- 100+ concurrent users
- 1000+ messages/minute
- 99.9% uptime target

## Bug Reporting

### Template
```markdown
**Description**: Brief description of the issue
**Steps to Reproduce**:
1. Send command X
2. Wait for response
3. See error

**Expected**: What should happen
**Actual**: What actually happened
**Environment**: Development/Production
**Screenshots**: If applicable
```

### Severity Levels
- **Critical**: Service down, data loss
- **High**: Feature broken, security issue
- **Medium**: Performance degradation
- **Low**: UI/UX issues, typos

## Release Checklist

### Pre-Release
- [ ] All tests passing
- [ ] Security scan completed
- [ ] Documentation updated
- [ ] Environment variables documented
- [ ] Docker image builds successfully

### Post-Release
- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Verify all features working
- [ ] Update version numbers
- [ ] Tag release in Git