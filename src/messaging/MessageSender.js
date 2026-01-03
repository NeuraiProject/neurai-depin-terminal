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
import { isPubkeyRevealed, normalizePubkey, hasPrivacyLayer } from '../utils.js';

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
   */
  constructor(config, walletManager, rpcService, neuraiDepinMsg) {
    this.config = config;
    this.walletManager = walletManager;
    this.rpcService = rpcService;
    this.neuraiDepinMsg = neuraiDepinMsg;
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
   * @returns {Promise<Array<string>>} Array of addresses
   * @throws {MessageError} If no token holders found
   */
  async getTokenHolders() {
    const rpc = this.getRpc();
    const addressesData = await rpc(RPC_METHODS.LIST_ADDRESSES_BY_ASSET, [this.config.token]);
    const addresses = Object.keys(addressesData);

    if (addresses.length === 0) {
      throw new MessageError(ERROR_MESSAGES.NO_TOKEN_HOLDERS);
    }

    return addresses;
  }

  /**
   * Get revealed public keys from addresses
   * @param {Array<string>} addresses - Array of addresses
   * @returns {Promise<Array<string>>} Array of revealed public keys (normalized)
   * @throws {MessageError} If no recipients with revealed public keys
   */
  async getRecipientPubkeys(addresses) {
    const recipients = await this.getRecipientEntries(addresses);
    return recipients.map((entry) => entry.pubkey);
  }

  /**
   * Get revealed public keys with addresses
   * @param {Array<string>} addresses - Array of addresses
   * @returns {Promise<Array<{address: string, pubkey: string}>>} Recipient entries
   * @throws {MessageError} If no recipients with revealed public keys
   */
  async getRecipientEntries(addresses) {
    const recipients = [];
    const rpc = this.getRpc();

    for (const addr of addresses) {
      try {
        const res = await rpc(RPC_METHODS.GET_PUBKEY, [addr]);

        if (isPubkeyRevealed(res)) {
          recipients.push({ address: addr, pubkey: normalizePubkey(res.pubkey) });
        }
      } catch (error) {
        // Skip addresses without revealed pubkey
        continue;
      }
    }

    if (recipients.length === 0) {
      throw new MessageError(ERROR_MESSAGES.NO_RECIPIENTS);
    }

    return recipients;
  }

  /**
   * Get recipient addresses eligible for private messages
   * @returns {Promise<Array<string>>} Array of addresses
   * @throws {MessageError} If no recipients with revealed public keys
   */
  async getPrivateRecipientAddresses() {
    const addresses = await this.getTokenHolders();
    const recipients = await this.getRecipientEntries(addresses);
    return recipients.map((entry) => entry.address).sort();
  }

  /**
   * Get revealed public key for a single address
   * @param {string} address - Recipient address
   * @returns {Promise<string>} Normalized recipient public key
   * @throws {MessageError} If pubkey is not revealed or RPC fails
   */
  async getRecipientPubkeyForAddress(address) {
    const rpc = this.getRpc();

    try {
      const res = await rpc(RPC_METHODS.GET_PUBKEY, [address]);

      if (!isPubkeyRevealed(res)) {
        throw new MessageError(`${ERROR_MESSAGES.RECIPIENT_PUBKEY_NOT_REVEALED}: ${address}`);
      }

      return normalizePubkey(res.pubkey);
    } catch (error) {
      if (error instanceof MessageError) {
        throw error;
      }
      throw new MessageError(`Failed to fetch recipient pubkey: ${error.message}`);
    }
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
      return { messageType: 'group', message: trimmed, recipientAddress: null };
    }

    const match = trimmed.match(/^@(\S+)\s+(.+)$/);

    if (!match) {
      throw new MessageError(ERROR_MESSAGES.INVALID_PRIVATE_MESSAGE_FORMAT);
    }

    const recipientAddress = match[1];
    const privateMessage = match[2].trim();

    return { messageType: 'private', message: privateMessage, recipientAddress };
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
        // 1. Get all token holders (broadcast)
        const addresses = await this.getTokenHolders();

        // 2. Get pubkeys from all recipients
        recipientPubKeys = await this.getRecipientPubkeys(addresses);
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
        recipientAddress: parsed.recipientAddress
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
