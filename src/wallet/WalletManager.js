/**
 * Wallet manager for Neurai DePIN Terminal
 * Handles wallet initialization and key derivation
 * @module WalletManager
 */

import NeuraiKey from '@neuraiproject/neurai-key';
import {
  ADDRESS,
  ERROR_MESSAGES
} from '../constants.js';
import { WalletError } from '../errors.js';
import { withSuppressedConsole } from '../utils.js';

/**
 * Manages wallet operations
 */
export class WalletManager {
  /**
   * Create a new WalletManager instance
   * @param {Object} config - Configuration object
   * @param {string} config.network - Network name (xna)
   * @param {string} config.privateKey - WIF private key
   */
  constructor(config) {
    this.config = config;
    this.address = null;
    this.publicKey = null;
    this.privateKeyHex = null;
  }

  /**
   * Derive address and public key from WIF private key
   * Uses NeuraiKey to get address and derive compressed public key
   * @returns {Promise<void>}
   * @throws {WalletError} If key derivation fails
   */
  async deriveKeysFromWif() {
    try {
      // Suppress NeuraiKey console output
      const keyInfo = await withSuppressedConsole(() => {
        return NeuraiKey.getAddressByWIF(this.config.network, this.config.privateKey);
      });

      this.address = keyInfo.address;
      this.privateKeyHex = keyInfo.privateKey;

      // Derive compressed public key from WIF
      this.publicKey = await withSuppressedConsole(() => {
        return NeuraiKey.getPubkeyByWIF(this.config.network, this.config.privateKey);
      });
    } catch (error) {
      throw new WalletError(`${ERROR_MESSAGES.INVALID_WIF}: ${error.message}`);
    }
  }

  /**
   * Initialize wallet: derive keys
   * @returns {Promise<void>}
   * @throws {WalletError} If key derivation fails
   */
  async initialize() {
    // Derive keys from WIF (fatal if fails)
    await this.deriveKeysFromWif();

    console.log(`DePIN Address: ${this.address}`);
    console.log(`Public Key: ${this.publicKey.slice(0, ADDRESS.PUBKEY_DISPLAY_LENGTH)}...`);
  }

  /**
   * Get wallet address
   * @returns {string} Neurai address
   */
  getAddress() {
    return this.address;
  }

  /**
   * Get public key
   * @returns {string} Compressed public key in hex format
   */
  getPublicKey() {
    return this.publicKey;
  }

  /**
   * Get private key in hex format
   * @returns {string} Private key in hex format
   */
  getPrivateKeyHex() {
    return this.privateKeyHex;
  }
}
