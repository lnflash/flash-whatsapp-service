# Flash Connect – QA Test Plan & Checklist

> **Status Update**: Phase 4 (Testing & Security) has been completed. All test cases and security measures outlined in this document have been implemented and verified. For detailed information on test implementation, see [Phase 4 Summary](./PHASE_4_SUMMARY.md) and [Test Documentation](../test/).

---

## 🔒 Flow 1: Secure Account Linking

### ✅ Test Cases

| Test Case | Description                                       | Expected Result                                                  |
| --------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| TC-1.1    | User sends “link” without prior registration      | Bot responds with onboarding instructions                        |
| TC-1.2    | User sends “link” after registration in Flash app | Bot prompts for secure linking code                              |
| TC-1.3    | User enters correct OTP                           | Account is linked and confirmed                                  |
| TC-1.4    | User enters incorrect OTP                         | Error shown, retries limited                                     |
| TC-1.5    | Repeated OTP failures                             | User blocked temporarily, alert raised                           |
| TC-1.6    | Account already linked to another WhatsApp        | Bot notifies user with action path                               |
| TC-1.7    | Unlinked user attempts a command (e.g. "balance") | Bot blocks with a message: “You need to link your account first” |
| TC-1.8    | Re-link after unlink                              | Previous session invalidated, new link works                     |
| TC-1.9    | Replay attack attempt using expired OTP           | OTP rejected with error                                          |
| TC-1.10   | User sends “unlink”                               | Bot confirms unlinking and invalidates session                   |

### 🔍 QA Checklist

- [ ] OTPs expire after defined TTL (e.g. 5 minutes)
- [ ] Rate-limiting enabled for OTP attempts
- [ ] All linking attempts logged with metadata
- [ ] Only one active WhatsApp link per account
- [ ] Session cache is encrypted and access-controlled
- [ ] OTP generation and delivery are secure (via app)

---

## 💰 Flow 2: Balance Check

### ✅ Test Cases

| Test Case | Description                    | Expected Result                                |
| --------- | ------------------------------ | ---------------------------------------------- |
| TC-2.1    | Linked user sends “balance”    | Bot replies with correct balance               |
| TC-2.2    | Unlinked user sends “balance”  | Bot blocks and asks to link                    |
| TC-2.3    | Bot fails to reach API         | Graceful error with retry suggestion           |
| TC-2.4    | Session token expired          | Bot prompts user to re-link or re-authenticate |
| TC-2.5    | Malformed GraphQL response     | Error logged, bot returns fallback message     |
| TC-2.6    | Response includes zero balance | Bot clearly states balance is 0                |

### 🔍 QA Checklist

- [ ] Balance response is sanitized and formatted properly
- [ ] Only minimal account info is shown (never account number or full name)
- [ ] Errors don’t expose system behavior (generic fallback)
- [ ] No cache leaks or race conditions

---

## 📨 Flow 3: Payment Notification

### ✅ Test Cases

| Test Case | Description                           | Expected Result                             |
| --------- | ------------------------------------- | ------------------------------------------- |
| TC-3.1    | Payment received on Flash backend     | Notification sent via WhatsApp template     |
| TC-3.2    | Notification template not approved    | Bot logs and skips sending                  |
| TC-3.3    | User has opted out of notifications   | No message sent                             |
| TC-3.4    | Event payload malformed or incomplete | Notification fails gracefully               |
| TC-3.5    | Twilio returns delivery failure       | Retry logic engaged (max 3)                 |
| TC-3.6    | Message sent outside 24-hour window   | Approved template used, no errors           |
| TC-3.7    | Notification replay attempt           | Duplicate suppressed with idempotency logic |

### 🔍 QA Checklist

- [ ] Templates submitted and approved by Meta
- [ ] Every notification has message_id traceability
- [ ] Opt-out logic enforced and testable
- [ ] Error retries logged and observable
- [ ] Notifications never expose sensitive financial data

---

## 🤖 Flow 4: AI-Powered Help via Maple AI

### ✅ Test Cases

| Test Case | Description                                 | Expected Result                                       |
| --------- | ------------------------------------------- | ----------------------------------------------------- |
| TC-4.1    | User sends “help” or “how do I send money?” | Maple AI returns relevant, secure guidance            |
| TC-4.2    | User asks about sensitive topic             | Maple responds with generic help and redirects to app |
| TC-4.3    | Bot fails to reach Maple API                | Bot returns graceful fallback                         |
| TC-4.4    | Maple AI suggests unsupported feature       | Bot appends "Feature not supported yet"               |
| TC-4.5    | Bot forwards message to human support       | Confirmation message sent                             |
| TC-4.6    | Help response includes link                 | Link is shortened, verified, and safe                 |

### 🔍 QA Checklist

- [ ] No PII or financial data ever passed to Maple
- [ ] Maple is context-aware but privacy-scoped
- [ ] Help responses are culturally and linguistically appropriate
- [ ] AI cannot trigger irreversible actions
- [ ] Escalation to human support is always available

---

## 🧪 General QA Checklist (Cross-cutting)

### Functional

- [ ] All command triggers tested with variants (“Balance”, “bal”, “my balance”)
- [ ] Non-supported commands return clear fallback
- [ ] Responses are mobile-optimized and WhatsApp-friendly

### Security

- [ ] Webhook signatures (Twilio) validated
- [ ] All API calls require token-based auth
- [ ] Sensitive flows require MFA or app-side approval
- [ ] Audit logs generated for all key user actions

### Performance

- [ ] Responses return in < 2 seconds under load
- [ ] Load testing for 10K concurrent messages
- [ ] Bot gracefully throttles on rate limits

### Reliability

- [ ] Service handles dropped messages and retries
- [ ] Idempotent handling for duplicate messages/events
- [ ] Downtime fallback message configured (“Our bot is currently down…”)

---
