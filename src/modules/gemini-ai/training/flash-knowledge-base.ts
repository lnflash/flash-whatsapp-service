/**
 * Flash WhatsApp Bot Knowledge Base
 * This file contains structured information to train the AI for accurate responses
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
    description: 'Check your Bitcoin and fiat balance',
    usage: 'balance',
    examples: ['balance'],
    requiresAuth: true,
    notes: 'Shows both BTC and JMD balances'
  },
  {
    command: 'refresh',
    description: 'Refresh your balance by clearing the cache',
    usage: 'refresh',
    examples: ['refresh'],
    requiresAuth: true,
    notes: 'Useful if balance seems outdated'
  },
  {
    command: 'receive',
    description: 'Create a USD Lightning invoice to receive payments',
    usage: 'receive [amount] [optional memo]',
    examples: [
      'receive 10',
      'receive 25.50',
      'receive 100 Payment for services',
      'receive 5.99 Coffee payment'
    ],
    requiresAuth: true,
    notes: 'Only USD amounts are supported. BTC invoices are not available. Amount must be between $0.01 and $10,000. Memo is optional and limited to 200 characters.'
  },
  {
    command: 'price',
    description: 'Check current Bitcoin price',
    usage: 'price',
    examples: ['price'],
    requiresAuth: false,
    notes: 'Shows current BTC price in USD'
  },
  {
    command: 'username',
    description: 'View or set your username (one-time only)',
    usage: 'username [new_username]',
    examples: ['username', 'username john_doe'],
    requiresAuth: true,
    notes: 'Username can only be set once and cannot be changed'
  },
  {
    command: 'link',
    description: 'Connect your Flash account to WhatsApp',
    usage: 'link',
    examples: ['link'],
    requiresAuth: false,
    notes: 'Starts the account linking process with OTP verification'
  },
  {
    command: 'unlink',
    description: 'Disconnect your Flash account from WhatsApp',
    usage: 'unlink',
    examples: ['unlink'],
    requiresAuth: true,
    notes: 'Removes the connection between Flash and WhatsApp'
  },
  {
    command: 'verify',
    description: 'Complete OTP verification for account linking',
    usage: 'verify [code]',
    examples: ['verify 123456'],
    requiresAuth: false,
    notes: 'Used during the linking process'
  },
  {
    command: 'consent',
    description: 'Manage your AI support consent',
    usage: 'consent [yes/no]',
    examples: ['consent yes', 'consent no'],
    requiresAuth: false,
    notes: 'Required before using AI features'
  },
  {
    command: 'help',
    description: 'Show available commands',
    usage: 'help',
    examples: ['help'],
    requiresAuth: false,
    notes: 'Lists all available commands'
  }
];

export const TRAINING_EXAMPLES: TrainingExample[] = [
  // Balance related
  {
    question: 'How do I check my balance?',
    answer: 'To check your balance, simply type "balance". You\'ll see both your Bitcoin (BTC) and Jamaican Dollar (JMD) balances.',
    category: 'balance',
    keywords: ['balance', 'check', 'money', 'funds', 'account']
  },
  {
    question: 'Why is my balance not updating?',
    answer: 'If your balance isn\'t updating, type "refresh" to clear the cache and get the latest balance. This forces a fresh fetch from the server.',
    category: 'balance',
    keywords: ['balance', 'update', 'refresh', 'cache', 'not updating']
  },
  
  // Receive/Invoice related
  {
    question: 'How do I receive money?',
    answer: 'To receive money, use the "receive" command followed by the amount in USD. For example: "receive 10" creates an invoice for $10. You can add an optional memo: "receive 10 Coffee payment".',
    category: 'receive',
    keywords: ['receive', 'money', 'payment', 'invoice', 'lightning']
  },
  {
    question: 'Can I receive Bitcoin directly?',
    answer: 'Currently, the receive command only supports USD amounts. BTC invoices are not available at this time. All amounts should be specified in USD (e.g., "receive 25" for $25).',
    category: 'receive',
    keywords: ['receive', 'bitcoin', 'btc', 'crypto']
  },
  {
    question: 'What\'s the maximum amount I can receive?',
    answer: 'You can receive amounts between $0.01 and $10,000 USD. The memo is optional and limited to 200 characters.',
    category: 'receive',
    keywords: ['receive', 'maximum', 'limit', 'amount']
  },
  
  // Account linking
  {
    question: 'How do I connect my Flash account?',
    answer: 'To connect your Flash account to WhatsApp, type "link". You\'ll receive an OTP code in your Flash app. Then use "verify [code]" to complete the linking.',
    category: 'linking',
    keywords: ['link', 'connect', 'account', 'setup']
  },
  {
    question: 'I want to disconnect my account',
    answer: 'To disconnect your Flash account from WhatsApp, type "unlink". This will remove the connection and you\'ll need to link again to use account features.',
    category: 'linking',
    keywords: ['unlink', 'disconnect', 'remove', 'logout']
  },
  
  // Username related
  {
    question: 'How do I set my username?',
    answer: 'To set your username, type "username" followed by your desired username. For example: "username john_doe". Note: usernames can only be set once and cannot be changed.',
    category: 'username',
    keywords: ['username', 'name', 'handle', 'identity']
  },
  {
    question: 'Can I change my username?',
    answer: 'No, usernames can only be set once and are permanent. Choose carefully when setting your username.',
    category: 'username',
    keywords: ['username', 'change', 'modify', 'update']
  },
  
  // General Flash info
  {
    question: 'What is Flash?',
    answer: 'Flash is a Bitcoin wallet and payment app designed for the Caribbean market, starting with Jamaica. It allows you to store, send, and receive Bitcoin and make seamless digital payments.',
    category: 'general',
    keywords: ['flash', 'what', 'about', 'app']
  },
  {
    question: 'Is Flash safe?',
    answer: 'Yes, Flash uses industry-standard security measures including encryption and multi-factor authentication to protect your funds. Never share your password or private keys with anyone.',
    category: 'security',
    keywords: ['safe', 'security', 'secure', 'trust']
  },
  {
    question: 'What countries is Flash available in?',
    answer: 'Flash is currently available in Jamaica, with plans to expand to Trinidad & Tobago, Barbados, and other Caribbean countries soon.',
    category: 'availability',
    keywords: ['countries', 'available', 'where', 'location']
  },
  
  // Support
  {
    question: 'How do I contact support?',
    answer: 'You can contact Flash support by email at support@flashapp.me or through the "Help" section in the Flash mobile app.',
    category: 'support',
    keywords: ['support', 'help', 'contact', 'issue', 'problem']
  },
  
  // Errors and troubleshooting
  {
    question: 'I got an error when trying to receive money',
    answer: 'Common issues: 1) Make sure you\'re specifying the amount in USD, not BTC. 2) Keep memos under 200 characters. 3) Ensure the amount is between $0.01 and $10,000. If problems persist, try "refresh" and try again.',
    category: 'troubleshooting',
    keywords: ['error', 'problem', 'issue', 'receive', 'failed']
  }
];

export const CONVERSATION_CONTEXT = {
  personality: {
    tone: 'Friendly, helpful, and professional with a touch of Caribbean warmth',
    style: 'Clear and concise, avoiding technical jargon when possible',
    language: 'English with appropriate Caribbean expressions when suitable'
  },
  
  important_rules: [
    'Never ask for passwords, private keys, or sensitive financial information',
    'Always remind users to link their account for features that require authentication',
    'Be clear about current limitations (e.g., USD-only invoices)',
    'Encourage users to use the mobile app for features not available on WhatsApp',
    'Provide specific examples when explaining commands'
  ],
  
  common_mistakes: [
    {
      mistake: 'Trying to receive BTC amounts',
      correction: 'Remind users that only USD amounts are supported for receive command'
    },
    {
      mistake: 'Long memos in receive command',
      correction: 'Inform about 200 character limit for memos'
    },
    {
      mistake: 'Using commands without linking account',
      correction: 'Guide users to use "link" command first'
    }
  ]
};

export const ERROR_RESPONSES = {
  'not_linked': 'You need to link your Flash account first. Type "link" to get started!',
  'invalid_amount': 'Please specify a valid USD amount between $0.01 and $10,000.',
  'memo_too_long': 'Your memo is too long. Please keep it under 200 characters.',
  'btc_not_supported': 'BTC invoices are not currently supported. Please specify the amount in USD (e.g., "receive 10" for $10).',
  'general_error': 'Something went wrong. Please try again or contact support at support@flashapp.me if the issue persists.'
};