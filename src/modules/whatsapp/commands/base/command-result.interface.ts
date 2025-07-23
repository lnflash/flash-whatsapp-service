export interface CommandResult {
  success: boolean;
  message?: string;
  data?: any;
  error?: CommandError;

  // Response options
  voice?: Buffer;
  voiceOnly?: boolean;
  media?: Buffer;
  mediaCaption?: string;
  buttons?: Array<{ id: string; title: string }>;

  // Control flow
  skipFollowUp?: boolean;
  followUpCommands?: string[];

  // Metrics
  executionTime?: number;
  apiCallsCount?: number;
}

export interface CommandError {
  code: CommandErrorCode;
  message: string;
  details?: any;
  retryable?: boolean;
}

export enum CommandErrorCode {
  // Validation errors
  INVALID_ARGUMENTS = 'INVALID_ARGUMENTS',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT = 'INVALID_FORMAT',

  // Authentication errors
  NOT_AUTHENTICATED = 'NOT_AUTHENTICATED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',

  // Business logic errors
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  RATE_LIMITED = 'RATE_LIMITED',

  // System errors
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export class CommandResultBuilder {
  private result: CommandResult = { success: true };

  static success(message?: string): CommandResultBuilder {
    return new CommandResultBuilder().withSuccess(true).withMessage(message);
  }

  static error(error: CommandError): CommandResultBuilder {
    return new CommandResultBuilder().withSuccess(false).withError(error);
  }

  withSuccess(success: boolean): CommandResultBuilder {
    this.result.success = success;
    return this;
  }

  withMessage(message?: string): CommandResultBuilder {
    this.result.message = message;
    return this;
  }

  withData(data: any): CommandResultBuilder {
    this.result.data = data;
    return this;
  }

  withError(error: CommandError): CommandResultBuilder {
    this.result.error = error;
    this.result.success = false;
    return this;
  }

  withVoice(voice: Buffer, voiceOnly = false): CommandResultBuilder {
    this.result.voice = voice;
    this.result.voiceOnly = voiceOnly;
    return this;
  }

  withMedia(media: Buffer, caption?: string): CommandResultBuilder {
    this.result.media = media;
    this.result.mediaCaption = caption;
    return this;
  }

  withButtons(buttons: Array<{ id: string; title: string }>): CommandResultBuilder {
    this.result.buttons = buttons;
    return this;
  }

  withMetrics(executionTime: number, apiCallsCount?: number): CommandResultBuilder {
    this.result.executionTime = executionTime;
    this.result.apiCallsCount = apiCallsCount;
    return this;
  }

  build(): CommandResult {
    return this.result;
  }
}
