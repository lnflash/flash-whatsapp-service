# BTC Wallet Policy

## Important: BTC Wallets Should Be Disabled/Hidden by Default

### Overview
Flash BTC wallets are **non-custodial**, meaning Flash cannot see, control, or manage the BTC wallet balance. This is fundamentally different from USD wallets which are custodial.

### Key Points

1. **Non-Custodial Nature**
   - BTC wallets are controlled entirely by the user
   - Flash has no visibility into BTC wallet balances
   - Flash cannot recover lost BTC wallet funds
   - Flash cannot freeze or control BTC wallets

2. **Default Behavior**
   - **ALWAYS** prioritize USD wallets in the WhatsApp bot
   - **HIDE** BTC wallet functionality unless explicitly requested
   - **DEFAULT** to USD for all transactions and displays
   - **AVOID** showing BTC balances in notifications

3. **Implementation Guidelines**
   - Balance checks should show USD balance only
   - Payment notifications should display USD amounts
   - Send/receive commands should default to USD
   - BTC functionality should only be accessible through advanced commands

4. **User Experience Rationale**
   - Simplifies user experience for mainstream users
   - Reduces confusion about wallet types
   - Prevents accidental loss of funds in non-custodial wallets
   - Aligns with Flash's focus on easy, accessible payments

### Code Implementation Notes

When implementing features:
- Check for USD wallet first: `balance.fiatBalance > 0 || balance.btcBalance === 0`
- Only show BTC if user explicitly has BTC and no USD
- Payment notifications should show USD balance, not BTC
- Default all transactions to USD wallets

### Future Considerations
If BTC wallet support is added in the future, it should be:
- Explicitly opt-in
- Clearly marked as advanced functionality
- Include warnings about non-custodial nature
- Require additional confirmation steps