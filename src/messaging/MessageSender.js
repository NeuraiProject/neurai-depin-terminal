/**
 * Message sender for Neurai DePIN Terminal
 * Handles sending broadcast messages to all token holders
 * @module MessageSender
 */

import {
  RPC_METHODS,
  ERROR_MESSAGES
} from '../constants.js';
import { MessageError, DepinError } from '../errors.js';
import { isPubkeyRevealed, normalizePubkey, hasPrivacyLayer } from '../utils.js';

/**
 * Sends DePIN messages to all token holders
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
    const recipientPubKeys = [];
    const rpc = this.getRpc();

    for (const addr of addresses) {
      try {
        const res = await rpc(RPC_METHODS.GET_PUBKEY, [addr]);

        if (isPubkeyRevealed(res)) {
          recipientPubKeys.push(normalizePubkey(res.pubkey));
        }
      } catch (error) {
        // Skip addresses without revealed pubkey
        continue;
      }
    }

    if (recipientPubKeys.length === 0) {
      throw new MessageError(ERROR_MESSAGES.NO_RECIPIENTS);
    }

    return recipientPubKeys;
  }

  /**
   * Build encrypted DePIN message
   * @param {string} message - Plaintext message
   * @param {Array<string>} recipientPubKeys - Array of recipient public keys
   * @returns {Promise<Object>} Build result with hex payload
   */
  async buildEncryptedMessage(message, recipientPubKeys) {
    return await this.neuraiDepinMsg.buildDepinMessage({
      token: this.config.token,
      senderAddress: this.walletManager.getAddress(),
      senderPubKey: this.walletManager.getPublicKey(),
      privateKey: this.walletManager.getPrivateKeyHex(),
      timestamp: Math.floor(Date.now() / 1000),
      message: message,
      recipientPubKeys: recipientPubKeys
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
   * Send a broadcast message to all token holders
   * @param {string} message - Plaintext message to send
   * @returns {Promise<Object>} Result object with hash and recipient count
   * @returns {Promise<Object>} result
   * @returns {string} result.hash - Transaction hash
   * @returns {number} result.recipients - Number of recipients
   * @returns {number} result.timestamp - Send timestamp
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

      // 1. Get all token holders (broadcast)
      const addresses = await this.getTokenHolders();

      // 2. Get pubkeys from all recipients
      const recipientPubKeys = await this.getRecipientPubkeys(addresses);

      // 3. Build encrypted message
      const buildResult = await this.buildEncryptedMessage(message, recipientPubKeys);

      // 4. Wrap with server privacy layer if enabled
      const payload = await this.wrapWithPrivacyLayer(buildResult.hex);

      // 5. Send to pool
      const result = await this.submitToPool(payload);

      // Mark as connected on successful send
      this.rpcService.connected = true;

      return {
        hash: result.hash || result.txid,
        recipients: recipientPubKeys.length,
        timestamp: Math.floor(Date.now() / 1000)
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
