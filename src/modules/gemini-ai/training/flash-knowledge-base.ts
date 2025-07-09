/**
 * Pulse Knowledge Base
 * This file contains structured information to train the AI for accurate responses
 *
 * Pulse: A WhatsApp bot that captures the pulse of people as they share what's on their mind,
 * hoping for electric zaps (Lightning payments) to their wallet - just like blood flowing
 * through veins being pushed by electric compressions in the heart.
 */

export interface TrainingExample {
  question: string;
  answer: string;
  category: string;
  keywords: string[];
}

export interface CommandInfo {
  command: string;
  description: string;
  usage: string;
  examples: string[];
  requiresAuth: boolean;
  notes?: string;
}

export const FLASH_COMMANDS: CommandInfo[] = [
  {
    command: 'balance',
    description: 'Check your USD balance',
    usage: 'balance',
    examples: ['balance'],
    requiresAuth: true,
    notes:
      'Shows your USD balance. BTC balances are hidden by default as BTC wallets are non-custodial.',
  },
  {
    command: 'send',
    description: 'Send money to another user',
    usage: 'send [amount] to [recipient]',
    examples: [
      'send 10 to @username',
      'send 5.50 to john',
      'send 25 to +18765551234',
      'send 100 to lnbc...',
    ],
    requiresAuth: true,
    notes:
      'Send money to Flash users, saved contacts, phone numbers, or pay Lightning invoices. All amounts are in USD regardless of your display currency.',
  },
  {
    command: 'refresh',
    description: 'Refresh your balance by clearing the cache',
    usage: 'refresh',
    examples: ['refresh'],
    requiresAuth: true,
    notes: 'Useful if balance seems outdated',
  },
  {
    command: 'receive',
    description: 'Create a USD Lightning invoice to receive payments',
    usage: 'receive [amount] [optional memo]',
    examples: [
      'receive 10',
      'receive 25.50',
      'receive 100 Payment for services',
      'receive 5.99 Coffee payment',
    ],
    requiresAuth: true,
    notes:
      'All amounts are in USD regardless of your display currency. Amount must be between $0.01 and $10,000. Memo is optional and limited to 200 characters.',
  },
  {
    command: 'history',
    description: 'View recent transaction history',
    usage: 'history',
    examples: ['history', 'transactions', 'txs'],
    requiresAuth: true,
    notes: 'Shows your last 10 transactions with dates, amounts, and counterparties',
  },
  {
    command: 'request',
    description: 'Request payment from another user',
    usage: 'request [amount] from [target]',
    examples: [
      'request 10 from @john',
      'request 25.50 from @alice 18765551234',
      'request 100 from 18765551234',
      'request 50 from john (saved contact)',
    ],
    requiresAuth: true,
    notes:
      'Creates a payment request. All amounts are in USD regardless of your display currency. Target can be: @username, phone number, or saved contact name. Can send via WhatsApp if phone number is known.',
  },
  {
    command: 'contacts',
    description: 'Manage saved contacts for payment requests',
    usage: 'contacts [action] [name] [phone]',
    examples: [
      'contacts',
      'contacts list',
      'contacts add john 18765551234',
      'contacts remove john',
    ],
    requiresAuth: true,
    notes: 'Save frequently used contacts to easily request payments by name.',
  },
  {
    command: 'price',
    description: 'Check current Bitcoin price',
    usage: 'price',
    examples: ['price'],
    requiresAuth: false,
    notes: 'Shows current BTC price in USD',
  },
  {
    command: 'username',
    description: 'View or set your username (one-time only)',
    usage: 'username [new_username]',
    examples: ['username', 'username john_doe'],
    requiresAuth: true,
    notes: 'Username can only be set once and cannot be changed',
  },
  {
    command: 'link',
    description: 'Connect your Flash account to WhatsApp',
    usage: 'link',
    examples: ['link'],
    requiresAuth: false,
    notes: 'Starts the account linking process with OTP verification',
  },
  {
    command: 'unlink',
    description: 'Disconnect your Flash account from WhatsApp',
    usage: 'unlink',
    examples: ['unlink'],
    requiresAuth: true,
    notes: 'Removes the connection between Flash and WhatsApp',
  },
  {
    command: 'verify',
    description: 'Complete OTP verification for account linking',
    usage: 'Just type the 6-digit code',
    examples: ['123456'],
    requiresAuth: false,
    notes: 'During account linking, just type the 6-digit code you receive',
  },
  {
    command: 'consent',
    description: 'Manage your AI support consent',
    usage: 'Type "yes" or "no" when prompted',
    examples: ['yes', 'no', 'consent yes', 'consent no'],
    requiresAuth: false,
    notes: 'When asked for consent, just type "yes" or "no"',
  },
  {
    command: 'help',
    description: 'Show available commands',
    usage: 'help',
    examples: ['help'],
    requiresAuth: false,
    notes: 'Lists all available commands',
  },
  {
    command: 'pending',
    description: 'Check pending payments (sent/received)',
    usage: 'pending [sent|received|claim <code>]',
    examples: ['pending', 'pending sent', 'pending received', 'pending claim ABC123'],
    requiresAuth: false,
    notes: 'View pending payments. Received payments auto-claim when you link your account',
  },
  {
    command: 'voice',
    description: 'Manage voice settings and voice responses',
    usage: 'voice [on|off|only|list|add|remove|select]',
    examples: [
      'voice on',
      'voice off',
      'voice only',
      'voice list',
      'voice add alice A1B2C3D4',
      'voice remove alice',
      'voice select alice',
      'voice balance (get balance with voice)',
      'voice help (get help with voice)',
    ],
    requiresAuth: false,
    notes:
      'Control voice responses. "on" enables voice for AI when keywords used, "off" disables all voice, "only" gives voice-only responses (no text). Can add custom voices with voice IDs from ElevenLabs.',
  },
];

export const TRAINING_EXAMPLES: TrainingExample[] = [
  {
    question: 'What is Pulse?',
    answer: `I'm Pulse, your WhatsApp Bitcoin wallet assistant. I help you send/receive money using your Flash account.`,
    category: 'general',
    keywords: ['pulse', 'what', 'who', 'bot', 'assistant'],
  },
  {
    question: 'Who is Pulse?',
    answer: `I'm Pulse, a WhatsApp bot that helps you manage your Flash wallet. Type 'help' to see what I can do!`,
    category: 'general',
    keywords: ['pulse', 'who', 'bot', 'identity'],
  },
  {
    question: 'How do I use Flash?',
    answer:
      'To use Flash, simply type "help" to see available commands. You can check your balance, receive payments, send money, and more.',
    category: 'general',
    keywords: ['use', 'how', 'get started', 'commands'],
  },
  // Balance related
  {
    question: 'How do I check my balance?',
    answer:
      'To check your balance, simply type "balance". You\'ll see your USD balance and its equivalent in your local currency (JMD).',
    category: 'balance',
    keywords: ['balance', 'check', 'money', 'funds', 'account'],
  },
  {
    question: 'Why is my balance not updating?',
    answer:
      'If your balance isn\'t updating, type "refresh" to clear the cache and get the latest balance. This forces a fresh fetch from the server.',
    category: 'balance',
    keywords: ['balance', 'update', 'refresh', 'cache', 'not updating'],
  },
  {
    question: "Why don't I see my BTC balance?",
    answer:
      'The WhatsApp bot shows your USD balance by default for simplicity and safety. BTC wallets are non-custodial, meaning Flash cannot see or control them. For BTC balance details, please use the Flash mobile app.',
    category: 'balance',
    keywords: ['btc', 'bitcoin', 'balance', 'wallet', 'non-custodial'],
  },
  {
    question: 'Can I see my Bitcoin balance?',
    answer:
      'The WhatsApp bot focuses on USD balances for ease of use. BTC wallets are non-custodial (Flash cannot access them), so for complete wallet details including BTC, please use the Flash mobile app.',
    category: 'balance',
    keywords: ['bitcoin', 'btc', 'balance', 'see', 'check'],
  },

  // Receive/Invoice related
  {
    question: 'How do I receive money?',
    answer:
      'To receive money, use the "receive" command followed by the amount in USD. For example: "receive 10" creates an invoice for $10. You can add an optional memo: "receive 10 Coffee payment". Note: All amounts are in USD regardless of your display currency.',
    category: 'receive',
    keywords: ['receive', 'money', 'payment', 'invoice', 'lightning'],
  },
  {
    question: 'Can I receive Bitcoin directly?',
    answer:
      'Currently, the receive command only supports USD amounts. BTC invoices are not available at this time. All amounts should be specified in USD (e.g., "receive 25" for $25).',
    category: 'receive',
    keywords: ['receive', 'bitcoin', 'btc', 'crypto'],
  },

  // Send related
  {
    question: 'How do I send money?',
    answer:
      'To send money, use "send [amount] to [recipient]". For example: "send 10 to @john" or "send 25.50 to mary". All amounts are in USD regardless of your display currency. Recipients can be @usernames, phone numbers, saved contacts, or Lightning invoices.',
    category: 'send',
    keywords: ['send', 'money', 'payment', 'transfer'],
  },
  {
    question: 'Are all amounts in USD?',
    answer:
      'Yes, all amounts in commands (send, receive, request) are in USD, regardless of your display currency. If your balance shows in JMD, you still enter amounts in USD. For example, "send 10 to @john" sends $10 USD.',
    category: 'general',
    keywords: ['amount', 'usd', 'currency', 'jmd', 'dollar'],
  },
  {
    question: "What's the maximum amount I can receive?",
    answer:
      'You can receive amounts between $0.01 and $10,000 USD. The memo is optional and limited to 200 characters.',
    category: 'receive',
    keywords: ['receive', 'maximum', 'limit', 'amount'],
  },

  // Account linking
  {
    question: 'How do I connect my Flash account?',
    answer:
      'To connect your Flash account to WhatsApp, type "link". You\'ll receive an OTP code in your Flash app. Then use "verify [code]" to complete the linking.',
    category: 'linking',
    keywords: ['link', 'connect', 'account', 'setup'],
  },
  {
    question: 'I want to disconnect my account',
    answer:
      'To disconnect your Flash account from WhatsApp, type "unlink". This will remove the connection and you\'ll need to link again to use account features.',
    category: 'linking',
    keywords: ['unlink', 'disconnect', 'remove', 'logout'],
  },

  // Username related
  {
    question: 'How do I set my username?',
    answer:
      'To set your username, type "username" followed by your desired username. For example: "username john_doe". Note: usernames can only be set once and cannot be changed.',
    category: 'username',
    keywords: ['username', 'name', 'handle', 'identity'],
  },
  {
    question: 'Can I change my username?',
    answer:
      'No, usernames can only be set once and are permanent. Choose carefully when setting your username.',
    category: 'username',
    keywords: ['username', 'change', 'modify', 'update'],
  },

  // General Flash info
  {
    question: 'What is Flash?',
    answer:
      'Flash is a Bitcoin wallet and payment app designed for the Caribbean market, starting with Jamaica. It allows you to store, send, and receive Bitcoin and make seamless digital payments.',
    category: 'general',
    keywords: ['flash', 'what', 'about', 'app'],
  },
  {
    question: 'Is Flash safe?',
    answer:
      'Yes, Flash uses industry-standard security measures including encryption and multi-factor authentication to protect your funds. Never share your password or private keys with anyone.',
    category: 'security',
    keywords: ['safe', 'security', 'secure', 'trust'],
  },
  {
    question: 'What countries is Flash available in?',
    answer:
      'Flash is currently available in Jamaica, with plans to expand to Trinidad & Tobago, Barbados, and other Caribbean countries soon.',
    category: 'availability',
    keywords: ['countries', 'available', 'where', 'location'],
  },

  // Lightning Address
  {
    question: 'What is a Lightning Address?',
    answer:
      "A Lightning Address looks like an email (e.g., john@flashapp.me) but it's for receiving Bitcoin payments. It's a human-readable way to receive money instead of using long invoice codes. Think of it as your payment email - simple to share and remember!",
    category: 'lightning',
    keywords: ['lightning', 'address', 'email', 'receive', 'payment'],
  },
  {
    question: 'How do Lightning Addresses work?',
    answer:
      "Lightning Addresses work by automatically creating payment invoices when someone wants to send you money. When someone sends to your address (like john@flashapp.me), the system generates a Lightning invoice in the background. It's like having a permanent payment link that always works!",
    category: 'lightning',
    keywords: ['lightning', 'address', 'work', 'how', 'function'],
  },
  {
    question: 'Can I get a Lightning Address?',
    answer:
      'Lightning Addresses are currently being rolled out to Flash users. Premium features like custom Lightning Addresses may be available soon. For now, you can receive payments using the "receive" command to create invoices.',
    category: 'lightning',
    keywords: ['lightning', 'address', 'get', 'create', 'obtain'],
  },
  {
    question: "What's the difference between a Lightning Address and a Lightning invoice?",
    answer:
      'A Lightning invoice (starting with "lnbc") is a one-time payment request that expires. A Lightning Address (like john@flashapp.me) is permanent and reusable - it creates fresh invoices automatically each time someone sends you money. Address = permanent, Invoice = temporary.',
    category: 'lightning',
    keywords: ['lightning', 'address', 'invoice', 'difference', 'compare'],
  },
  {
    question: 'How do I send money to a Lightning Address?',
    answer:
      'To send to a Lightning Address, many wallets support entering it directly (like john@flashapp.me). In Flash, this feature is coming soon. For now, ask the recipient to use "receive" command to generate an invoice you can pay.',
    category: 'lightning',
    keywords: ['send', 'lightning', 'address', 'pay', 'transfer'],
  },
  {
    question: 'Are Lightning Addresses secure?',
    answer:
      "Yes! Lightning Addresses are secure. They only allow people to SEND you money, not take it. Each payment still requires the sender to confirm the amount. It's like sharing your email - people can send to it but can't access your account.",
    category: 'lightning',
    keywords: ['lightning', 'address', 'secure', 'safe', 'security'],
  },
  {
    question: "Lightning Address explain it like I'm 5",
    answer:
      'A Lightning Address is like a magic mailbox for money! Instead of giving people a long, confusing code every time, you give them something easy like "yourname@flashapp.me". When they put money in your magic mailbox, it automatically comes to your wallet!',
    category: 'lightning',
    keywords: ['lightning', 'address', 'simple', 'explain', 'eli5', 'easy'],
  },
  {
    question: 'Technical explanation of Lightning Address',
    answer:
      'Lightning Address is an internet identifier (like email) that provides a simple way to receive Lightning payments. It uses LNURL-pay protocol underneath, where the address resolves to an HTTPS endpoint that returns Lightning invoices on demand. When someone sends to your address, their wallet queries the endpoint, receives payment details, and completes the transaction. It abstracts away the complexity of invoice generation and sharing.',
    category: 'lightning',
    keywords: ['lightning', 'address', 'technical', 'lnurl', 'protocol', 'advanced'],
  },

  // Voice features
  {
    question: 'How do I enable voice responses?',
    answer:
      'To enable voice responses, type "voice on". This will give you voice notes when you use keywords like "voice", "speak", or "audio" in your messages. For voice-only mode (no text), type "voice only". To disable voice completely, type "voice off".',
    category: 'voice',
    keywords: ['voice', 'enable', 'audio', 'speak', 'turn on'],
  },
  {
    question: 'How do I add a new voice?',
    answer:
      'To add a custom voice, use "voice add [name] [voice-id]". The voice ID should be from ElevenLabs. For example: "voice add sarah ABC123XYZ". You can find voice IDs in your ElevenLabs account or ask an admin for available voice IDs.',
    category: 'voice',
    keywords: ['voice', 'add', 'new', 'custom', 'elevenlabs'],
  },
  {
    question: 'How do I get voice responses with commands?',
    answer:
      'You can request voice with any command by adding "voice" before it. For example: "voice balance" gives you your balance with a voice note, "voice help" gives help with voice. You can also say things like "speak my balance" or "audio help".',
    category: 'voice',
    keywords: ['voice', 'commands', 'balance', 'speak', 'audio'],
  },
  {
    question: 'What voices are available?',
    answer:
      'Type "voice list" to see all available voices. You can then select a voice with "voice select [name]" or just "voice [name]". For example: "voice alice" or "voice select sarah".',
    category: 'voice',
    keywords: ['voice', 'list', 'available', 'options', 'choose'],
  },
  {
    question: 'How do voice modes work?',
    answer:
      'There are three voice modes: "voice on" gives you voice when you ask for it (using keywords), "voice off" disables all voice responses, and "voice only" gives you only voice notes without any text. Admin can also set system-wide voice settings.',
    category: 'voice',
    keywords: ['voice', 'modes', 'settings', 'on', 'off', 'only'],
  },
  {
    question: 'Can I get balance with voice?',
    answer:
      'Yes! Just type "voice balance" or "speak balance" or "audio balance". You\'ll get your balance information as a voice note. This works with other commands too like "voice help" or "voice price".',
    category: 'voice',
    keywords: ['voice', 'balance', 'speak', 'audio', 'command'],
  },
  {
    question: 'How do I change my voice assistant?',
    answer:
      'First type "voice list" to see available voices, then use "voice select [name]" to choose one. For example: "voice select alice". You can also just type "voice [name]" as a shortcut.',
    category: 'voice',
    keywords: ['voice', 'change', 'select', 'assistant', 'switch'],
  },
  {
    question: 'I want only voice notes, no text',
    answer:
      'Type "voice only" to enable voice-only mode. You\'ll receive all responses as voice notes without any text. To go back to normal mode, type "voice on" or "voice off".',
    category: 'voice',
    keywords: ['voice', 'only', 'no text', 'voicenote', 'audio only'],
  },

  // Support
  {
    question: 'How do I contact support?',
    answer:
      'You can contact Flash support by email at support@flashapp.me or through the "Help" section in the Flash mobile app.',
    category: 'support',
    keywords: ['support', 'help', 'contact', 'issue', 'problem'],
  },

  // Errors and troubleshooting
  {
    question: 'I got an error when trying to receive money',
    answer:
      'Common issues: 1) Make sure you\'re specifying the amount in USD, not BTC. 2) Keep memos under 200 characters. 3) Ensure the amount is between $0.01 and $10,000. If problems persist, try "refresh" and try again.',
    category: 'troubleshooting',
    keywords: ['error', 'problem', 'issue', 'receive', 'failed'],
  },
  // Migrated from tidio knowledge base

  {
    question: 'Can I send money to a different bank account?',
    answer:
      'No, Flash only allows withdrawals to the bank account associated with your verified Flash profile.',
    category: 'support',
    keywords: ['send', 'bank', 'account', 'transfer', 'withdraw'],
  },
  {
    question: 'What is the Cash out process for Pro and Merchant accounts?',
    answer: `Cash out Process (5 steps):
1) press “send”
2) enter “flash” in the destination textbox and press “next”
3) you may see a window pop up saying “you have never sent money to this address”. Check the checkbox and press “I am 100% sure”
4) enter the amount you wish to cash out and press next
5) On the confirm screen, press “Confirm Payment”
6) Contact the support team using this chat to confirm the payment.`,
    category: 'business',
    keywords: ['cash out', 'business', 'withdraw', 'bank', 'payout'],
  },
  {
    question: 'Can you provide a demo of your product or service?',
    answer:
      'Our app is live and completely free! Please visit our website at getflash.io to download the latest version. Our website will also give details about the app.',
    category: 'general',
    keywords: ['demo', 'product', 'service', 'show', 'example'],
  },
  {
    question: 'How can I contact support to confirm the success of a cashout transaction?',
    answer:
      'You can confirm a transaction by contacting support through the Flash app by going to settings -> Support or emailing support@flashapp.me with your username.',
    category: 'support',
    keywords: ['support', 'cashout', 'transaction', 'confirm', 'contact'],
  },
  {
    question: 'How can I find the contact phone number for a specific department or service?',
    answer:
      'We do not have a phone number for calling however the Support Team can be contacted through WhatsApp, the Flash app or this chat you are currently in for assistance. Just ask to speak to a human. The Support Team can direct you to the correct department.',
    category: 'support',
    keywords: ['contact', 'phone', 'department', 'service', 'support'],
  },
  {
    question: 'How many flashpoints are there in the game?',
    answer:
      'Flashpoints are not part of a game. They refer to real-world locations where users can top up or withdraw funds using Flash. Flash is a digital payment service with a mission of Connecting the Caribbean with Bitcoin. All Flashpoints can be seen on the map tab of the Flash app.',
    category: 'flashpoints',
    keywords: ['flashpoints', 'how many', 'locations', 'count', 'game'],
  },
  {
    question: 'Which flashpoints come with a flashcard?',
    answer:
      'We recommend calling flashpoints to confirm the availability of Flash cards. Some flashpoints may offer Flash cards during onboarding events or as part of their services. You can also check the badges on flashpoints on the Flash app map for locations that provide Flash cards.',
    category: 'flashpoints',
    keywords: ['flashcard', 'flashpoint', 'which', 'card', 'location'],
  },
  {
    question: 'How long does it take to upgrade my account to a business account?',
    answer:
      'The time to upgrade your account to a business account can vary. The operator will need to verify your account by sending a small test transaction, and you will need to respond with the amount received to confirm the account. Bank transfers are usually confirmed on the same-day, but may take longer if submitted during certain times such as after 2:00pm on weekdays or on weekends. You will be notified once the upgrade has been approved.',
    category: 'business',
    keywords: ['business', 'upgrade', 'account', 'time', 'duration'],
  },
  {
    question: 'How can I change the bank account linked to my app?',
    answer:
      'To change your linked bank account, contact Flash support with your request. Additional verification may be required.',
    category: 'account',
    keywords: ['bank', 'change', 'update', 'account', 'linked'],
  },
  {
    question: "Can I transfer money to another person's bank account using the app?",
    answer:
      'No, Flash only supports transfers to your own linked bank account. Transfers to third-party bank accounts are not supported.',
    category: 'transfer',
    keywords: ['transfer', 'send', 'third party', 'bank', 'account'],
  },
  {
    question: 'Is there a list of available names to choose from?',
    answer:
      'No, you can choose any username that isn’t taken. Just remember: usernames can only be set once and cannot be changed.',
    category: 'username',
    keywords: ['username', 'available', 'choose', 'list', 'names'],
  },
  {
    question: 'Does the company accept PayPal as a payment method?',
    answer:
      'No, PayPal is not currently supported. You can use your bank account or cash at a flashpoint to fund your Flash wallet. We do also support payments from all other bitcoin and lightning wallets.',
    category: 'payments',
    keywords: ['paypal', 'payment', 'method', 'accept', 'fund'],
  },
  {
    question: 'Where can I purchase a flash card?',
    answer:
      'Flash Cards are available for FREE at select flashpoints and partner locations (limited time offer). Hint: Check the Flash app map and call ahead to see if they have any available.',
    category: 'flashcard',
    keywords: ['flash card', 'buy', 'purchase', 'where', 'get'],
  },
  {
    question: 'How can I obtain a flash card?',
    answer:
      'Visit a participating flashpoint or partner location and ask to buy a Flash Card. Some may also offer them during onboarding events.',
    category: 'flashcard',
    keywords: ['flash card', 'obtain', 'get', 'buy', 'pickup'],
  },
  {
    question: 'Is there a cost associated with the product or service?',
    answer: `The Flash app is free to download and use. Some features like withdrawals or flash cards may have small fees. The only costs associated with using Flash are the transactions fees.
Transaction fees vary depending on the type of transaction:
Flash to Flash: FREE 
Flash to another App: 0.2% 
Flash to a bank account: 2% 

Our Flashpoint locations are considered Flash to Flash, but an additional fee may be assessed by Flash member locations for cash outs.`,
    category: 'pricing',
    keywords: ['cost', 'fees', 'price', 'service', 'charges'],
  },
  {
    question: 'Are flashpoints considered financial institutions?',
    answer:
      'Flashpoints are not banks. Flashpoints are not financial institutions. Flash points are considered retail outlets. You can buy goods services and vouchers from them and as member locations of the Flash network, you can earn rewards points when shopping at flashpoints. Flashpoints are agents of Flash and are not financial institutions.',
    category: 'flashpoints',
    keywords: ['flashpoints', 'financial', 'institution', 'bank', 'agents'],
  },
  {
    question: 'Can Bitcoin be used for online purchases?',
    answer:
      'Yes, you can use Bitcoin for online purchases wherever it’s accepted. Flash allows you to send BTC to supported merchants.',
    category: 'bitcoin',
    keywords: ['bitcoin', 'online', 'purchase', 'buy', 'spend'],
  },
  {
    question: 'Is the update to my account in real time when making a deposit via flashpoint?',
    answer:
      'Yes, deposits at flashpoints are reflected in your account in real time after confirmation.',
    category: 'flashpoints',
    keywords: ['deposit', 'flashpoint', 'real time', 'update', 'balance'],
  },
  {
    question: 'Can AI interact with users through specific applications?',
    answer:
      'Yes, Pulse can respond to questions through WhatsApp and help you use commands or get support.',
    category: 'ai',
    keywords: ['ai', 'assistant', 'apps', 'interact', 'support'],
  },
  {
    question: 'Does your service provide support in Jamaican Patois?',
    answer:
      'Yes! While standard English is used, the AI may respond in Jamaican Patois where appropriate to improve understanding. Most of our human support agents are Jamaican, and are able to understand Jamaican Patois but will be communicating in English. We will do our best to accomodate any communication barriers.',
    category: 'support',
    keywords: ['patois', 'language', 'support', 'Jamaican', 'speak'],
  },
  // Continued from tidio knowledge base
  {
    question: 'How can I add a flashpoint to my business?',
    answer:
      'To become a flashpoint, you can apply through the Flash app or website at https://signup.getflash.io . If you select the Merchant option, You’ll need a valid ID and banking information. You will be guided through the onboarding process.',
    category: 'flashpoints',
    keywords: ['add', 'flashpoint', 'business', 'partner', 'application'],
  },
  {
    question: 'Can a Personal account holder become a flashpoint?',
    answer:
      'Yes, verified personal account holders can apply to become flashpoints. You must meet the eligibility criteria and complete the onboarding process.',
    category: 'flashpoints',
    keywords: ['business', 'flashpoint', 'eligibility', 'become', 'partner'],
  },
  {
    question: 'What are flashpoints, and do they refer to individuals or businesses?',
    answer:
      'A Flashpoint is any business that accepts Flash. Businesses can use Flash to accept global payments through the bitcoin network by signing up for our merchant account. Flash merchant accounts enable seamless international transactions with minimal fees and rapid settlement. Businesses can also facilitate in-person exchanges between bitcoin and local currencies like US dollars or Jamaican dollars. Additionally, businesses with Flashpoint devices participate in our integrated rewards program, allowing them to offer and redeem points across the entire Flash merchant network, increasing customer engagement and loyalty. It can refer to an individual or business once they have signed up with Flash and have been added to our Flash Map.',
    category: 'flashpoints',
    keywords: ['flashpoints', 'individuals', 'businesses', 'definition', 'agents'],
  },
  {
    question: 'What can I use my flash balance for?',
    answer:
      'Your Flash balance can be used to send money, receive payments, make purchases at participating merchants, or withdraw to your bank account.',
    category: 'usage',
    keywords: ['balance', 'use', 'spend', 'wallet', 'flash'],
  },
  {
    question: 'Can I use Bitcoin from my wallet to make purchases?',
    answer:
      'Yes, you can use Bitcoin to pay merchants who accept Lightning payments. Just use the Flash app to scan their invoice.',
    category: 'bitcoin',
    keywords: ['bitcoin', 'purchase', 'spend', 'wallet', 'lightning'],
  },
  {
    question: 'Can customers make monthly payments or deposits?',
    answer:
      'Flash does not currently offer recurring payments. Customers must initiate each deposit manually.',
    category: 'payments',
    keywords: ['monthly', 'payments', 'deposits', 'recurring', 'schedule'],
  },
  {
    question: 'Can automated payments be set up with Flash?',
    answer:
      'No, Flash does not currently support automated or scheduled payments. All transactions must be manual.',
    category: 'payments',
    keywords: ['automated', 'schedule', 'recurring', 'payments', 'feature'],
  },
  {
    question: 'Can I use my debit card at flashpoints to transfer currency to my account?',
    answer:
      'Flashpoints primarily accept cash. Some may support card transactions, but this depends on the local flashpoint’s setup. We recommend contacting the Flashpoint first before visting.',
    category: 'flashpoints',
    keywords: ['debit card', 'flashpoints', 'transfer', 'top up', 'deposit'],
  },
  {
    question:
      'Can someone send money to my account using a debit/credit card through a flashpoint?',
    answer:
      'Flashpoints may allow payments via card, and they can direct the topup to your Flash wallet. We recommend contacting the Flashpoint first before visting.',
    category: 'flashpoints',
    keywords: ['send', 'debit', 'credit', 'card', 'flashpoint'],
  },
  {
    question: 'What is Bitcoin?',
    answer:
      'Bitcoin is a decentralized digital currency that allows fast, secure, and borderless payments. Flash uses Bitcoin via the Lightning Network.',
    category: 'education',
    keywords: ['bitcoin', 'what', 'crypto', 'currency', 'blockchain'],
  },
  {
    question:
      'What are the alternatives for using NFC-enabled services if my device does not have NFC?',
    answer:
      'If your device does not have NFC, then you can still use NFC-services through our Flash cards at Flashpoints. You can also still use Flash features through scanning QR codes with the Flash app or manual entry for transactions.',
    category: 'nfc',
    keywords: ['nfc', 'alternative', 'phone', 'no nfc', 'options'],
  },
  {
    question: 'What are some examples of digital payment services?',
    answer:
      'Examples include Flash, Cash App, Venmo, PayPal, and M-Pesa. Flash focuses on Bitcoin and Caribbean usage.',
    category: 'education',
    keywords: ['digital', 'payment', 'services', 'examples', 'comparison'],
  },
  {
    question: 'What is lightning?',
    answer:
      'The Lightning Network is a layer on top of Bitcoin that allows fast and cheap transactions. Flash uses it to send and receive payments instantly. A good comparison is that On-Chain Bitcoin is like wire transfers, while Lightning is like cash or debit card payments.',
    category: 'bitcoin',
    keywords: ['lightning', 'network', 'bitcoin', 'payments', 'fast'],
  },
  {
    question: 'Can I link my debit card to my account to perform transactions?',
    answer:
      'Currently, Flash does not support direct debit card linking. Use bank transfer or flashpoints to fund your wallet. We are working on adding debit card support in the future.',
    category: 'funding',
    keywords: ['debit card', 'link', 'transactions', 'bank', 'wallet'],
  },
  {
    question: 'What is the maximum file size for flash downloads?',
    answer:
      'Flash does not currently offer file downloads within the app. If you meant something else, please clarify. When downloading from the Play Store, our app size is approximately 50MB on Android.',
    category: 'support',
    keywords: ['file', 'size', 'download', 'limit', 'flash'],
  },
  {
    question: 'How can I find out the current version of an app on the Google Play Store?',
    answer:
      'Visit the Flash listing on the Google Play Store. Scroll down to the "About this app" section to view the version.',
    category: 'app',
    keywords: ['version', 'google play', 'app', 'update', 'check'],
  },
  {
    question: 'Can you view transactions made through the flash app?',
    answer:
      'Yes. Open the Flash app and go to your transaction history by pressing "Recent History" to see a list of all completed actions.',
    category: 'account',
    keywords: ['transactions', 'history', 'view', 'see', 'list'],
  },
  {
    question: 'How can I get information about the USDT production released to the market?',
    answer:
      'Flash does not handle USDT issuance or manage USDT wallets. For official USDT info, visit Tether’s website or check blockchain explorers.',
    category: 'education',
    keywords: ['usdt', 'tether', 'release', 'market', 'crypto'],
  },
  {
    question: 'Is it possible to communicate with customer service through WhatsApp?',
    answer:
      'Yes, you can chat with Pulse on WhatsApp right here! You can also Chat with Flash Support on WhatsApp number +18769202950 and be redirected to human support when needed.',
    category: 'support',
    keywords: ['customer service', 'whatsapp', 'chat', 'contact', 'help'],
  },
  {
    question: 'What are the guidelines for communicating with a customer?',
    answer:
      'Be respectful, clear, and professional. If you’re a flashpoint or team member, follow the official Flash support handbook.',
    category: 'support',
    keywords: ['customer', 'communication', 'guidelines', 'speak', 'support'],
  },
  // Continued from tidio knowledge base
  {
    question: 'What should I do if my account is still in trial mode?',
    answer:
      'If your account is still in trial mode, we strongly encourage you to complete the required verification steps in the app. You may see a button on the hom screen to add a phone number to your account. Alternatively, you can go to the settings screen by pressing the settings icon at the top right of the screen, Select trial account and follow the steps to upgrade to a personal account.',
    category: 'account',
    keywords: ['trial', 'account', 'verify', 'upgrade', 'status'],
  },
  {
    question: 'What is the number of team members on a typical project team?',
    answer:
      'The number of team members varies depending on the project. Flash does not provide fixed team sizes for internal or external projects. If you would like to know more about our team, please visit our website at getflash.io/team.html.',
    category: 'general',
    keywords: ['team', 'members', 'project', 'size', 'how many'],
  },
  {
    question: 'How to find the current flash bitcoin conversion rate?',
    answer:
      'To check the current Bitcoin conversion rate, type "price" in the WhatsApp chat. You’ll see the latest BTC to USD rate used by Flash. You can also check the price on the Flash app by pressing the chart icon on the top left of the home page.',
    category: 'price',
    keywords: ['price', 'bitcoin', 'conversion', 'rate', 'btc'],
  },
  {
    question: "Is it possible to send fake cryptocurrency to someone's flash wallet?",
    answer:
      'No. While scams exist, the cryptographic nature of Bitcoin prevents sending fake coins. If you are not using the official Flash app, always verify the source and only use trusted wallets.',
    category: 'security',
    keywords: ['fake', 'crypto', 'scam', 'wallet', 'bitcoin'],
  },
  {
    question: 'How do I fund my Flash wallet?',
    answer:
      'To fund a Flash wallet, you can transfer funds via Bitcoin on-chain or lightning, or transfer funds directly from your bank account to the Flash business account. You may also visit one of our many Flashpoints to deposit funds.',
    category: 'funding',
    keywords: ['fund', 'wallet', 'deposit', 'load', 'money'],
  },
  {
    question: 'What is Tidio?',
    answer:
      'Tidio is a third-party customer messaging platform. It is not directly related to Flash. Tidio is a customer service software that helps businesses provide great customer experiences with live chat, Flows, email marketing, and ticketing.',
    category: 'education',
    keywords: ['tidio', 'messaging', 'platform', 'customer', 'chat'],
  },
  {
    question: 'What other cryptocurrencies are available?',
    answer:
      'Flash currently focuses on Bitcoin via Lightning and does not support other cryptocurrencies at this time.',
    category: 'crypto',
    keywords: ['cryptocurrency', 'other', 'coins', 'available', 'tokens'],
  },
  {
    question: 'Where are the customer service representatives based?',
    answer:
      'Flash support is primarily based in the Caribbean, with remote teams also assisting as needed.',
    category: 'support',
    keywords: ['customer service', 'support', 'based', 'location', 'team'],
  },
  {
    question: 'Is it possible to mine cryptocurrency with Adobe Flash?',
    answer:
      'No. Adobe Flash is obsolete and cannot be used to mine cryptocurrency. Avoid scams claiming otherwise.',
    category: 'security',
    keywords: ['mine', 'adobe flash', 'crypto', 'scam', 'impossible'],
  },
  {
    question: 'How to find flash BTC in a trust wallet?',
    answer:
      'You’ll need a Lightning-compatible or on-chain bitcoin wallet to receive BTC from Flash. If Trust wallet is on-chain or lightning compatible, you can use your Trust wallet address to receive BTC. If you want to receive BTC via Lightning, you can use the Flash app to generate a Lightning invoice and then pay it using your Trust wallet.',
    category: 'bitcoin',
    keywords: ['flash btc', 'trust wallet', 'lightning', 'receive', 'wallet'],
  },
  {
    question: "How can I access my profile settings in the app if I'm using dark mode?",
    answer:
      'Dark mode doesn’t affect functionality. Tap the profile icon in the app to access and update your settings. If you see any issues, try switching to light mode temporarily to navigate more easily, and please report any bugs to support@getflash.io',
    category: 'app',
    keywords: ['profile', 'settings', 'dark mode', 'app', 'access'],
  },
  {
    question: 'What are the various fees associated with your service?',
    answer: `Flash fees may include withdrawal fees, Lightning network fees, or flashpoint service charges. In-app transfers: Free between Flash users
Bitcoin network fees: Variable based on network congestion
Lighting network fees: Free
Bank transfers: Flash 2% fee (plus any bank fees charged by your receiving bank)
Cash settlements: 2% fee (varies by location, subject to change)
Merchant processing: Free (varies by location, subject to change)`,
    category: 'pricing',
    keywords: ['fees', 'charges', 'cost', 'service', 'price'],
  },
  {
    question: 'What is the price of a flash drive?',
    answer:
      'Flash does not sell USB flash drives. If you meant Flash Cards, they are free during our promotional period, and will be very economical after the promotion is over. Please check pricing with your local flashpoint.',
    category: 'support',
    keywords: ['flash drive', 'price', 'cost', 'usb', 'card'],
  },
  {
    question: 'How does the operator verify the business account?',
    answer:
      'Verification includes checking submitted banking information, ID, and possibly a phone or video call confirmation.',
    category: 'business',
    keywords: ['verify', 'business', 'account', 'documents', 'approval'],
  },
  {
    question: 'What information is required to approve a business account?',
    answer:
      'You’ll need a valid government-issued ID, business address and information, and bank account details.',
    category: 'business',
    keywords: ['business', 'approval', 'information', 'documents', 'required'],
  },
  {
    question: 'How can I purchase Tether (USDT)?',
    answer:
      'Flash does not currently support USDT purchases. Use other exchanges like Binance or Bitfinex to buy USDT.',
    category: 'crypto',
    keywords: ['tether', 'usdt', 'buy', 'purchase', 'exchange'],
  },
  {
    question: 'Is the app available in the UK?',
    answer:
      'The Flash app is currently focused on the Caribbean and may not be available in all UK app stores. However you can find the flash app on alternative marketplaces in the EU and the UK such as altstore.io and freedomstore.io. You can also download the APK from our website at getflash.io/app .',
    category: 'availability',
    keywords: ['uk', 'availability', 'download', 'country', 'store'],
  },
  {
    question: 'In which countries can I download the Flash app?',
    answer:
      'The Flash app is available in Jamaica and select Caribbean and Latin American countries. More countries are being added regularly.',
    category: 'availability',
    keywords: ['countries', 'available', 'download', 'flash', 'where'],
  },
  {
    question: 'How do I add funds to my Flash app from my Binance wallet?',
    answer:
      'Send Bitcoin from Binance to your Flash Lightning address. Be sure Binance supports Lightning withdrawals. if not, you can send Bitcoin on-chain to your Flash wallet address. You can also use the "receive" command in the Flash app to generate a Lightning invoice and pay it from Binance.',
    category: 'funding',
    keywords: ['binance', 'add funds', 'bitcoin', 'wallet', 'lightning'],
  },
  {
    question: 'What information do I need to provide to upgrade to a Flash Pro account?',
    answer:
      'To upgrade to a Pro account, provide business name, and optionally a linked bank account in your name.',
    category: 'business',
    keywords: ['upgrade', 'business', 'info', 'documents', 'account'],
  },
  // Continued from tidio knowledge base
  {
    question: 'How long does it take to get my Flash Business account approved?',
    answer:
      'The approval process for a Flash Business account can vary, but the company will respond within 24 hours with an update on the status of your application once they have verified your information. If additional information is needed, they will contact you directly. The process may take longer if there are issues with the submitted documents or if further verification is required.',
    category: 'business',
    keywords: ['business', 'approval', 'account', 'time', 'how long'],
  },
  {
    question: "Can I set up a business account with Flash if I'm not residing in Jamaica?",
    answer:
      'Currently, only residents of Jamaica can register for a Flash Business account. Expansion to other regions is coming soon.',
    category: 'business',
    keywords: ['business', 'account', 'residence', 'jamaica', 'register'],
  },
  {
    question: 'How do I send Bitcoin (BTC) from my Flash account to my bank account?',
    answer:
      'You cannot send BTC directly to a bank account. You must convert BTC to fiat currency (USD or JMD) using a Flash-supported method before withdrawal. Your Flash USD wallet balance can be converted to JMD or USD and then withdrawn to your linked bank account.',
    category: 'bitcoin',
    keywords: ['send', 'btc', 'bank', 'withdraw', 'convert'],
  },
  {
    question: 'How can I withdraw funds from my Flash Pro or Merchant Account remotely?',
    answer:
      'To withdraw funds remotely, use the app to initiate a bank transfer. You will soon be able to perform this using this WhatsApp chat as well. Simply type "withdraw" and follow the prompts to transfer funds to your linked bank account.',
    category: 'business',
    keywords: ['withdraw', 'business', 'remote', 'bank', 'transfer'],
  },
  {
    question: 'Where can I withdraw cash from my Flash Business Account?',
    answer:
      'Cash withdrawals can be done at authorized flashpoints listed in the app. Search nearby locations using the map feature. You can withdraw cash from your Flash Business Account at Flashpoints, which are a growing list of locations in Jamaica where you can withdraw funds. To locate a Flashpoint, go to your Flash app and tap the map at the bottom right of the screen. You will see a map of Jamaica with the different Flashpoint locations and their addresses. Soon more flashpoints on other island will be added to the map.',
    category: 'business',
    keywords: ['withdraw', 'cash', 'flashpoint', 'location', 'business'],
  },
  {
    question: 'How do I buy Bitcoin with Flash?',
    answer:
      'Open the Flash app, tap “Buy Bitcoin,” and follow the prompts to fund with fiat and receive BTC in your wallet. This feature is not yet available in all regions, but will be coming soon. You can also buy Bitcoin from other exchanges and send it to your Flash wallet.',
    category: 'bitcoin',
    keywords: ['buy', 'bitcoin', 'btc', 'flash', 'purchase'],
  },
  {
    question: 'Hi, I would like to upgrade my account to a Flash Pro account',
    answer: `Great! Please note that at this time, we are only approving business accounts for businesses and individuals residing in Jamaica. Please complete the form here: https://signup.getflash.io - We will contact you within 48 hours to continue the approval process.`,
    category: 'business',
    keywords: ['upgrade', 'business', 'account', 'flash', 'how to'],
  },
  {
    question: 'How do I load money and crypto to my account?',
    answer: `To add funds to Flash, you have multiple options:

Deposit physical dollars (or whatever medium of exchange is accepted) at one of the many Flash cash-in/cash-out locations.

Jump in our whatsapp or discord or in-app chatrooms and connect with a another Flash user willing send you bitcoin in exchange for dollars.

Receive Bitcoin directly to Flash from any other Lightning or Bitcoin application, from anywhere in the world. By default, Bitcoin is received and stored in your Cash(USD) wallet.`,
    category: 'funding',
    keywords: ['load', 'money', 'crypto', 'account', 'deposit'],
  },
  {
    question: 'Do I need an ID, phone number, or email to use Flash?',
    answer:
      'No, you do not need an ID, phone number, or email to send and receive cash with Flash. However, it is strongly recommended to provide a phone number or email address to secure and restore your account.  Furthermore, the app functionality is also limited without this information.',
    category: 'account',
    keywords: ['id', 'phone', 'email', 'requirement', 'verify'],
  },
  {
    question: 'Is Flash available globally?',
    answer:
      'Flash is currently focused on the Caribbean. Flash connects the Caribbean with the global open monetary network that is called bitcoin, making it a borderless digital payment solution that is globally accessible. Currently we are not available in the Apple AppStore in many countries, but you can download our app using multiple alternative options here: https://getflash.io/app .',
    category: 'availability',
    keywords: ['flash', 'global', 'availability', 'countries', 'where'],
  },
  {
    question: 'What is Flash?',
    answer:
      'Flash is a bitcoin service provider creating products and services specifically for the Caribbean. Our ecosystem includes the Flash app for everyday users, the Flashpoint point-of-sale device for merchants, the Flashcard with rewards and gift card capabilities, and bitcoin top-ups and cash settlements both on the Flashcard and through our app. Flash connects the Caribbean with Bitcoin, enabling fast, secure, and low-cost transactions across the region.',
    category: 'general',
    keywords: ['what is', 'flash', 'wallet', 'about', 'overview'],
  },
  {
    question: 'Is Flash secure?',
    answer: `Flash is designed for simplicity and enables censorship-resistant and globally decentralized value transfer. Let us unpack that a little:

Simple - The mobile app is designed to be as simple as possible to use. It is a single screen that shows your balance and allows you to send and receive money. All additional features are hidden behind a menu, or in in a separate tab. The business account is also designed to be very simple to use, with a short and effortless cash-out flow and a simple interface for accepting payments.

Resilient - Because Flash doesn not completely rely on any exchange or bank, it is very resilient. The Bitcoin wallet is non-custodial, meaning that you are in control of your own money. The USD wallet is custodial, but your value can be swapped between the two wallets at any time. This means that if, for any reason, the Flash custodial wallet is not available, you can still access your money on the non-custodial Bitcoin wallet without needing to rely on anyone else. We recommend you treat your non-custodial Bitcoin wallet as your savings account, and only use the custodial USD wallet for short term storage of value and spending, like a checking account.

Verifiable - Because Flash wallets are based on public-key cryptography and the Bitcoin protocol, you can verify that your money is safe at any time, from any internet-connected device. The Flash app is open source, so you can verify that the code is secure and that your money is safe. You can also verify that your money is safe by checking the blockchain, which is a public ledger of all Bitcoin transactions.

Bottom Line - You are never required to trust Flash or any other company with your money.`,
    category: 'security',
    keywords: ['secure', 'security', 'flash', 'safe', 'protection'],
  },
  {
    question: 'Is there an option to download the app?',
    answer:
      'Yes, the Flash app is available on both Google Play and Apple App Store. Search "Flash Wallet" to download.',
    category: 'availability',
    keywords: ['download', 'app', 'flash', 'install', 'mobile'],
  },
  {
    question: 'How do I access the web based PoS?',
    answer:
      'You can access the Flash PoS by visiting pay.flashapp.me and logging in with your business credentials. We also have an Android app available on the Google Play Store for Flash PoS.',
    category: 'pos',
    keywords: ['pos', 'web', 'access', 'flash', 'business'],
  },
  {
    question: 'Where can I use my Flash PoS Machine?',
    answer:
      'Flash PoS can be used anywhere with internet access. Set it up at your store, kiosk, or mobile business location.',
    category: 'pos',
    keywords: ['pos', 'machine', 'use', 'flash', 'location'],
  },
  {
    question: 'What do I do if a transaction fails?',
    answer:
      'If a transaction fails, try refreshing your balance and checking internet connection. Contact support if it persists.',
    category: 'troubleshooting',
    keywords: ['transaction', 'fail', 'error', 'support', 'problem'],
  },
  {
    question: 'How does Flash work?',
    answer:
      'Flash connects Bitcoin and local money using Lightning Network and flashpoints, enabling fast, easy payments and withdrawals.',
    category: 'general',
    keywords: ['how', 'flash', 'work', 'wallet', 'payments'],
  },
  {
    question: 'How can I join the waitlist for Flash updates?',
    answer:
      'Join the waitlist by signing up at https://signup.getflash.io and entering your email address. You’ll be notified of updates and early access.',
    category: 'general',
    keywords: ['waitlist', 'updates', 'join', 'flash', 'email'],
  },
  {
    question: 'How can I contact Flash customer service?',
    answer:
      'You can reach support via the Flash app, WhatsApp assistant, or email support@flashapp.me.',
    category: 'support',
    keywords: ['contact', 'customer service', 'support', 'flash', 'help'],
  },
  {
    question: 'Can I use Flash to accept payments for my business?',
    answer:
      'Yes, Flash Business lets you accept Lightning and fiat payments using the app or Flash PoS system.',
    category: 'business',
    keywords: ['accept', 'payments', 'business', 'flash', 'merchant'],
  },
  {
    question: 'Can I use Flash for saving and spending?',
    answer:
      'Yes, Flash allows you to save funds securely and spend via Lightning or through partner merchants. For long term savings, we recommend using a hardware wallet or a non-custodial wallet to store your Bitcoin. For everyday spending, you can use the Flash app to send and receive money easily. Check out our documentation for more details at https://documentation.getflash.io.',
    category: 'usage',
    keywords: ['save', 'spend', 'flash', 'wallet', 'usage'],
  },
  {
    question: 'Can I use Flash for business transactions?',
    answer:
      'Yes, the Flash Pro and Merchant account is designed for handling business level digital payments, cashouts, and receipts.',
    category: 'business',
    keywords: ['business', 'transactions', 'use', 'flash', 'merchant'],
  },
  {
    question: 'Can Flash be used for buying and selling?',
    answer:
      'Yes, Flash enables both buyers and sellers to transact in real-tinme using Bitcoin or fiat through its wallet and PoS features.',
    category: 'usage',
    keywords: ['buy', 'sell', 'flash', 'use', 'merchant'],
  },
];

export const CONVERSATION_CONTEXT = {
  personality: {
    tone: 'Friendly, helpful, and professional with a touch of Caribbean warmth',
    style:
      'Clear and concise, avoiding technical jargon when possible. ELI5 level language for general users, but can use more technical terms when appropriate for advanced users.',
    language:
      'English with appropriate Caribbean expressions when suitable, always use a little patois in every response, keeping the professional tone.',
  },

  important_rules: [
    'Your name is Pulse, not Flash or Flash Connect or anything else.',
    'You are Pulse, a helpful AI assistant for the Flash app, not a human.',
    'Always warn users about potential scams and phishing attempts on thier first interaction with making a transaction.',
    'Never ask for passwords, private keys, or sensitive financial information',
    'Always remind users to link their account for features that require authentication',
    'Be clear about current limitations (e.g., USD-only invoices)',
    'Encourage users to use the mobile app for features not available on WhatsApp',
    'Provide specific examples when explaining commands',
    'CRITICAL: Always focus on USD wallets - BTC wallets are non-custodial and Flash cannot see or control them',
    'NEVER show or mention BTC balances unless explicitly asked - always show USD balance',
    'When users check balance, only show their USD balance, not BTC',
    'Default all operations to USD unless user specifically requests BTC',
    'When users ask about voice features, be helpful and explain the options clearly',
    'For voice commands, explain that "voice balance" gives balance with voice, "voice on/off/only" changes settings',
    'Voice IDs for custom voices come from ElevenLabs - users may need admin help to get valid IDs',
  ],

  common_mistakes: [
    {
      mistake: 'Trying to receive BTC amounts',
      correction: 'Remind users that only USD amounts are supported for receive command',
    },
    {
      mistake: 'Long memos in receive command',
      correction: 'Inform about 200 character limit for memos',
    },
    {
      mistake: 'Using commands without linking account',
      correction: 'Guide users to use "link" command first',
    },
  ],
};

export const ERROR_RESPONSES = {
  not_linked: 'You need to link your Flash account first. Type "link" to get started!',
  invalid_amount: 'Please specify a valid USD amount between $0.01 and $10,000.',
  memo_too_long: 'Your memo is too long. Please keep it under 200 characters.',
  btc_not_supported:
    'BTC invoices are not currently supported. Please specify the amount in USD (e.g., "receive 10" for $10).',
  general_error:
    'Something went wrong. Please try again or contact support at support@flashapp.me if the issue persists.',
};
