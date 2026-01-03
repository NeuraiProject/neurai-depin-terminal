/**
 * Message sender for Neurai DePIN Terminal
 * Handles sending broadcast and private messages
 * @module MessageSender
 */

import {
  RPC_METHODS,
  ERROR_MESSAGES
} from '../constants.js';
import { MessageError, DepinError } from '../errors.js';
import { hasPrivacyLayer } from '../utils.js';
import { RecipientDirectory } from './RecipientDirectory.js';
import { MESSAGE_TYPES } from '../domain/messageTypes.js';

/**
 * Sends DePIN messages to token holders or a specific recipient
 */
export class MessageSender {
  /**
   * Create a new MessageSender instance
   * @param {Object} config - Configuration object
   * @param {string} config.token - DePIN token name
   * @param {WalletManager} walletManager - Wallet manager instance
   * @param {RpcService} rpcService - RPC service instance
   * @param {Object} neuraiDepinMsg - DePIN message library
   * @param {RecipientDirectory} [recipientDirectory] - Recipient directory (shared cache)
   */
  constructor(config, walletManager, rpcService, neuraiDepinMsg, recipientDirectory = null) {
    this.config = config;
    this.walletManager = walletManager;
    this.rpcService = rpcService;
    this.neuraiDepinMsg = neuraiDepinMsg;
    this.recipientDirectory = recipientDirectory
      || new RecipientDirectory(config, rpcService, neuraiDepinMsg);
  }

  /**
   * Get current RPC client (dynamically to handle reconnections)
   * @returns {Function} RPC function
   */
  getRpc() {
    return this.rpcService.call.bind(this.rpcService);
  }

  /**
   * Get all addresses holding the token
   * @returns {Promise<Array<{address: string, pubkey: string}>>} Recipient entries
   * @throws {MessageError} If no token holders found
   */
  async fetchDepinRecipients() {
    return this.recipientDirectory.fetchEntries();
  }

  async refreshRecipientCache(force = false) {
    return this.recipientDirectory.refresh(force);
  }

  getCachedRecipientEntries() {
    return this.recipientDirectory.getCachedEntries();
  }

  getCachedPrivateRecipientAddresses() {
    return this.recipientDirectory.getCachedAddresses();
  }

  /**
   * Get revealed public keys
   * @returns {Promise<Array<string>>} Array of revealed public keys (normalized)
   * @throws {MessageError} If no recipients with revealed public keys
   */
  async getRecipientPubkeys() {
    return this.recipientDirectory.getPubkeys();
  }

  /**
   * Get revealed public keys with addresses
   * @returns {Promise<Array<{address: string, pubkey: string}>>} Recipient entries
   * @throws {MessageError} If no recipients with revealed public keys
   */
  async getRecipientEntries() {
    return this.recipientDirectory.getEntries();
  }

  /**
   * Get recipient addresses eligible for private messages
   * @returns {Promise<Array<string>>} Array of addresses
   * @throws {MessageError} If no recipients with revealed public keys
   */
  async getPrivateRecipientAddresses() {
    return this.recipientDirectory.getAddresses();
  }

  /**
   * Get revealed public key for a single address
   * @param {string} address - Recipient address
   * @returns {Promise<string>} Normalized recipient public key
   * @throws {MessageError} If pubkey is not revealed or RPC fails
   */
  async getRecipientPubkeyForAddress(address) {
    return this.recipientDirectory.getPubkeyForAddress(address);
  }

  /**
   * Parse message input to detect private messages
   * @param {string} message - Raw message input
   * @returns {{messageType: string, message: string, recipientAddress: (string|null)}}
   * @throws {MessageError} If private format is invalid
   */
  parseMessageInput(message) {
    const trimmed = message.trim();

    if (!trimmed.startsWith('@')) {
      return { messageType: MESSAGE_TYPES.GROUP, message: trimmed, recipientAddress: null };
    }

    const match = trimmed.match(/^@(\S+)\s+(.+)$/);

    if (!match) {
      throw new MessageError(ERROR_MESSAGES.INVALID_PRIVATE_MESSAGE_FORMAT);
    }

    const recipientAddress = match[1];
    const privateMessage = match[2].trim();

    return { messageType: MESSAGE_TYPES.PRIVATE, message: privateMessage, recipientAddress };
  }

  /**
   * Build encrypted DePIN message
   * @param {string} message - Plaintext message
   * @param {Array<string>} recipientPubKeys - Array of recipient public keys
   * @param {"private"|"group"} messageType - Message type
   * @returns {Promise<Object>} Build result with hex payload
   */
  async buildEncryptedMessage(message, recipientPubKeys, messageType) {
    return await this.neuraiDepinMsg.buildDepinMessage({
      token: this.config.token,
      senderAddress: this.walletManager.getAddress(),
      senderPubKey: this.walletManager.getPublicKey(),
      privateKey: this.walletManager.getPrivateKeyHex(),
      timestamp: Math.floor(Date.now() / 1000),
      message: message,
      recipientPubKeys: recipientPubKeys,
      messageType: messageType
    });
  }

  /**
   * Wrap message with server privacy layer if enabled
   * @param {string} payloadHex - Message payload in hex format
   * @returns {Promise<string>} Wrapped payload or original if no privacy
   */
  async wrapWithPrivacyLayer(payloadHex) {
    try {
      const rpc = this.getRpc();
      const msgInfo = await rpc(RPC_METHODS.DEPIN_GET_MSG_INFO, []);

      if (hasPrivacyLayer(msgInfo)) {
        return await this.neuraiDepinMsg.wrapMessageForServer(
          payloadHex,
          msgInfo.depinpoolpkey,
          this.walletManager.getAddress()
        );
      }
    } catch (error) {
      // If depingetmsginfo fails, continue without privacy layer
    }

    return payloadHex;
  }

  /**
   * Submit message to DePIN pool
   * @param {string} payload - Message payload (potentially wrapped)
   * @returns {Promise<Object>} Submission result with hash/txid
   */
  async submitToPool(payload) {
    const rpc = this.getRpc();
    return await rpc(RPC_METHODS.DEPIN_SUBMIT_MSG, [payload]);
  }

  /**
   * Send a group or private message
   * @param {string} message - Plaintext message to send
   * @returns {Promise<Object>} Result object with hash and recipient count
   * @returns {Promise<Object>} result
   * @returns {string} result.hash - Transaction hash
   * @returns {number} result.recipients - Number of recipients
   * @returns {number} result.timestamp - Send timestamp
   * @returns {"private"|"group"} result.messageType - Message type
   * @returns {string|null} result.recipientAddress - Target address for private messages
   * @returns {string} result.messageHash - Message hash used for deduplication
   * @throws {MessageError} If sending fails
   */
  async send(message) {
    try {
      // Attempt reconnection if not connected
      if (!this.rpcService.isConnected()) {
        const reconnected = await this.rpcService.attemptReconnect(true);

        if (!reconnected) {
          throw new MessageError('RPC server not available. Cannot send message.');
        }
      }

      const parsed = this.parseMessageInput(message);
      let recipientPubKeys = [];

      if (parsed.messageType === 'private') {
        const recipientPubkey = await this.getRecipientPubkeyForAddress(parsed.recipientAddress);
        recipientPubKeys = [recipientPubkey];
      } else {
        // 1. Get pubkeys from all recipients (broadcast)
        recipientPubKeys = await this.getRecipientPubkeys();
      }

      // 3. Build encrypted message
      const buildResult = await this.buildEncryptedMessage(
        parsed.message,
        recipientPubKeys,
        parsed.messageType
      );

      // 4. Wrap with server privacy layer if enabled
      const payload = await this.wrapWithPrivacyLayer(buildResult.hex);

      // 5. Send to pool
      const result = await this.submitToPool(payload);

      // Mark as connected on successful send
      this.rpcService.connected = true;

      return {
        hash: result.hash || result.txid,
        recipients: parsed.messageType === 'private' ? 1 : recipientPubKeys.length,
        timestamp: Math.floor(Date.now() / 1000),
        messageType: parsed.messageType,
        recipientAddress: parsed.recipientAddress,
        messageHash: buildResult.messageHash
      };
    } catch (error) {
      // Mark as disconnected on error
      this.rpcService.connected = false;

      if (error instanceof DepinError) {
        throw error;
      }
      throw new MessageError(`Failed to send message: ${error.message}`);
    }
  }
}
