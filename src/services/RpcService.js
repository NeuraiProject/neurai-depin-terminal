/**
 * RPC Service for Neurai DePIN Terminal
 * Handles RPC connection, initialization, and method calls
 * @module RpcService
 */

import neuraiJsWallet from '@neuraiproject/neurai-jswallet';
import {
  RPC,
  RPC_METHODS,
  WARNING_MESSAGES,
  SUCCESS_MESSAGES,
  ERROR_MESSAGES
} from '../constants.js';
import { RpcError } from '../errors.js';
import { formatRpcUrl } from '../utils.js';

const { Wallet } = neuraiJsWallet;

/**
 * Manages RPC connectivity and method calls
 */
export class RpcService {
  /**
   * Create a new RpcService instance
   * @param {Object} config - Configuration object
   * @param {string} config.network - Network name (xna)
   * @param {string} config.rpc_url - RPC server URL
   * @param {string} [config.rpc_username] - Optional RPC username
   * @param {string} [config.rpc_password] - Optional RPC password
   */
  constructor(config) {
    this.config = config;
    this.wallet = null;
    this.connected = false;
  }

  /**
   * Initialize RPC wallet client
   * Creates a wallet instance for RPC access
   * @returns {Promise<void>}
   */
  async initialize() {
    const rpcUrl = formatRpcUrl(this.config.rpc_url, RPC.ENDPOINT_SUFFIX);

    try {
      this.wallet = new Wallet();
      await this.wallet.init({
        mnemonic: RPC.DUMMY_MNEMONIC,
        network: this.config.network,
        rpc_url: rpcUrl,
        rpc_username: this.config.rpc_username || undefined,
        rpc_password: this.config.rpc_password || undefined,
        offlineMode: false,
        minAmountOfAddresses: 1
      });

      // Test connection
      await this.testConnection();
    } catch (error) {
      this.connected = false;
      this.wallet = null;
      console.warn(WARNING_MESSAGES.RPC_INIT_FAILED);
      console.warn(`   Error: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Test RPC connection by calling getblockchaininfo
   * @param {boolean} [silent=false] - If true, suppress console output
   * @returns {Promise<boolean>} True if connected, false otherwise
   */
  async testConnection(silent = false) {
    try {
      await this.wallet.rpc(RPC_METHODS.GET_BLOCKCHAIN_INFO, []);
      this.connected = true;
      if (!silent) console.log(SUCCESS_MESSAGES.RPC_CONNECTED);
      return true;
    } catch (error) {
      this.connected = false;
      if (!silent) console.warn(WARNING_MESSAGES.RPC_CONNECTION_FAILED);
      return false;
    }
  }

  /**
   * Execute an RPC method
   * @param {string} method - RPC method name
   * @param {Array} [params=[]] - RPC parameters
   * @returns {Promise<any>} RPC result
   * @throws {RpcError} If RPC call fails or not initialized
   */
  async call(method, params = []) {
    if (!this.wallet) {
      throw new RpcError(ERROR_MESSAGES.RPC_NOT_INITIALIZED);
    }
    try {
      const result = await this.wallet.rpc(method, params);
      this.connected = true;
      return result;
    } catch (error) {
      this.connected = false;
      throw new RpcError(error.message);
    }
  }

  /**
   * Verify if an address holds a specific token
   * @param {string} address - Address to check
   * @param {string} token - Token name
   * @returns {Promise<boolean>} True if address holds the token
   */
  async verifyTokenOwnership(address, token) {
    try {
      const result = await this.call(RPC_METHODS.LIST_ADDRESSES_BY_ASSET, [token]);
      // Result is an object where keys are addresses and values are balances
      return Object.prototype.hasOwnProperty.call(result, address) && result[address] > 0;
    } catch (error) {
      console.warn(`Failed to verify token ownership: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if the public key for an address is revealed on the blockchain
   * @param {string} address - Address to check
   * @returns {Promise<boolean>} True if public key is revealed
   */
  async checkPubKeyRevealed(address) {
    try {
      const result = await this.call(RPC_METHODS.GET_PUBKEY, [address]);
      return result && (result.revealed === 1 || result.revealed === true);
    } catch (error) {
      console.warn(`Failed to check pubkey: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if currently connected to RPC server
   * @returns {boolean} Connection status
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Attempt to reconnect to RPC server
   * Tries to reinitialize the wallet if not connected
   * @param {boolean} [silent=true] - If true, suppress console output
   * @returns {Promise<boolean>} True if reconnection successful, false otherwise
   */
  async attemptReconnect(silent = true) {
    // If already connected, no need to reconnect
    if (this.connected && this.wallet) {
      return true;
    }

    // If wallet exists, just test the connection
    if (this.wallet) {
      try {
        await this.wallet.rpc(RPC_METHODS.GET_BLOCKCHAIN_INFO, []);
        this.connected = true;
        return true;
      } catch (error) {
        this.connected = false;
      }
    }

    // Wallet doesn't exist or check failed, need to reinitialize RPC client
    try {
      const rpcUrl = formatRpcUrl(this.config.rpc_url, RPC.ENDPOINT_SUFFIX);

      this.wallet = new Wallet();
      await this.wallet.init({
        mnemonic: RPC.DUMMY_MNEMONIC,
        network: this.config.network,
        rpc_url: rpcUrl,
        rpc_username: this.config.rpc_username || undefined,
        rpc_password: this.config.rpc_password || undefined,
        offlineMode: false,
        minAmountOfAddresses: 1
      });

      // Test connection
      await this.wallet.rpc(RPC_METHODS.GET_BLOCKCHAIN_INFO, []);
      this.connected = true;

      if (!silent) {
        console.log('✓ Reconnected to RPC server');
      }

      return true;
    } catch (error) {
      this.connected = false;
      this.wallet = null;
      return false;
    }
  }
}
