/**
 * Utility functions for Neurai DePIN Terminal
 * @module utils
 */

import { KEY_CODES, TERMINAL } from './constants.js';

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validate a URL string
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid URL
 */
export function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate a timezone string (UTC or numeric offset)
 * @param {string} timezone - Timezone to validate
 * @returns {boolean} True if valid timezone
 */
export function isValidTimezone(timezone) {
  if (timezone === 'UTC') return true;
  // Allow numeric offsets like +1, -5, +5.5, -3.5, 2, -2
  const offsetRegex = /^[+-]?\d+(\.\d+)?$/;
  return offsetRegex.test(timezone);
}

/**
 * Ensure RPC URL has the correct format
 * @param {string} url - Base RPC URL
 * @param {string} suffix - Suffix to append (default: '/rpc')
 * @returns {string} Formatted RPC URL
 */
export function formatRpcUrl(url, suffix = '/rpc') {
  if (!url.endsWith(suffix)) {
    return url + suffix;
  }
  return url;
}

/**
 * Truncate a string with ellipsis
 * @param {string} str - String to truncate
 * @param {number} length - Maximum length
 * @param {string} [suffix='...'] - Suffix to append
 * @returns {string} Truncated string
 */
export function truncate(str, length, suffix = '...') {
  if (!str || str.length <= length) {
    return str;
  }
  return str.slice(0, length) + suffix;
}

/**
 * Format timestamp to locale time string
 * @param {number|Date} timestamp - Unix timestamp in seconds or Date object
 * @param {string} [timezone='UTC'] - Timezone offset (e.g., 'UTC', '+1', '-5')
 * @returns {string} Formatted time string
 */
export function formatTimestamp(timestamp, timezone = 'UTC') {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp * 1000);
  
  // Handle UTC explicitly
  if (timezone === 'UTC') {
    return date.toLocaleTimeString('en-US', { 
      timeZone: 'UTC',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  // Handle numeric offset
  const offset = parseFloat(timezone);
  if (!isNaN(offset)) {
    // Create a new date shifted by the offset hours
    // We use UTC for display to avoid local system timezone interference
    const shiftedDate = new Date(date.getTime() + (offset * 60 * 60 * 1000));
    return shiftedDate.toLocaleTimeString('en-US', { 
      timeZone: 'UTC',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  // Fallback to UTC
  return date.toLocaleTimeString('en-US', { 
    timeZone: 'UTC',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Create a deduplication key from message hash and signature
 * @param {string} hash - Message hash
 * @param {string} signature - Message signature
 * @returns {string} Deduplication key
 */
export function createMessageKey(hash, signature) {
  return `${hash}|${signature}`;
}

/**
 * Read password from stdin with character masking
 * @param {string} prompt - Prompt to display
 * @param {string} [maskChar='*'] - Character to display for each typed character
 * @returns {Promise<string>} The entered password
 */
export function readPassword(prompt, maskChar = '*') {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = Boolean(stdin.isTTY && stdin.isRaw);
    stdin.resume();
    if (stdin.isTTY) {
      try {
        stdin.setRawMode(true);
      } catch (error) {
        // Ignore raw mode failures and fall back to line mode
      }
    }
    stdin.setEncoding('utf8');
    process.stdout.write(prompt);
    let password = '';
    let done = false;

    const finish = () => {
      if (done) {
        return;
      }
      done = true;
      if (stdin.isTTY) {
        try {
          stdin.setRawMode(wasRaw);
        } catch (error) {
          // Ignore raw mode reset failures
        }
      }
      stdin.pause();
      stdin.removeListener('data', onData);
      process.stdout.write('\n');
      resolve(password);
    };

    const onData = (char) => {
      for (const ch of char) {
        if (done) {
          break;
        }
        switch (ch) {
          case KEY_CODES.ENTER:
          case KEY_CODES.CARRIAGE_RETURN:
          case KEY_CODES.CTRL_D:
            finish();
            break;

          case KEY_CODES.CTRL_C:
            process.stdout.write('\n');
            process.exit(0);
            break;

          case KEY_CODES.BACKSPACE:
          case KEY_CODES.BACKSPACE_ALT:
            if (password.length > 0) {
              password = password.slice(0, -1);
              process.stdout.write(TERMINAL.BACKSPACE);
            }
            break;

          default:
            password += ch;
            process.stdout.write(maskChar);
            break;
        }
      }
    };

    stdin.on('data', onData);
  });
}

/**
 * Suppress all console output during a function execution
 * @param {Function} fn - Function to execute with suppressed console
 * @returns {Promise<*>} Result of the function
 */
export async function withSuppressedConsole(fn) {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalInfo = console.info;
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;

  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  console.info = () => {};
  process.stdout.write = () => {};
  process.stderr.write = () => {};

  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
    console.info = originalInfo;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
}

/**
 * Reset terminal to normal state
 * Useful for cleanup on exit
 */
export function resetTerminal() {
  if (process.stdout.isTTY) {
    try {
      process.stdout.write(TERMINAL.EXIT_ALT_SCREEN);
      process.stdout.write(TERMINAL.SHOW_CURSOR);
      process.stdout.write(TERMINAL.RESET_ATTRIBUTES);
      process.stdout.write(TERMINAL.NEW_LINE);
    } catch (err) {
      // Ignore errors during terminal reset
    }
  }

  if (process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    } catch (err) {
      // Ignore errors during stdin reset
    }
  }
}

/**
 * Parse RPC host from URL for display
 * @param {string} url - Full RPC URL
 * @returns {string} Hostname:port
 */
export function parseRpcHost(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.host;
  } catch {
    return url;
  }
}

/**
 * Validate password meets requirements
 * @param {string} password - Password to validate
 * @param {number} minLength - Minimum length
 * @param {number} maxLength - Maximum length
 * @returns {{valid: boolean, error: string|null}} Validation result
 */
export function validatePassword(password, minLength, maxLength) {
  if (!password || password.length < minLength) {
    return {
      valid: false,
      error: `Password must be at least ${minLength} characters`
    };
  }

  if (password.length > maxLength) {
    return {
      valid: false,
      error: `Password must be at most ${maxLength} characters`
    };
  }

  return { valid: true, error: null };
}

/**
 * Check if a public key has been revealed
 * @param {Object} pubkeyResponse - Response from getpubkey RPC call
 * @returns {boolean} True if pubkey is revealed and valid
 */
export function isPubkeyRevealed(pubkeyResponse) {
  return pubkeyResponse?.pubkey &&
         pubkeyResponse?.revealed === 1 &&
         pubkeyResponse.pubkey.trim().length > 0;
}

/**
 * Normalize public key to lowercase hex
 * @param {string} pubkey - Public key to normalize
 * @returns {string} Normalized public key
 */
export function normalizePubkey(pubkey) {
  return pubkey.trim().toLowerCase();
}

/**
 * Check if server has privacy layer enabled
 * @param {Object} msgInfo - Response from depingetmsginfo
 * @returns {boolean} True if privacy layer is enabled
 */
export function hasPrivacyLayer(msgInfo) {
  return msgInfo?.depinpoolpkey && msgInfo.depinpoolpkey !== '0';
}

/**
 * Check if response indicates encrypted privacy layer
 * @param {Object} response - RPC response
 * @returns {boolean} True if response is encrypted
 */
export function isEncryptedResponse(response) {
  return Boolean(response?.encrypted);
}
