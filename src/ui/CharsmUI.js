/**
 * Charsm-based Terminal UI for Neurai DePIN Terminal
 * @module CharsmUI
 */

import readline from 'node:readline';
import { initLip, Lipgloss } from 'charsm';
import { PRIVACY, TERMINAL } from '../constants.js';
import { TabManager } from './TabManager.js';
import { RecipientSelector } from './RecipientSelector.js';
import {
  formatMessageLine,
  padLine,
  renderHeaderLines,
  renderInputLine,
  renderRecipientOverlay,
  renderStatusLine,
  renderTabLines
} from './render.js';
import { resetTerminal } from '../utils.js';
import { MESSAGE_TYPES, normalizeMessageType } from '../domain/messageTypes.js';

const ANSI = {
  CLEAR: '\x1b[2J',
  HOME: '\x1b[H',
  HIDE_CURSOR: '\x1b[?25l',
  SHOW_CURSOR: '\x1b[?25h',
  RESET: '\x1b[0m'
};


export class CharsmUI {
  static async create(config, walletManager, rpcService) {
    try {
      // Reduce timeout to 500ms to avoid blocking startup
      await Promise.race([
        initLip(),
        new Promise((resolve) => setTimeout(resolve, 500))
      ]);
    } catch (error) {
      // If WASM init stalls or fails, proceed with basic rendering (no styles)
      console.warn(`Charsm init failed: ${error.message}`);
    }
    const ui = new CharsmUI(config, walletManager, rpcService);
    ui.initialize();
    return ui;
  }

  constructor(config, walletManager, rpcService) {
    this.config = config;
    this.walletManager = walletManager;
    this.rpcService = rpcService;
    this.myAddress = walletManager.getAddress();

    this.lip = new Lipgloss();
    this.stylesInitialized = false;

    this.displayedMessages = [];
    this.tabManager = new TabManager();

    this.recipientProvider = null;
    this.recipientCacheProvider = null;
    this.recipientSelector = new RecipientSelector();

    this.inputValue = '';
    this.scrollOffset = 0;
    this.statusMessage = '';
    this.statusType = 'info';
    this.blockingErrors = [];
    this.inputDisabled = false;

    this.totalMessages = 0;
    this.messageExpiryHours = 0;
    this.encryptionType = PRIVACY.DEFAULT_ENCRYPTION;
    this.lastConnectionStatus = false;
    this.lastPollTime = null;

    this.sendCallback = null;
    this.keypressHandler = null;
    this.resizeHandler = null;
    this.keypressEventsInitialized = false;

    // Rendering optimization
    this.renderScheduled = false;
    this.renderImmediate = false;
  }

  initialize() {
    this.createStyles();
    this.tabManager.initialize();
    this.setupInput();
    this.render();
  }

  createStyles() {
    if (this.stylesInitialized) {
      return;
    }

    try {
      this.lip.createStyle({
        id: 'header',
        canvasColor: { color: '#ffffff', background: '#1d4ed8' },
        bold: true
      });
      this.lip.createStyle({
        id: 'tabActive',
        canvasColor: { color: '#22c55e' },
        bold: true
      });
      this.lip.createStyle({
        id: 'tabInactive',
        canvasColor: { color: '#94a3b8' }
      });
      this.lip.createStyle({
        id: 'msgMe',
        canvasColor: { color: '#22d3ee' }
      });
      this.lip.createStyle({
        id: 'msgOther',
        canvasColor: { color: '#22c55e' }
      });
      this.lip.createStyle({
        id: 'msgInfo',
        canvasColor: { color: '#facc15' }
      });
      this.lip.createStyle({
        id: 'msgSuccess',
        canvasColor: { color: '#22c55e' }
      });
      this.lip.createStyle({
        id: 'msgError',
        canvasColor: { color: '#ef4444' }
      });
      this.lip.createStyle({
        id: 'statusInfo',
        canvasColor: { color: '#facc15' }
      });
      this.lip.createStyle({
        id: 'statusSuccess',
        canvasColor: { color: '#22c55e' }
      });
      this.lip.createStyle({
        id: 'statusError',
        canvasColor: { color: '#ef4444' }
      });
    } catch (error) {
      // If styles cannot be created (init failure), render without styles
    }

    this.stylesInitialized = true;
  }

  applyStyle(value, id) {
    if (!this.stylesInitialized || !id) {
      return value;
    }

    try {
      return this.lip.apply({ value, id });
    } catch (error) {
      return value;
    }
  }

  setupInput() {
    // Only call emitKeypressEvents once to prevent duplicate listeners
    if (!this.keypressEventsInitialized) {
      readline.emitKeypressEvents(process.stdin);
      this.keypressEventsInitialized = true;
    }

    if (process.stdin.isTTY) {
      process.stdin.setEncoding('utf8');
      process.stdin.setRawMode(true);
    }

    this.keypressHandler = (str, key) => this.handleKeypress(str, key);
    process.stdin.on('keypress', this.keypressHandler);
    this.resizeHandler = () => this.scheduleRender();
    process.stdout.on('resize', this.resizeHandler);
    process.stdin.resume();
    if (process.stdout.isTTY) {
      process.stdout.write(`${TERMINAL.ENTER_ALT_SCREEN}${ANSI.CLEAR}${ANSI.HOME}`);
    }
    process.stdout.write(ANSI.HIDE_CURSOR);
  }

  cleanup() {
    if (this.keypressHandler) {
      process.stdin.off('keypress', this.keypressHandler);
      this.keypressHandler = null;
    }
    process.stdin.removeAllListeners('keypress'); // Remove keypress specifically
    if (this.resizeHandler) {
      process.stdout.off('resize', this.resizeHandler);
      this.resizeHandler = null;
    }

    // Use the comprehensive reset function from utils
    resetTerminal();
  }

  setRecipientProvider(provider, cacheProvider = null) {
    this.recipientProvider = provider;
    this.recipientCacheProvider = cacheProvider;
  }

  getActivePeerAddress() {
    return this.tabManager.getActivePeerAddress();
  }

  setActiveTab(tabId) {
    if (!this.tabManager.setActiveTab(tabId)) {
      return;
    }
    this.scheduleRender();
  }

  activateNextTab() {
    if (!this.tabManager.activateNextTab()) {
      return;
    }
    this.scheduleRender();
  }

  activatePrevTab() {
    if (!this.tabManager.activatePrevTab()) {
      return;
    }
    this.scheduleRender();
  }

  closeActiveTab() {
    if (!this.tabManager.closeActiveTab()) {
      return;
    }
    this.scheduleRender();
  }

  openPrivateTab(address, activate = false, timestamp = null) {
    const tab = this.tabManager.openPrivateTab(address, activate, timestamp);
    if (tab) {
      this.scheduleRender();
    }
    return tab;
  }

  async loadRecipientList() {
    if (!this.recipientProvider) {
      return [];
    }
    return this.recipientProvider();
  }

  async openRecipientSelector() {
    if (!this.recipientProvider || this.recipientSelector.isOpen()) {
      return;
    }

    const cached = this.recipientCacheProvider ? this.recipientCacheProvider() : [];
    await this.recipientSelector.openSelector({
      cachedItems: cached,
      loadItems: () => this.loadRecipientList(),
      onUpdate: () => this.scheduleRender(),
      onError: (error) => {
        this.updateSendStatus(`Failed to load recipients: ${error.message}`, 'error');
      }
    });
  }

  closeRecipientSelector() {
    if (!this.recipientSelector.isOpen()) {
      return;
    }
    this.recipientSelector.close();
    this.scheduleRender();
  }

  applyRecipientSelection(address) {
    if (!address) {
      return;
    }
    this.inputValue = `@${address} `;
    this.closeRecipientSelector();
    this.scheduleRender();
  }

  ensureInputReady() {
    if (!process.stdin.isTTY) {
      return;
    }
    try {
      process.stdin.setRawMode(true);
      process.stdin.resume();
    } catch (error) {
      // Ignore
    }
  }

  handleKeypress(str, key) {
    // Check for Ctrl+C or ESC
    if ((key && key.ctrl && key.name === 'c') || (key && key.name === 'escape' && !this.recipientSelector.isOpen())) {
      this.cleanup();
      process.exit(0);
    }

    if (this.inputDisabled) {
      return;
    }

    if (this.recipientSelector.isOpen()) {
      this.handleRecipientKeypress(key);
      return;
    }

    if (key && key.ctrl && key.name === 'left') {
      this.activatePrevTab();
      return;
    }
    if (key && key.ctrl && key.name === 'right') {
      this.activateNextTab();
      return;
    }
    if (key && key.ctrl && key.name === 'w') {
      this.closeActiveTab();
      return;
    }

    if (key && key.name === 'up') {
      this.scrollUp();
      return;
    }
    if (key && key.name === 'down') {
      this.scrollDown();
      return;
    }

    if (key && key.name === 'return') {
      this.submitInput();
      return;
    }

    if (key && key.name === 'backspace') {
      if (this.inputValue.length > 0) {
        this.inputValue = this.inputValue.slice(0, -1);
        this.scheduleRender();
      }
      return;
    }

    if (!key.ctrl && !key.meta && str) {
      this.ensureInputReady();
      this.inputValue += str;
      if (this.inputValue === '@') {
        this.openRecipientSelector();
        return;
      }
      this.scheduleRender();
    }
  }

  handleRecipientKeypress(key) {
    const action = this.recipientSelector.handleKeypress(key);
    if (action.action === 'close') {
      this.closeRecipientSelector();
      return;
    }
    if (action.action === 'select') {
      this.applyRecipientSelection(action.address);
      return;
    }
    if (action.action === 'update') {
      this.scheduleRender();
    }
  }

  submitInput() {
    const trimmed = this.inputValue.trim();
    if (!trimmed) {
      return;
    }

    let outgoing = trimmed;
    if (!trimmed.startsWith('@')) {
      const peerAddress = this.getActivePeerAddress();
      if (peerAddress) {
        outgoing = `@${peerAddress} ${trimmed}`;
      }
    }

    this.inputValue = '';
    this.scrollOffset = 0;
    this.scheduleRender();

    if (this.sendCallback) {
      this.sendCallback(outgoing);
    }
  }

  scrollUp() {
    this.scrollOffset += 1;
    this.scheduleRender();
  }

  scrollDown() {
    if (this.scrollOffset > 0) {
      this.scrollOffset -= 1;
      this.scheduleRender();
    }
  }

  renderHeaderLines() {
    return renderHeaderLines({
      config: this.config,
      myAddress: this.myAddress,
      totalMessages: this.totalMessages,
      messageExpiryHours: this.messageExpiryHours,
      encryptionType: this.encryptionType,
      lastConnectionStatus: this.lastConnectionStatus,
      lastPollTime: this.lastPollTime
    });
  }

  renderTabLines() {
    return renderTabLines({
      tabs: this.tabManager.getTabs(),
      activeTabId: this.tabManager.getActiveTabId(),
      applyStyle: this.applyStyle.bind(this)
    });
  }

  formatMessageLine(msg) {
    return formatMessageLine(msg, {
      config: this.config,
      myAddress: this.myAddress,
      applyStyle: this.applyStyle.bind(this)
    });
  }

  getFilteredMessages() {
    const activePeer = this.getActivePeerAddress();
    const activeTabId = this.tabManager.getActiveTabId();
    return this.displayedMessages.filter((msg) => {
      const type = normalizeMessageType(msg.messageType || msg.message_type);
      if (activeTabId === MESSAGE_TYPES.GROUP) {
        return type === MESSAGE_TYPES.GROUP;
      }
      return type === MESSAGE_TYPES.PRIVATE && msg.peerAddress === activePeer;
    });
  }

  renderRecipientOverlay(availableHeight, width) {
    return renderRecipientOverlay({
      availableHeight,
      width,
      selector: this.recipientSelector
    });
  }

  renderMessageLines(availableHeight, width) {
    const lines = [];

    if (this.blockingErrors.length > 0) {
      lines.push('*** BLOCKED ***');
      this.blockingErrors.forEach((err) => lines.push(err));
      return lines.slice(0, availableHeight);
    }

    if (this.recipientSelector.isOpen()) {
      return this.renderRecipientOverlay(availableHeight, width);
    }

    const filtered = this.getFilteredMessages();
    const formatted = filtered.map((msg) => this.formatMessageLine(msg));
    const total = formatted.length;
    const visible = Math.max(availableHeight, 0);
    const maxOffset = Math.max(total - visible, 0);
    if (this.scrollOffset > maxOffset) {
      this.scrollOffset = maxOffset;
    }
    const start = Math.max(total - visible - this.scrollOffset, 0);
    const end = Math.min(start + visible, total);
    return formatted.slice(start, end);
  }

  renderInputLine() {
    return renderInputLine(this.inputValue);
  }

  renderStatusLine() {
    return renderStatusLine(this.statusMessage, this.statusType, this.applyStyle.bind(this));
  }

  /**
   * Schedule a render to happen on the next tick (non-blocking)
   * Use this for non-critical updates like typing, scrolling
   */
  scheduleRender() {
    if (this.renderScheduled) {
      return;
    }
    this.renderScheduled = true;
    setImmediate(() => {
      this.renderScheduled = false;
      this.renderNow();
    });
  }

  /**
   * Force an immediate render (blocking)
   * Use this sparingly for critical updates like new messages, errors
   */
  renderNow() {
    this.render();
  }

  render() {
    const rows = process.stdout.rows || 24;
    const cols = process.stdout.columns || 80;
    const innerWidth = Math.max(cols - 2, 10);
    const headerLines = this.renderHeaderLines();
    const tabRender = this.renderTabLines();
    const tabLines = tabRender.lines;
    const footerLines = 4; // input top + input + input bottom + status
    const frameLines = 2; // top + bottom border
    const dividerLines = 1;
    const headerDividerLines = 1;
    const messageHeight = Math.max(
      rows - frameLines - headerLines.length - headerDividerLines - tabLines.length - dividerLines - footerLines,
      1
    );

    const messageLines = this.renderMessageLines(messageHeight, innerWidth);
    const paddedMessages = [...messageLines];
    while (paddedMessages.length < messageHeight) {
      paddedMessages.push('');
    }

    const borderTop = `┌${'─'.repeat(innerWidth)}┐`;
    const borderBottom = `└${'─'.repeat(innerWidth)}┘`;
    const standardDivider = `├${'─'.repeat(innerWidth)}┤`;
    const tabDividerInner = Array.from('─'.repeat(innerWidth));
    if (tabRender.activeRange) {
      const start = Math.max(0, Math.min(innerWidth - 1, tabRender.activeRange.start));
      const end = Math.max(0, Math.min(innerWidth - 1, tabRender.activeRange.end));
      for (let i = start; i <= end; i += 1) {
        tabDividerInner[i] = ' ';
      }
    }
    const tabDivider = `├${tabDividerInner.join('')}┤`;
    const headerDivider = `├${'─'.repeat(innerWidth)}┤`;
    const inputTop = standardDivider;
    const inputBottom = standardDivider;

    const outputLines = [
      borderTop,
      ...headerLines.map((line) => {
        const padded = padLine(line, innerWidth);
        return `│${this.applyStyle(padded, 'header')}│`;
      }),
      headerDivider,
      ...tabLines.map((line) => `│${padLine(line, innerWidth)}│`),
      tabDivider,
      ...paddedMessages.map((line) => `│${padLine(line, innerWidth)}│`),
      inputTop,
      `│${padLine(this.renderInputLine(), innerWidth)}│`,
      inputBottom,
      `│${padLine(this.renderStatusLine(), innerWidth)}│`,
      borderBottom
    ];

    const output = outputLines.join('\n');
    process.stdout.write(`${ANSI.CLEAR}${ANSI.HOME}${output}`);

    const inputRow = 1 + headerLines.length + headerDividerLines + tabLines.length + dividerLines + messageHeight + 2;
    const cursorCol = Math.min(
      2 + 2 + this.inputValue.length,
      (process.stdout.columns || 80) - 1
    );
    process.stdout.write(`\x1b[${inputRow};${cursorCol}H${ANSI.SHOW_CURSOR}`);
  }

  updateTopBar(status) {
    this.lastConnectionStatus = status.connected;
    if (status.lastPoll) {
      this.lastPollTime = status.lastPoll;
    }
    this.scheduleRender();
  }

  updatePoolInfo(poolInfo) {
    if (poolInfo) {
      this.totalMessages = poolInfo.messages || 0;
      this.messageExpiryHours = poolInfo.messageexpiryhours || 0;
      this.encryptionType = poolInfo.cipher || PRIVACY.DEFAULT_ENCRYPTION;
      this.scheduleRender();
    }
  }

  addMessage(msg) {
    const messageType = normalizeMessageType(msg.messageType || msg.message_type);
    let peerAddress = msg.peerAddress || null;

    if (messageType === MESSAGE_TYPES.PRIVATE && !peerAddress) {
      if (msg.sender && msg.sender !== this.myAddress) {
        peerAddress = msg.sender;
      }
    }

    if (messageType === MESSAGE_TYPES.PRIVATE) {
      const tab = this.tabManager.openPrivateTab(peerAddress, false, msg.timestamp);
      if (tab && this.tabManager.getActiveTabId() !== tab.id) {
        this.tabManager.markUnread(tab.id);
      }
    }

    if (messageType === MESSAGE_TYPES.GROUP) {
      this.tabManager.markGroupUnread();
    }

    this.displayedMessages.push({
      ...msg,
      messageType,
      peerAddress
    });

    this.displayedMessages.sort((a, b) => a.timestamp - b.timestamp);
    this.renderNow();
  }

  addSystemMessage(type, message) {
    const hash = `sys-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.addMessage({
      sender: 'SYSTEM',
      message: `[${type.toUpperCase()}] ${message}`,
      timestamp: Math.floor(Date.now() / 1000),
      hash: hash,
      signature: '',
      messageType: MESSAGE_TYPES.GROUP,
      isSystem: true,
      systemType: type
    });
    return hash;
  }

  removeMessage(hash) {
    this.displayedMessages = this.displayedMessages.filter(m => m.hash !== hash);
    this.scheduleRender();
  }

  showError(errorMsg) {
    return this.addSystemMessage('error', errorMsg);
  }

  showInfo(infoMsg) {
    return this.addSystemMessage('info', infoMsg);
  }

  showSuccess(successMsg) {
    return this.addSystemMessage('success', successMsg);
  }

  updateSendStatus(message, type = 'info') {
    this.statusMessage = message || '';
    this.statusType = type;
    this.scheduleRender();
  }

  clearSendStatus() {
    this.statusMessage = '';
    this.scheduleRender();
  }

  showBlockingErrors(errors) {
    this.blockingErrors = errors || [];
    this.inputDisabled = true;
    this.renderNow();
  }

  clearBlockingErrors() {
    this.blockingErrors = [];
    this.inputDisabled = false;
    this.renderNow();
  }

  onSend(callback) {
    this.sendCallback = callback;
  }
}
