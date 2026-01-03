/**
 * Recipient directory for DePIN messaging
 * Shared cache for addresses, pubkeys, and recipient hash lookups.
 * @module RecipientDirectory
 */

import {
  RPC_METHODS,
  ERROR_MESSAGES,
  RECIPIENT_CACHE
} from '../constants.js';
import { MessageError } from '../errors.js';
import { normalizePubkey } from '../utils.js';

export class RecipientDirectory {
  constructor(config, rpcService, neuraiDepinMsg) {
    this.config = config;
    this.rpcService = rpcService;
    this.neuraiDepinMsg = neuraiDepinMsg;
    this.cache = {
      entries: [],
      updatedAt: 0,
      pending: null
    };
    this.hashCache = {
      map: new Map(),
      updatedAt: 0,
      pending: null
    };
  }

  getRpc() {
    return this.rpcService.call.bind(this.rpcService);
  }

  async fetchEntries() {
    const rpc = this.getRpc();

    try {
      const result = await rpc(RPC_METHODS.LIST_DEPIN_ADDRESSES, [this.config.token]);

      if (!Array.isArray(result)) {
        throw new MessageError('Invalid response from listdepinaddresses');
      }

      const entries = result
        .filter((entry) => entry && entry.address && entry.pubkey)
        .map((entry) => ({
          address: entry.address,
          pubkey: normalizePubkey(entry.pubkey)
        }));

      if (entries.length === 0) {
        throw new MessageError(ERROR_MESSAGES.NO_RECIPIENTS);
      }

      return entries;
    } catch (error) {
      if (error instanceof MessageError) {
        throw error;
      }
      throw new MessageError(`Failed to fetch recipient list: ${error.message}`);
    }
  }

  async refresh(force = false) {
    const now = Date.now();
    const hasCache = this.cache.entries.length > 0;
    const isFresh = now - this.cache.updatedAt < RECIPIENT_CACHE.REFRESH_MS;

    if (!force && hasCache && isFresh) {
      return this.cache.entries;
    }

    if (this.cache.pending) {
      return this.cache.pending;
    }

    this.cache.pending = (async () => {
      const entries = await this.fetchEntries();
      this.cache.entries = entries;
      this.cache.updatedAt = Date.now();
      return entries;
    })();

    try {
      return await this.cache.pending;
    } catch (error) {
      if (hasCache) {
        return this.cache.entries;
      }
      throw error;
    } finally {
      this.cache.pending = null;
    }
  }

  getCachedEntries() {
    return this.cache.entries;
  }

  getCachedAddresses() {
    if (!this.cache.entries.length) {
      return [];
    }
    return this.cache.entries.map((entry) => entry.address).sort();
  }

  async getEntries() {
    return this.refresh();
  }

  async getAddresses() {
    const entries = await this.refresh();
    return entries.map((entry) => entry.address).sort();
  }

  async getPubkeys() {
    const entries = await this.refresh();
    return entries.map((entry) => entry.pubkey);
  }

  async getPubkeyForAddress(address) {
    let recipients = await this.refresh();
    let match = recipients.find((entry) => entry.address === address);

    if (!match) {
      recipients = await this.refresh(true);
      match = recipients.find((entry) => entry.address === address);
    }

    if (!match) {
      throw new MessageError(`${ERROR_MESSAGES.RECIPIENT_PUBKEY_NOT_REVEALED}: ${address}`);
    }

    return match.pubkey;
  }

  async getHashMap(force = false) {
    const now = Date.now();
    const hasCache = this.hashCache.map.size > 0;
    const isFresh = now - this.hashCache.updatedAt < RECIPIENT_CACHE.REFRESH_MS;

    if (!force && hasCache && isFresh) {
      return this.hashCache.map;
    }

    if (this.hashCache.pending) {
      return this.hashCache.pending;
    }

    this.hashCache.pending = (async () => {
      const entries = await this.refresh(force);
      const utils = this.neuraiDepinMsg?.utils;
      if (!utils?.hexToBytes || !utils?.bytesToHex || !utils?.hash160) {
        return this.hashCache.map;
      }

      const nextMap = new Map();
      for (const entry of entries) {
        const pubkeyBytes = utils.hexToBytes(entry.pubkey);
        const hashBytes = await utils.hash160(pubkeyBytes);
        const hashHex = utils.bytesToHex(hashBytes).toLowerCase();
        nextMap.set(hashHex, entry.address);

        const reversedHex = utils.bytesToHex(hashBytes.slice().reverse()).toLowerCase();
        if (!nextMap.has(reversedHex)) {
          nextMap.set(reversedHex, entry.address);
        }
      }

      if (nextMap.size > 0) {
        this.hashCache.map = nextMap;
        this.hashCache.updatedAt = Date.now();
      }

      return this.hashCache.map;
    })();

    try {
      return await this.hashCache.pending;
    } finally {
      this.hashCache.pending = null;
    }
  }
}
