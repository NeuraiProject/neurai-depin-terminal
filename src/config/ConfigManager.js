/**
 * Configuration manager for Neurai DePIN Terminal
 * Handles loading, creating, validating, and encrypting configuration
 * @module ConfigManager
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import crypto from 'crypto';
import {
  CONFIG,
  ENCRYPTION,
  PASSWORD,
  NETWORK,
  POLLING,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES
} from '../constants.js';
import { ConfigError, PasswordError, EncryptionError } from '../errors.js';
import { readPassword, validatePassword, isValidUrl, isValidTimezone, drainInput } from '../utils.js';

/**
 * Manages application configuration with encrypted private key storage
 */
export class ConfigManager {
  /**
   * Create a new ConfigManager instance
   */
  constructor() {
    this.configPath = path.join(process.cwd(), CONFIG.FILE_NAME);
    this.config = null;
  }

  /**
   * Encrypt private key using AES-256-GCM
   * @param {string} privateKey - Plain text private key in WIF format
   * @param {string} password - Password for encryption
   * @returns {Promise<string>} Encrypted data in format: salt:iv:authTag:encrypted (hex)
   * @throws {EncryptionError} If encryption fails
   */
  async encryptPrivateKey(privateKey, password) {
    try {
      const salt = crypto.randomBytes(ENCRYPTION.SALT_LENGTH);
      const key = await new Promise((resolve, reject) => {
        crypto.scrypt(
          password,
          salt,
          ENCRYPTION.KEY_LENGTH,
          {
            N: ENCRYPTION.SCRYPT_COST,
            r: ENCRYPTION.SCRYPT_BLOCK_SIZE,
            p: ENCRYPTION.SCRYPT_PARALLELIZATION
          },
          (err, derivedKey) => {
            if (err) reject(err);
            else resolve(derivedKey);
          }
        );
      });
      const iv = crypto.randomBytes(ENCRYPTION.IV_LENGTH);
      const cipher = crypto.createCipheriv(ENCRYPTION.ALGORITHM, key, iv);

      let encrypted = cipher.update(privateKey, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag();

      return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
      throw new EncryptionError(`Failed to encrypt private key: ${error.message}`);
    }
  }

  /**
   * Decrypt private key using AES-256-GCM
   * @param {string} encryptedData - Encrypted data in format: salt:iv:authTag:encrypted
   * @param {string} password - Password for decryption
   * @returns {Promise<string>} Decrypted private key in WIF format
   * @throws {EncryptionError} If decryption fails or password is incorrect
   */
  async decryptPrivateKey(encryptedData, password) {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 4) {
        throw new EncryptionError('Invalid encrypted data format');
      }

      const salt = Buffer.from(parts[0], 'hex');
      const iv = Buffer.from(parts[1], 'hex');
      const authTag = Buffer.from(parts[2], 'hex');
      const encrypted = parts[3];

      const key = await new Promise((resolve, reject) => {
        crypto.scrypt(
          password,
          salt,
          ENCRYPTION.KEY_LENGTH,
          {
            N: ENCRYPTION.SCRYPT_COST,
            r: ENCRYPTION.SCRYPT_BLOCK_SIZE,
            p: ENCRYPTION.SCRYPT_PARALLELIZATION
          },
          (err, derivedKey) => {
            if (err) reject(err);
            else resolve(derivedKey);
          }
        );
      });
      const decipher = crypto.createDecipheriv(ENCRYPTION.ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      if (error instanceof EncryptionError) {
        throw error;
      }
      throw new EncryptionError(ERROR_MESSAGES.INVALID_PASSWORD);
    }
  }

  /**
   * Prompt user for password with retry logic
   * @param {number} [maxAttempts=3] - Maximum number of attempts
   * @returns {Promise<string>} Decrypted private key
   * @throws {PasswordError} If max attempts exceeded
   */
  async promptForDecryption(maxAttempts = PASSWORD.MAX_ATTEMPTS) {
    console.log('\n🔐 Your private key is encrypted.');
    let decrypted = false;
    let attempts = 0;
    let privateKey = null;

    while (!decrypted && attempts < maxAttempts) {
      attempts++;
      const password = await readPassword('Enter password to decrypt private key: ');

      try {
        process.stdout.write('Verifying password...');
        privateKey = await this.decryptPrivateKey(this.config.privateKey, password);
        process.stdout.write('\r\x1b[K'); // Clear the "Verifying..." line
        decrypted = true;
        console.log('✓ Private key decrypted successfully\n');
      } catch (error) {
        process.stdout.write('\r\x1b[K'); // Clear the "Verifying..." line
        if (attempts < maxAttempts) {
          console.log(`✗ Incorrect password. ${maxAttempts - attempts} attempts remaining.\n`);
        } else {
          throw new PasswordError(ERROR_MESSAGES.MAX_ATTEMPTS_REACHED);
        }
      }
    }

    return privateKey;
  }

  /**
   * Prompt user to create and confirm a password
   * @returns {Promise<string>} Validated password
   */
  async promptForPasswordCreation() {
    console.log('\n🔐 To protect your private key, it will be encrypted with a password.');

    while (true) {
      const password = await readPassword(`Enter password (${PASSWORD.MIN_LENGTH}-${PASSWORD.MAX_LENGTH} characters): `);

      const validation = validatePassword(password, PASSWORD.MIN_LENGTH, PASSWORD.MAX_LENGTH);
      if (!validation.valid) {
        console.log(`✗ ${validation.error}\n`);
        continue;
      }

      const passwordConfirm = await readPassword('Confirm password: ');

      if (password !== passwordConfirm) {
        console.log(`✗ ${ERROR_MESSAGES.PASSWORDS_DONT_MATCH}\n`);
        continue;
      }

      return password;
    }
  }

  /**
   * Prompt user for input using readline
   * @param {readline.Interface} rl - Readline interface
   * @param {string} prompt - Prompt message
   * @returns {Promise<string>} User input
   */
  async promptInput(rl, prompt) {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  }

  /**
   * Load configuration from file or run wizard if not found
   * @returns {Promise<Object>} Configuration object
   * @throws {ConfigError} If config is invalid
   */
  async load() {
    if (!fs.existsSync(this.configPath)) {
      console.log('config.json not found. Let\'s create it.');
      await this.runWizard();
    }

    try {
      const configData = fs.readFileSync(this.configPath, 'utf-8');
      this.config = JSON.parse(configData);
    } catch (error) {
      throw new ConfigError(`Failed to load config: ${error.message}`);
    }

    // Decrypt private key
    this.config.privateKey = await this.promptForDecryption();

    this.validate();
    return this.config;
  }

  /**
   * Run interactive configuration wizard
   * @returns {Promise<void>}
   */
  async runWizard() {
    // Ensure input buffer is clean before starting wizard
    await drainInput(process.stdin);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('\n================================');
    console.log('Welcome to Neurai DePIN Client');
    console.log('================================\n');

    // Collect RPC server URL (required)
    let rpc_url = '';
    while (!rpc_url) {
      rpc_url = await this.promptInput(rl, 'RPC Server URL (e.g., https://rpc-depin.neurai.org): ');
      if (!rpc_url) {
        console.log('Error: RPC server is required');
      } else if (!isValidUrl(rpc_url)) {
        console.log('Error: Invalid URL format');
        rpc_url = '';
      }
    }

    // Collect optional RPC credentials
    const rpc_username = await this.promptInput(rl, 'RPC Username (optional, press Enter to skip): ') || '';
    const rpc_password = await this.promptInput(rl, 'RPC Password (optional, press Enter to skip): ') || '';

    // Collect token (required)
    let token = '';
    while (!token) {
      token = await this.promptInput(rl, 'DePIN Token (asset name): ');
      if (!token) {
        console.log('Error: Token is required');
      }
    }

    // Collect private key (required)
    let privateKey = '';
    while (!privateKey) {
      privateKey = await this.promptInput(rl, 'Private Key (WIF format): ');
      if (!privateKey) {
        console.log('Error: Private key is required');
      }
    }

    // Close readline before password input (uses raw mode)
    rl.close();

    // Get password and encrypt private key
    const password = await this.promptForPasswordCreation();
    process.stdout.write('Encrypting private key...');
    const encryptedPrivateKey = await this.encryptPrivateKey(privateKey, password);
    process.stdout.write('\r\x1b[K'); // Clear the "Encrypting..." line
    console.log('✓ Private key encrypted successfully\n');

    // Create new readline for remaining questions
    const rl2 = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const pollIntervalStr = await this.promptInput(
      rl2,
      `Polling interval in ms [${POLLING.DEFAULT_INTERVAL}]: `
    ) || String(POLLING.DEFAULT_INTERVAL);

    // Collect timezone (optional, default UTC)
    let timezone = '';
    while (!timezone) {
      const input = await this.promptInput(
        rl2,
        'Timezone offset (e.g., +1, -5, +5.5, UTC) [default: UTC]: '
      );

      const candidate = input || 'UTC';

      if (isValidTimezone(candidate)) {
        timezone = candidate;
      } else {
        console.log('Error: Invalid timezone. Please use numeric offset (e.g., +1, -5) or "UTC".');
      }
    }

    rl2.close();

    // Build configuration object
    const config = {
      rpc_url,
      rpc_username,
      rpc_password,
      token,
      privateKey: encryptedPrivateKey,
      network: NETWORK.DEFAULT,
      pollInterval: parseInt(pollIntervalStr, 10),
      timezone
    };

    // Save to file
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      console.log('Saving configuration to config.json...');
      console.log('✓ Configuration saved\n');
    } catch (error) {
      throw new ConfigError(`Failed to save config: ${error.message}`);
    }
  }

  /**
   * Validate configuration object
   * @throws {ConfigError} If validation fails
   */
  validate() {
    if (!this.config) {
      throw new ConfigError('Config not loaded');
    }

    if (!this.config.rpc_url) {
      throw new ConfigError('rpc_url is required in config.json');
    }

    if (!isValidUrl(this.config.rpc_url)) {
      throw new ConfigError(ERROR_MESSAGES.INVALID_RPC_URL);
    }

    if (!this.config.token) {
      throw new ConfigError('token is required in config.json');
    }

    if (!this.config.privateKey) {
      throw new ConfigError('privateKey is required in config.json');
    }

    // Force network to xna (mainnet only)
    this.config.network = NETWORK.DEFAULT;

    // Validate and adjust poll interval
    if (!this.config.pollInterval || this.config.pollInterval < POLLING.MIN_INTERVAL) {
      console.warn(`Warning: pollInterval too low, setting to ${POLLING.DEFAULT_INTERVAL}ms`);
      this.config.pollInterval = POLLING.DEFAULT_INTERVAL;
    }

    if (this.config.pollInterval > POLLING.MAX_INTERVAL) {
      console.warn(`Warning: pollInterval too high, setting to ${POLLING.MAX_INTERVAL}ms`);
      this.config.pollInterval = POLLING.MAX_INTERVAL;
    }
  }

  /**
   * Get the loaded configuration
   * @returns {Object} Configuration object
   */
  get() {
    return this.config;
  }
}
