/**
 * Voice command patterns for natural language processing
 */

/**
 * Patterns for switching between different voice personas
 * Captures various natural language ways users might request voice changes
 */
export const VOICE_SWITCH_PATTERNS: RegExp[] = [
  // Direct commands
  /switch\s+(?:voices?\s+)?to\s+(\w+)/i,
  /change\s+(?:(?:the|my)\s+)?voice\s+to\s+(\w+)/i,
  /change\s+(?:your\s+)?voice\s+to\s+(\w+)/i,

  // Conversational requests
  /let\s+me\s+(?:speak|talk)\s+(?:to|with)\s+(\w+)/i,
  /(?:i\s+)?(?:want|wanna)\s+(?:to\s+)?(?:speak|talk)\s+(?:to|with)\s+(\w+)/i,
  /(?:can\s+)?(?:i|you)\s+(?:speak|talk)\s+(?:to|with)\s+(\w+)/i,

  // Voice selection
  /use\s+(\w+)(?:'s)?\s+voice/i,
  /speak\s+(?:as|like)\s+(\w+)/i,
  /talk\s+(?:as|like)\s+(\w+)/i,
  /(?:i\s+)?(?:want|wanna)\s+(\w+)(?:'s)?\s+voice/i,

  // Be/become variations
  /(?:can\s+)?(?:you\s+)?(?:be|sound\s+like)\s+(\w+)/i,
  /(?:please\s+)?(?:be|become)\s+(\w+)/i,

  // Set/make commands
  /set\s+(?:(?:the|my|your)\s+)?voice\s+to\s+(\w+)/i,
  /make\s+(?:it|your\s+voice)\s+(\w+)/i,

  // Simple variations
  /(?:hey\s+)?(\w+)\s+(?:please|voice)/i,
];

/**
 * Patterns for voice-related questions the AI should understand
 */
export const VOICE_QUESTION_PATTERNS: RegExp[] = [
  /how\s+(?:do\s+i|can\s+i)\s+(?:add|use|change|switch)\s+(?:a\s+)?(?:voice|voices)/i,
  /what\s+voices?\s+(?:are\s+)?(?:available|do\s+you\s+have)/i,
  /(?:can\s+)?(?:you\s+)?list\s+(?:the\s+)?voices?/i,
  /how\s+(?:many\s+)?voices?\s+(?:do\s+you\s+have|are\s+there)/i,
];

/**
 * Patterns for voice mode settings
 */
export const VOICE_MODE_PATTERNS = {
  on: /^voice\s+on$/i,
  off: /^voice\s+off$/i,
  only: /^voice\s+only$/i,
  status: /^voice\s+(?:status)?$/i,
};

/**
 * Pattern for voice add command
 */
export const VOICE_ADD_PATTERN = /^voice\s+add(?:\s+(\w+))?(?:\s+([A-Za-z0-9]+))?$/i;

/**
 * Pattern for voice list command
 */
export const VOICE_LIST_PATTERN = /^voice\s+list$/i;

/**
 * Pattern for voice remove command
 */
export const VOICE_REMOVE_PATTERN = /^voice\s+remove\s+(\w+)$/i;
