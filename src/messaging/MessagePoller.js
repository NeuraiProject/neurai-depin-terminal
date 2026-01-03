/**
 * Message poller for Neurai DePIN Terminal
 * Handles automatic polling for new messages
 * @module MessagePoller
 */

import { EventEmitter } from 'events';
import { RPC_METHODS } from '../constants.js';
import { isEncryptedResponse } from '../utils.js';
import { MESSAGE_TYPES, normalizeMessageType } from '../domain/messageTypes.js';
import { RecipientDirectory } from './RecipientDirectory.js';

/**
 * Polls for new DePIN messages at regular intervals
 * @extends EventEmitter
 * @fires MessagePoller#message
 * @fires MessagePoller#poll-complete
 * @fires MessagePoller#error
 * @fires MessagePoller#reconnected
 */
export class MessagePoller extends EventEmitter {
  /**
   * Create a new MessagePoller instance
   * @param {Object} config - Configuration object
   * @param {string} config.token - DePIN token name
   * @param {number} config.pollInterval - Polling interval in milliseconds
   * @param {RpcService} rpcService - RPC service instance
   * @param {MessageStore} messageStore - Message store instance
   * @param {Object} neuraiDepinMsg - DePIN message library
   * @param {WalletManager} walletManager - Wallet manager instance (for decryption)
   * @param {RecipientDirectory} [recipientDirectory] - Recipient directory (shared cache)
   */
  constructor(config, rpcService, messageStore, neuraiDepinMsg, walletManager, recipientDirectory = null) {
    super();
    this.config = config;
    this.rpcService = rpcService;
    this.messageStore = messageStore;
    this.neuraiDepinMsg = neuraiDepinMsg;
    this.walletManager = walletManager;
    this.intervalId = null;
    this.isPolling = false;
    this.wasDisconnected = false; // Track if we were disconnected
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
   * Start polling at configured interval
   */
  start() {
    if (this.intervalId) {
      return;
    }
    this.poll(); // Initial poll
    this.intervalId = setInterval(() => this.poll(), this.config.pollInterval);
  }

  /**
   * Stop polling
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Build RPC parameters for depinreceivemsg
   * Includes incremental timestamp for efficiency
   * @param {boolean} [forceFullPoll=false] - If true, fetch all messages without timestamp filter
   * @returns {Array} RPC parameters
   */
  buildRpcParams(forceFullPoll = false) {
    const params = [this.config.token, this.walletManager.getAddress()];

    // If forcing full poll (after reconnection), don't include timestamp
    if (forceFullPoll) {
      return params;
    }

    const lastTimestamp = this.messageStore.getLastTimestamp();

    if (lastTimestamp > 0) {
      params.push(lastTimestamp);
    }

    return params;
  }

  /**
   * Unwrap server privacy layer if present
   * @param {Object} result - RPC result
   * @returns {Promise<Object>} Unwrapped result
   */
  async unwrapPrivacyLayer(result) {
    if (!isEncryptedResponse(result)) {
      return result;
    }

    const decryptedJson = await this.neuraiDepinMsg.unwrapMessageFromServer(
      result.encrypted,
      this.walletManager.getPrivateKeyHex()
    );

    return JSON.parse(decryptedJson);
  }

  /**
   * Fetch pool information from RPC
   * @returns {Promise<Object|null>} Pool info or null if failed
   */
  async fetchPoolInfo() {
    try {
      return await this.rpcService.call(RPC_METHODS.DEPIN_GET_MSG_INFO, []);
    } catch (error) {
      return null; // Non-fatal, continue without pool info
    }
  }

  /**
   * Poll for new messages
   * Emits 'poll-complete' on success, 'error' on failure
   * Automatically attempts reconnection if disconnected
   * @returns {Promise<void>}
   */
  async poll() {
    if (this.isPolling) {
      return; // Avoid concurrent polling
    }

    this.isPolling = true;

    try {
      // Do not attempt reconnection here.
      // Reconnection is handled by the verification loop (aligned with the UI countdown).
      if (!this.rpcService.isConnected()) {
        throw new Error('RPC server not available');
      }

      // Call depinreceivemsg
      // If recovering from disconnect, do full poll to get all messages
      const forceFull = this.wasDisconnected;
      const params = this.buildRpcParams(forceFull);
      const rpc = this.getRpc();
      let result = await rpc(RPC_METHODS.DEPIN_RECEIVE_MSG, params);

      // Mark as connected on successful call
      this.walletManager.connected = true;
      this.rpcService.connected = true;

      // Unwrap privacy layer if present
      result = await this.unwrapPrivacyLayer(result);

      // Process messages
      const messages = Array.isArray(result) ? result : [];
      let newMessagesCount = 0;

      for (const msg of messages) {
        const processed = await this.processMessage(msg);
        if (processed) {
          newMessagesCount++;
        }
      }

      // Get pool info
      const poolInfo = await this.fetchPoolInfo();

      /**
       * Poll complete event
       * @event MessagePoller#poll-complete
       * @type {Object}
       * @property {Date} date - Poll completion time
       * @property {number} newMessages - Number of new messages
       * @property {number} totalMessages - Total messages in store
       * @property {Object|null} poolInfo - Pool information from RPC
       */
      this.emit('poll-complete', {
        date: new Date(),
        newMessages: newMessagesCount,
        totalMessages: this.messageStore.getCount(),
        poolInfo: poolInfo
      });

      // Emit reconnection event only once after successful poll
      if (this.wasDisconnected) {
        this.wasDisconnected = false;
        this.emit('reconnected');
      }

    } catch (error) {
      // Mark as disconnected on error
      this.walletManager.connected = false;
      this.rpcService.connected = false;
      this.wasDisconnected = true;

      /**
       * Error event
       * @event MessagePoller#error
       * @type {Error}
       */
      this.emit('error', error);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Reconnected event - emitted when RPC connection is restored
   * @event MessagePoller#reconnected
   */

  /**
   * Validate message has required fields
   * @param {Object} msg - Message to validate
   * @returns {boolean} True if valid
   */
  isValidMessage(msg) {
    return Boolean(
      msg &&
      msg.hash &&
      msg.signature_hex &&
      msg.encrypted_payload_hex
    );
  }

  /**
   * Decrypt message payload
   * @param {string} encryptedPayloadHex - Encrypted payload in hex format
   * @returns {Promise<string|null>} Decrypted plaintext or null if failed
   */
  async decryptPayload(encryptedPayloadHex) {
    try {
      return await this.neuraiDepinMsg.decryptDepinReceiveEncryptedPayload(
        encryptedPayloadHex,
        this.walletManager.getPrivateKeyHex()
      );
    } catch (error) {
      return null; // Not for us or malformed
    }
  }

  /**
   * Process a single message
   * Validates, decrypts, deduplicates, and emits if new
   * @param {Object} msg - Raw message from RPC
   * @returns {Promise<boolean>} True if message was new and processed
   */
  async processMessage(msg) {
    try {
      // Validate required fields
      if (!this.isValidMessage(msg)) {
        return false;
      }

      // Decrypt payload
      const plaintext = await this.decryptPayload(msg.encrypted_payload_hex);

      if (!plaintext) {
        return false; // Not for us or malformed
      }

      const messageType = normalizeMessageType(msg.message_type || msg.messageType);
      let peerAddress = null;

      if (messageType === MESSAGE_TYPES.PRIVATE) {
        if (msg.sender === this.walletManager.getAddress()) {
          peerAddress = await this.resolvePrivatePeerAddress(msg);
        } else {
          peerAddress = msg.sender;
        }
      }

      // Add to store with deduplication
      const isNew = this.messageStore.addMessage({
        sender: msg.sender,
        message: plaintext,
        timestamp: msg.timestamp,
        hash: msg.hash,
        signature: msg.signature_hex,
        messageType: messageType,
        peerAddress: peerAddress
      });

      if (isNew) {
        /**
         * Message event
         * @event MessagePoller#message
         * @type {Object}
         * @property {string} sender - Sender address
         * @property {string} message - Decrypted message content
         * @property {number} timestamp - Unix timestamp in seconds
         * @property {string} hash - Message hash
         */
        this.emit('message', {
          sender: msg.sender,
          message: plaintext,
          timestamp: msg.timestamp,
          hash: msg.hash,
          messageType: messageType,
          peerAddress: peerAddress
        });
        return true;
      }

      return false;
    } catch (error) {
      // Error decrypting individual message, skip
      return false;
    }
  }

  async resolvePrivatePeerAddress(msg) {
    const mapped = this.messageStore.getOutgoingPrivateRecipient(msg.hash);
    if (mapped) {
      return mapped;
    }

    const hashes = this.extractRecipientHashes(msg.encrypted_payload_hex);
    if (!hashes.length) {
      return null;
    }

    const map = await this.recipientDirectory.getHashMap();
    for (const hash of hashes) {
      const address = map.get(hash);
      if (address && address !== this.walletManager.getAddress()) {
        return address;
      }
    }

    return null;
  }

  extractRecipientHashes(encryptedPayloadHex) {
    const utils = this.neuraiDepinMsg?.utils;
    if (!utils?.hexToBytes || !utils?.bytesToHex) {
      return [];
    }

    try {
      const hex = this.normalizeHex(encryptedPayloadHex);
      if (!hex) {
        return [];
      }
      const serialized = utils.hexToBytes(hex);
      let offset = 0;

      const ephem = this.readVector(serialized, offset);
      offset = ephem.offset;
      const payload = this.readVector(serialized, offset);
      offset = payload.offset;
      const countRes = this.readCompactSize(serialized, offset);
      const count = countRes.value;
      offset = countRes.offset;

      const hashes = [];
      for (let i = 0; i < count; i += 1) {
        if (offset + 20 > serialized.length) {
          break;
        }
        const keyId = serialized.slice(offset, offset + 20);
        offset += 20;
        const v = this.readVector(serialized, offset);
        offset = v.offset;
        hashes.push(utils.bytesToHex(keyId).toLowerCase());
      }
      return hashes;
    } catch (error) {
      return [];
    }
  }

  normalizeHex(hex) {
    if (typeof hex !== 'string') {
      return '';
    }
    const trimmed = hex.startsWith('0x') ? hex.slice(2) : hex;
    return trimmed.trim().toLowerCase();
  }

  readCompactSize(buf, offset) {
    if (offset >= buf.length) {
      throw new Error('CompactSize: out of bounds');
    }
    const first = buf[offset];
    if (first < 253) return { value: first, offset: offset + 1 };
    if (first === 253) {
      if (offset + 3 > buf.length) throw new Error('CompactSize: truncated uint16');
      const value = buf[offset + 1] | (buf[offset + 2] << 8);
      return { value, offset: offset + 3 };
    }
    if (first === 254) {
      if (offset + 5 > buf.length) throw new Error('CompactSize: truncated uint32');
      const value =
        (buf[offset + 1]) |
        (buf[offset + 2] << 8) |
        (buf[offset + 3] << 16) |
        (buf[offset + 4] << 24);
      return { value: value >>> 0, offset: offset + 5 };
    }
    if (offset + 9 > buf.length) throw new Error('CompactSize: truncated uint64');
    let value = 0n;
    for (let i = 0; i < 8; i += 1) {
      value |= BigInt(buf[offset + 1 + i]) << (8n * BigInt(i));
    }
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('CompactSize: value too large');
    }
    return { value: Number(value), offset: offset + 9 };
  }

  readVector(buf, offset) {
    const { value: len, offset: afterLen } = this.readCompactSize(buf, offset);
    if (afterLen + len > buf.length) {
      throw new Error('Vector: truncated');
    }
    const data = buf.slice(afterLen, afterLen + len);
    return { data, offset: afterLen + len };
  }
}
