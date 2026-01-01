/**
 * DePIN message library loader
 * Loads the IIFE bundle from @neuraiproject/neurai-depin-msg
 * @module depinMsgLoader
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LibraryError } from '../errors.js';
import { ERROR_MESSAGES } from '../constants.js';

// Handle both ESM and CJS (for bundling)
// We use a check that doesn't trigger esbuild warnings for CJS targets
const getDirname = () => {
  try {
    if (typeof __dirname !== 'undefined') return __dirname;
    return path.dirname(fileURLToPath(import.meta.url));
  } catch (e) {
    return process.cwd();
  }
};

const _dirname = getDirname();

/**
 * Path to the neurai-depin-msg bundle
 * Checks multiple locations to support both development and bundled environments
 */
const possiblePaths = [
  path.join(_dirname, '../../node_modules/@neuraiproject/neurai-depin-msg/dist/neurai-depin-msg.js'),
  path.join(_dirname, '../node_modules/@neuraiproject/neurai-depin-msg/dist/neurai-depin-msg.js'),
  path.join(process.cwd(), 'node_modules/@neuraiproject/neurai-depin-msg/dist/neurai-depin-msg.js')
];

const BUNDLE_PATH = possiblePaths.find(p => fs.existsSync(p)) || possiblePaths[0];

/**
 * Load the DePIN message library IIFE bundle into globalThis
 * The library provides functions for building, encrypting, and decrypting DePIN messages
 * @returns {Promise<Object>} The neuraiDepinMsg library object
 * @throws {LibraryError} If bundle not found or fails to load
 */
export async function loadDepinMsgLibrary() {
  // Check if bundle exists
  if (!fs.existsSync(BUNDLE_PATH)) {
    throw new LibraryError(
      'neurai-depin-msg bundle not found. Please run: npm install'
    );
  }

  try {
    // Read bundle code
    const bundleCode = fs.readFileSync(BUNDLE_PATH, 'utf-8');

    // Execute IIFE in global context
    // The bundle assigns to globalThis.neuraiDepinMsg
    const scriptFunction = new Function(bundleCode);
    scriptFunction();

    // Verify library loaded successfully
    if (!globalThis.neuraiDepinMsg) {
      throw new LibraryError(ERROR_MESSAGES.LIBRARY_LOAD_FAILED);
    }

    return globalThis.neuraiDepinMsg;
  } catch (error) {
    if (error instanceof LibraryError) {
      throw error;
    }
    throw new LibraryError(`${ERROR_MESSAGES.LIBRARY_LOAD_FAILED}: ${error.message}`);
  }
}
