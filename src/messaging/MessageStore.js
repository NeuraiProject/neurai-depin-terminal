/**
 * Message store for Neurai DePIN Terminal
 * Handles message storage and deduplication
 * @module MessageStore
 */

import { createMessageKey } from '../utils.js';

/**
 * Stores and deduplicates DePIN messages
 */
export class MessageStore {
  /**
   * Create a new MessageStore instance
   */
  constructor() {
    /** @type {Array<Object>} Stored messages sorted by timestamp */
    this.messages = [];

    /** @type {Set<string>} Set of seen message keys for deduplication */
    this.seenHashes = new Set();
  }

  /**
   * Add a message to the store with deduplication
   * Deduplication key format: hash|signature
   * @param {Object} msg - Message object
   * @param {string} msg.hash - Message hash
   * @param {string} msg.signature - Message signature
   * @param {number} msg.timestamp - Unix timestamp in seconds
   * @param {string} msg.sender - Sender address
   * @param {string} msg.message - Message content
   * @returns {boolean} True if message is new, false if duplicate
   */
  addMessage(msg) {
    const key = createMessageKey(msg.hash, msg.signature);

    if (this.seenHashes.has(key)) {
      return false; // Duplicate message
    }

    this.seenHashes.add(key);
    this.messages.push(msg);

    // Keep messages sorted by timestamp (oldest first)
    this.messages.sort((a, b) => a.timestamp - b.timestamp);

    return true; // New message added
  }

  /**
   * Get all stored messages
   * @returns {Array<Object>} Copy of messages array
   */
  getMessages() {
    return [...this.messages];
  }

  /**
   * Get the latest timestamp from stored messages
   * Used for incremental polling
   * @returns {number} Latest timestamp or 0 if no messages
   */
  getLastTimestamp() {
    if (this.messages.length === 0) {
      return 0;
    }

    return Math.max(...this.messages.map(m => m.timestamp));
  }

  /**
   * Get total count of stored messages
   * @returns {number} Number of messages
   */
  getCount() {
    return this.messages.length;
  }

  /**
   * Clear all stored messages
   * Useful for testing or resetting state
   */
  clear() {
    this.messages = [];
    this.seenHashes.clear();
  }

  /**
   * Check if a message exists by hash and signature
   * @param {string} hash - Message hash
   * @param {string} signature - Message signature
   * @returns {boolean} True if message exists
   */
  hasMessage(hash, signature) {
    const key = createMessageKey(hash, signature);
    return this.seenHashes.has(key);
  }
}
