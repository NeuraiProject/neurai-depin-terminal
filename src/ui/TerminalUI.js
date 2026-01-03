/**
 * Terminal UI for Neurai DePIN Terminal
 * Full-screen blessed-based interface with top bar, message area, input, and status bar
 * @module TerminalUI
 */

import blessed from 'blessed';
import {
  COLORS,
  ICONS,
  BLESSED_KEYS,
  ADDRESS,
  PRIVACY,
  TIME
} from '../constants.js';
import { formatTimestamp, resetTerminal } from '../utils.js';
import { TopBar } from './components/TopBar.js';
import { MessageBox } from './components/MessageBox.js';
import { InputBox } from './components/InputBox.js';
import { StatusBar } from './components/StatusBar.js';
import { ErrorOverlay } from './components/ErrorOverlay.js';
import { RecipientSelector } from './components/RecipientSelector.js';

/**
 * Terminal UI manager using blessed library
 */
export class TerminalUI {
  /**
   * Create a new TerminalUI instance
   * @param {Object} config - Configuration object
   * @param {string} config.rpc_url - RPC server URL
   * @param {string} config.token - DePIN token name
   * @param {WalletManager} walletManager - Wallet manager instance
   * @param {RpcService} rpcService - RPC service instance
   */
  constructor(config, walletManager, rpcService) {
    this.config = config;
    this.walletManager = walletManager;
    this.rpcService = rpcService;
    this.myAddress = walletManager.getAddress();
    this.sendCallback = null;
    this.displayedMessages = [];
    this.hasPrivacy = false;
    this.encryptionType = PRIVACY.DEFAULT_ENCRYPTION;
    this.totalMessages = 0;
    this.lastConnectionStatus = false;
    this.lastPollTime = null;
    this.recipientProvider = null;
    this.recipientCache = null;
    this.recipientLoadPromise = null;

    this.initializeScreen();
    this.createComponents();
    this.setupKeybindings();
    this.setupInputListeners();
    this.inputBox.focus();
    this.screen.render();
    this.updateTopBar({ connected: false, lastPoll: null });
  }

  /**
   * Initialize blessed screen
   */
  initializeScreen() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Neurai DePIN Terminal'
    });
  }

  /**
   * Create UI components (top bar, message box, input box, status bar)
   */
  createComponents() {
    this.topBar = new TopBar(this.screen, this.config, this.myAddress);
    this.messageBox = new MessageBox(this.screen);
    this.inputBox = new InputBox(this.screen, (msg) => this.handleSend(msg));
    this.statusBar = new StatusBar(this.screen);
    this.errorOverlay = new ErrorOverlay(this.screen);
    this.recipientSelector = new RecipientSelector(this.screen);

    this.inputBox.setShouldSend(() => !this.recipientSelector.isVisible());
    this.recipientSelector.onSelect((address) => this.applyRecipientSelection(address));
  }

  /**
   * Show blocking error overlay
   * @param {string[]} errors - List of error messages
   */
  showBlockingErrors(errors) {
    this.inputBox.disable();
    this.errorOverlay.show(errors);
  }

  /**
   * Clear blocking error overlay
   */
  clearBlockingErrors() {
    if (this.errorOverlay.isVisible()) {
      this.errorOverlay.hide();
      this.inputBox.enable();
      this.inputBox.focus();
    }
  }

  /**
   * Setup keyboard bindings
   */
  setupKeybindings() {
    // Exit on Ctrl+C or Escape
    this.screen.key(BLESSED_KEYS.QUIT, (ch, key) => {
      if (this.recipientSelector?.isVisible() && key?.name === 'escape') {
        this.closeRecipientSelector();
        return;
      }

      this.cleanup();
      process.exit(0);
    });
  }

  /**
   * Setup input listeners for private message recipient selection
   */
  setupInputListeners() {
    this.inputBox.component.on('keypress', () => {
      setTimeout(() => this.handleInputValueChange(), 0);
    });
  }

  /**
   * Set provider for private recipient list
   * @param {Function} provider - Async function returning array of addresses
   */
  setRecipientProvider(provider) {
    this.recipientProvider = provider;
  }

  async loadRecipientList() {
    if (!this.recipientProvider) {
      return [];
    }

    if (this.recipientCache) {
      return this.recipientCache;
    }

    if (this.recipientLoadPromise) {
      return this.recipientLoadPromise;
    }

    this.recipientLoadPromise = (async () => {
      const recipients = await this.recipientProvider();
      this.recipientCache = recipients;
      return recipients;
    })();

    try {
      return await this.recipientLoadPromise;
    } finally {
      this.recipientLoadPromise = null;
    }
  }

  handleInputValueChange() {
    const value = this.inputBox.component.getValue();

    if (value === '@') {
      this.openRecipientSelector();
      return;
    }

    if (this.recipientSelector.isVisible()) {
      this.closeRecipientSelector();
    }
  }

  async openRecipientSelector() {
    if (!this.recipientProvider || this.recipientSelector.isVisible()) {
      return;
    }

    this.inputBox.pauseInput();

    this.recipientSelector.setLoading();
    this.recipientSelector.show();

    try {
      const recipients = await this.loadRecipientList();
      this.recipientSelector.setItems(recipients);
    } catch (error) {
      this.recipientSelector.hide();
      this.updateSendStatus(`Failed to load recipients: ${error.message}`, 'error');
      this.inputBox.focus();
    }
  }

  closeRecipientSelector() {
    if (!this.recipientSelector.isVisible()) {
      return;
    }

    this.recipientSelector.hide();
    this.inputBox.resumeInput();
  }

  applyRecipientSelection(address) {
    if (!address) {
      return;
    }

    this.inputBox.component.setValue(`@${address} `);
    this.closeRecipientSelector();
    this.screen.render();
  }

  /**
   * Update top bar with connection status and info
   * @param {Object} status - Status object
   * @param {boolean} status.connected - Connection status
   * @param {Date|null} status.lastPoll - Last poll time
   */
  updateTopBar(status) {
    this.lastConnectionStatus = status.connected;

    if (status.lastPoll) {
      this.lastPollTime = status.lastPoll;
    }

    this.topBar.update({
      connected: status.connected,
      lastPoll: status.lastPoll
    });
  }

  /**
   * Format message line for display
   * @param {Object} msg - Message object
   * @returns {string} Formatted message line with blessed tags
   */
  formatMessageLine(msg) {
    const time = formatTimestamp(msg.timestamp, this.config.timezone);
    const isMe = msg.sender === this.myAddress;
    const senderLabel = isMe ? 'YOU' : msg.sender.slice(0, ADDRESS.TRUNCATE_LENGTH);
    const color = isMe ? COLORS.MY_MESSAGE : COLORS.OTHER_MESSAGE;

    return `{${color}}[${time}] ${senderLabel}: ${msg.message}{/}`;
  }

  /**
   * Add a new message to the display
   * Maintains chronological order (oldest to newest)
   * @param {Object} msg - Message object
   * @param {string} msg.sender - Sender address
   * @param {string} msg.message - Message content
   * @param {number} msg.timestamp - Unix timestamp in seconds
   * @param {string} msg.hash - Message hash
   */
  addMessage(msg) {
    this.displayedMessages.push(msg);

    // Sort by timestamp (oldest to newest)
    this.displayedMessages.sort((a, b) => a.timestamp - b.timestamp);

    // Redraw all messages
    this.redrawMessages();
  }

  /**
   * Redraw all messages in the message box
   */
  redrawMessages() {
    const formattedMessages = this.displayedMessages.map(msg => this.formatMessageLine(msg));
    // Clear and rebuild message box content
    this.messageBox.component.setContent(formattedMessages.join('\n'));
    this.messageBox.component.setScrollPerc(100);
    this.screen.render();
  }

  /**
   * Show error message in message box
   * @param {string} errorMsg - Error message
   */
  showError(errorMsg) {
    const line = `{${COLORS.ERROR}}[ERROR] ${errorMsg}{/}`;
    this.messageBox.addMessage(line);
  }

  /**
   * Show info message in message box
   * @param {string} infoMsg - Info message
   */
  showInfo(infoMsg) {
    const line = `{${COLORS.INFO}}[INFO] ${infoMsg}{/}`;
    this.messageBox.addMessage(line);
  }

  /**
   * Show success message in message box
   * @param {string} successMsg - Success message
   */
  showSuccess(successMsg) {
    const line = `{${COLORS.SUCCESS}}[${ICONS.SUCCESS}] ${successMsg}{/}`;
    this.messageBox.addMessage(line);
  }

  /**
   * Update status bar with send status
   * @param {string} message - Status message
   * @param {string} [type='info'] - Message type: 'success', 'error', or 'info'
   */
  updateSendStatus(message, type = 'info') {
    this.statusBar.update(message, type);
  }

  /**
   * Clear status bar
   */
  clearSendStatus() {
    this.statusBar.update('');
  }

  /**
   * Handle send message action
   * @param {string} message - Message to send
   */
  handleSend(message) {
    if (!message) return;

    if (this.sendCallback) {
      this.sendCallback(message);
    }
  }

  /**
   * Register callback for send action
   * @param {Function} callback - Callback function(message)
   */
  onSend(callback) {
    this.sendCallback = callback;
  }

  /**
   * Update pool information from depingetmsginfo RPC call
   * @param {Object} poolInfo - Pool information
   * @param {number} [poolInfo.messages] - Total messages in pool
   * @param {string} [poolInfo.cipher] - Encryption cipher name
   * @param {string} [poolInfo.depinpoolpkey] - Server privacy public key
   */
  updatePoolInfo(poolInfo) {
    if (poolInfo) {
      this.totalMessages = poolInfo.messages || 0;
      this.encryptionType = poolInfo.cipher || PRIVACY.DEFAULT_ENCRYPTION;
      this.hasPrivacy = poolInfo.depinpoolpkey && poolInfo.depinpoolpkey !== PRIVACY.NO_KEY_VALUE;
      
      this.topBar.setTotalMessages(this.totalMessages);
      this.topBar.setEncryptionType(this.encryptionType);
      
      // Refresh top bar
      this.updateTopBar({
        connected: this.lastConnectionStatus,
        lastPoll: this.lastPollTime
      });
    }
  }

  /**
   * Cleanup terminal state
   * Removes listeners, destroys screen, resets terminal
   */
  cleanup() {
    if (this.screen) {
      try {
        this.screen.destroy();
      } catch (err) {
        // Ignore cleanup errors
      }
      resetTerminal();
    }
  }
}
