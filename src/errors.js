/**
 * Custom error classes for Neurai DePIN Terminal
 * @module errors
 */

/**
 * Base error class for DePIN Terminal
 * @extends Error
 */
export class DepinError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} [code] - Error code
   */
  constructor(message, code) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Configuration-related errors
 * @extends DepinError
 */
export class ConfigError extends DepinError {
  /**
   * @param {string} message - Error message
   * @param {string} [code] - Error code
   */
  constructor(message, code = 'CONFIG_ERROR') {
    super(message, code);
  }
}

/**
 * Password validation errors
 * @extends DepinError
 */
export class PasswordError extends DepinError {
  /**
   * @param {string} message - Error message
   * @param {string} [code] - Error code
   */
  constructor(message, code = 'PASSWORD_ERROR') {
    super(message, code);
  }
}

/**
 * Wallet-related errors
 * @extends DepinError
 */
export class WalletError extends DepinError {
  /**
   * @param {string} message - Error message
   * @param {string} [code] - Error code
   */
  constructor(message, code = 'WALLET_ERROR') {
    super(message, code);
  }
}

/**
 * RPC connection and call errors
 * @extends DepinError
 */
export class RpcError extends DepinError {
  /**
   * @param {string} message - Error message
   * @param {string} [code] - Error code
   */
  constructor(message, code = 'RPC_ERROR') {
    super(message, code);
  }
}

/**
 * Message sending/receiving errors
 * @extends DepinError
 */
export class MessageError extends DepinError {
  /**
   * @param {string} message - Error message
   * @param {string} [code] - Error code
   */
  constructor(message, code = 'MESSAGE_ERROR') {
    super(message, code);
  }
}

/**
 * Encryption/decryption errors
 * @extends DepinError
 */
export class EncryptionError extends DepinError {
  /**
   * @param {string} message - Error message
   * @param {string} [code] - Error code
   */
  constructor(message, code = 'ENCRYPTION_ERROR') {
    super(message, code);
  }
}

/**
 * Library loading errors
 * @extends DepinError
 */
export class LibraryError extends DepinError {
  /**
   * @param {string} message - Error message
   * @param {string} [code] - Error code
   */
  constructor(message, code = 'LIBRARY_ERROR') {
    super(message, code);
  }
}

/**
 * Extract a user-friendly error message from various error formats
 * @param {Error|string|Object} error - Error object, string, or error response
 * @param {string} [fallback='Unknown error'] - Fallback message
 * @returns {string} Extracted error message
 */
export function extractErrorMessage(error, fallback = 'Unknown error') {
  if (!error) {
    return fallback;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error.message && error.message.trim()) {
    return error.message;
  }

  if (error.error && error.error.message) {
    return error.error.message;
  }

  if (error.code) {
    return `Error code: ${error.code}`;
  }

  return fallback;
}

/**
 * Check if an error is a known/expected application error
 * @param {Error} error - Error object
 * @returns {boolean} True if error is a known application error
 */
export function isKnownError(error) {
  return error instanceof DepinError;
}

/**
 * Check if debug mode is enabled
 * @returns {boolean} True if debug mode is enabled
 */
export function isDebugMode() {
  return process.env.DEPIN_DEBUG === '1' || process.env.NODE_ENV === 'development';
}
