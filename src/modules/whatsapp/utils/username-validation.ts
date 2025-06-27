export enum UsernameValidationError {
  TOO_SHORT = 'TOO_SHORT',
  TOO_LONG = 'TOO_LONG',
  INVALID_CHARACTER = 'INVALID_CHARACTER',
  STARTS_WITH_NUMBER = 'STARTS_WITH_NUMBER',
}

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 50;
// Unicode letters, numbers (0-9), and underscores (_)
const USERNAME_REGEX = /^[\p{L}0-9_]+$/u;
const STARTS_WITH_NUMBER_REGEX = /^[0-9]/;

export function validateUsername(username: string): UsernameValidationError | null {
  if (username.length < USERNAME_MIN_LENGTH) {
    return UsernameValidationError.TOO_SHORT;
  }

  if (username.length > USERNAME_MAX_LENGTH) {
    return UsernameValidationError.TOO_LONG;
  }

  if (!USERNAME_REGEX.test(username)) {
    return UsernameValidationError.INVALID_CHARACTER;
  }

  if (STARTS_WITH_NUMBER_REGEX.test(username)) {
    return UsernameValidationError.STARTS_WITH_NUMBER;
  }

  return null;
}

export function getUsernameErrorMessage(error: UsernameValidationError): string {
  switch (error) {
    case UsernameValidationError.TOO_SHORT:
      return `Username must be at least ${USERNAME_MIN_LENGTH} characters long.`;
    case UsernameValidationError.TOO_LONG:
      return `Username must be no more than ${USERNAME_MAX_LENGTH} characters long.`;
    case UsernameValidationError.INVALID_CHARACTER:
      return 'Username can only contain letters, numbers, and underscores.';
    case UsernameValidationError.STARTS_WITH_NUMBER:
      return 'Username cannot start with a number.';
  }
}