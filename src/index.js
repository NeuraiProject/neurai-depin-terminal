#!/usr/bin/env node

/**
 * Neurai DePIN Terminal - Main Entry Point
 * A command-line terminal interface for sending and receiving DePIN messages
 * @module index
 */

import { ConfigManager } from './config/ConfigManager.js';
import { loadDepinMsgLibrary } from './lib/depinMsgLoader.js';
import { WalletManager } from './wallet/WalletManager.js';
import { RpcService } from './services/RpcService.js';
import { MessageStore } from './messaging/MessageStore.js';
import { MessagePoller } from './messaging/MessagePoller.js';
import { MessageSender } from './messaging/MessageSender.js';
import { RecipientDirectory } from './messaging/RecipientDirectory.js';
import { CharsmUI } from './ui/CharsmUI.js';
import {
  INFO_MESSAGES,
  SUCCESS_MESSAGES,
  ERROR_MESSAGES,
  WARNING_MESSAGES,
  MESSAGE,
  RECIPIENT_CACHE,
  HASH,
  ICONS
} from './constants.js';
import { extractErrorMessage, isKnownError, isDebugMode } from './errors.js';
import { MESSAGE_TYPES } from './domain/messageTypes.js';
import { emergencyTerminalCleanup } from './utils.js';

/**
 * Global UI instance for cleanup on exit
 * @type {CharsmUI|null}
 */
let uiInstance = null;

/**
 * Initialize configuration
 * @returns {Promise<Object>} Configuration object
 */
async function initializeConfig() {
  console.log(INFO_MESSAGES.LOADING_CONFIG);
  const configManager = new ConfigManager();
  const config = await configManager.load();
  console.log(SUCCESS_MESSAGES.CONFIG_LOADED);
  console.log('');
  return config;
}

/**
 * Load DePIN library
 * @returns {Promise<Object>} DePIN library instance
 */
async function initializeLibrary() {
  console.log(INFO_MESSAGES.LOADING_LIBRARY);
  const neuraiDepinMsg = await loadDepinMsgLibrary();
  console.log(SUCCESS_MESSAGES.LIBRARY_LOADED);
  console.log('');
  return neuraiDepinMsg;
}

/**
 * Initialize wallet (keys only)
 * @param {Object} config - Configuration object
 * @returns {Promise<WalletManager>} Wallet manager instance
 */
async function initializeWallet(config) {
  console.log(INFO_MESSAGES.INITIALIZING_WALLET);
  const walletManager = new WalletManager(config);
  await walletManager.initialize();
  console.log('');
  return walletManager;
}

/**
 * Initialize RPC service
 * @param {Object} config - Configuration object
 * @returns {Promise<RpcService>} RPC service instance
 */
async function initializeRpc(config) {
  console.log(INFO_MESSAGES.CONNECTING);
  const rpcService = new RpcService(config);
  await rpcService.initialize();
  console.log('');
  return rpcService;
}

/**
 * Initialize messaging components
 * @param {Object} config - Configuration object
 * @param {WalletManager} walletManager - Wallet manager instance
 * @param {RpcService} rpcService - RPC service instance
 * @param {Object} neuraiDepinMsg - DePIN library instance
 * @returns {Object} Messaging components (store, poller, sender)
 */
function initializeMessaging(config, walletManager, rpcService, neuraiDepinMsg) {
  const recipientDirectory = new RecipientDirectory(config, rpcService, neuraiDepinMsg);
  const messageStore = new MessageStore();
  const messagePoller = new MessagePoller(
    config,
    rpcService,
    messageStore,
    neuraiDepinMsg,
    walletManager,
    recipientDirectory
  );
  const messageSender = new MessageSender(
    config,
    walletManager,
    rpcService,
    neuraiDepinMsg,
    recipientDirectory
  );

  return { messageStore, messagePoller, messageSender, recipientDirectory };
}

/**
 * Connect poller events to UI
 * @param {MessagePoller} messagePoller - Message poller instance
 * @param {CharsmUI} ui - Terminal UI instance
 * @param {RpcService} rpcService - RPC service instance
 */
function connectPollerToUI(messagePoller, ui, rpcService, onRpcDown) {
  const onMessage = (msg) => {
    ui.addMessage(msg);
  };

  const onPollComplete = (status) => {
    // Update pool info if available
    if (status.poolInfo) {
      ui.updatePoolInfo(status.poolInfo);
    }

    ui.updateTopBar({
      connected: rpcService.isConnected(),
      lastPoll: status.date
    });

    // Clear error status if connection is successful
    if (rpcService.isConnected()) {
      ui.clearSendStatus();
    }
  };

  const onError = (error) => {
    const errorMsg = extractErrorMessage(error, 'Connection error');

    ui.updateSendStatus(`Polling error: ${errorMsg}`, 'error');
    ui.updateTopBar({
      connected: false,
      lastPoll: new Date()
    });

    // Stop polling while disconnected and delegate retry scheduling
    messagePoller.stop();
    if (typeof onRpcDown === 'function') {
      onRpcDown(error);
    }
  };

  const onReconnected = () => {
    ui.showSuccess('Reconnected to RPC server!');
    ui.updateSendStatus('Connected to server', 'success');
  };

  messagePoller.on('message', onMessage);
  messagePoller.on('poll-complete', onPollComplete);
  messagePoller.on('error', onError);
  messagePoller.on('reconnected', onReconnected);

  return () => {
    messagePoller.off('message', onMessage);
    messagePoller.off('poll-complete', onPollComplete);
    messagePoller.off('error', onError);
    messagePoller.off('reconnected', onReconnected);
  };
}

/**
 * Connect UI send action to message sender
 * @param {CharsmUI} ui - Terminal UI instance
 * @param {MessageSender} messageSender - Message sender instance
 * @param {MessagePoller} messagePoller - Message poller instance
 */
function connectSenderToUI(ui, messageSender, getMessageStore, getMessagePoller) {
  ui.onSend(async (message) => {
    ui.updateSendStatus(INFO_MESSAGES.SENDING, 'info');

    try {
      const result = await messageSender.send(message);
      const hashPreview = result.hash
        ? `${result.hash.slice(0, HASH.DISPLAY_LENGTH)}...`
        : 'N/A';

      if (result.messageType === MESSAGE_TYPES.PRIVATE && result.messageHash && result.recipientAddress) {
        const store = getMessageStore();
        if (store) {
          store.registerOutgoingPrivateMessage(result.messageHash, result.recipientAddress);
        }
        ui.openPrivateTab(result.recipientAddress, true);
      }

      if (result.messageType === MESSAGE_TYPES.PRIVATE) {
        ui.updateSendStatus(
          `Private message sent to ${result.recipientAddress}. Hash: ${hashPreview}`,
          'success'
        );
      } else {
        ui.updateSendStatus(
          `Message sent to ${result.recipients} recipients. Hash: ${hashPreview}`,
          'success'
        );
      }

      // Force a poll after sending to see the message
      setTimeout(() => {
        const poller = getMessagePoller();
        if (poller) {
          poller.poll();
        }
      }, MESSAGE.FORCE_POLL_DELAY);
    } catch (error) {
      const errorMsg = extractErrorMessage(error);
      ui.updateSendStatus(`Error: ${errorMsg}`, 'error');
    }
  });
}

/**
 * Perform initial connection check and update UI
 * @param {RpcService} rpcService - RPC service instance
 * @param {CharsmUI} ui - Terminal UI instance
 */
async function performInitialConnectionCheck(rpcService, ui) {
  if (rpcService.isConnected()) {
    try {
      const poolInfo = await rpcService.call('depingetmsginfo', []);
      ui.updatePoolInfo(poolInfo);
      ui.updateTopBar({
        connected: true,
        lastPoll: null
      });
      ui.showSuccess(SUCCESS_MESSAGES.CONNECTED);
    } catch (error) {
      // Pool info check failed, continue without it
      ui.updateTopBar({
        connected: false,
        lastPoll: null
      });
      ui.updateSendStatus('Connecting to server...', 'info');
    }
  } else {
    // Not connected initially
    ui.updateTopBar({
      connected: false,
      lastPoll: null
    });
    ui.showInfo(INFO_MESSAGES.CONNECTING);
    ui.updateSendStatus(INFO_MESSAGES.RECONNECTING, 'error');
  }
}

/**
 * Start verification loop for Token and PubKey
 * @param {RpcService} rpcService - RPC service
 * @param {WalletManager} walletManager - Wallet manager
 * @param {Object} config - Configuration
 * @param {CharsmUI} ui - UI instance
 * @param {MessagePoller} messagePoller - Message poller instance
 */
function startVerificationLoop(rpcService, walletManager, config, ui, getMessagePoller, resetMessagingAfterReconnect) {
  const RETRY_MS = 30000;
  let timeoutId = null;
  let hadBlockingErrors = false;

  const scheduleNext = (ms) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      verify();
    }, ms);
  };

  const verify = async () => {
    const errors = [];
    const address = walletManager.getAddress();

    const messagePoller = getMessagePoller();

    // 1. Check / (re)connect RPC
    // Only happens when this verification runs (aligned with overlay countdown).
    let isConnected = false;
    if (!rpcService.isConnected()) {
      isConnected = await rpcService.attemptReconnect(true);
    } else {
      isConnected = await rpcService.testConnection(true);
    }

    if (!isConnected) {
      errors.push('RPC: Unable to connect to RPC server or Node.');
      if (messagePoller) {
        messagePoller.wasDisconnected = true;
      }
    } else {
      try {
        // 2. Verify Token
        const hasToken = await rpcService.verifyTokenOwnership(address, config.token);
        if (!hasToken) {
          errors.push(`Token: You do not have the configured token (${config.token}).`);
        }

        // 3. Verify Public Key
        const isRevealed = await rpcService.checkPubKeyRevealed(address);
        if (!isRevealed) {
          errors.push('PubKey: Not available on the blockchain.');
        }
      } catch (err) {
        // If verification fails due to RPC error
        errors.push(`RPC: Error verifying data (${err.message})`);
      }
    }

    // Update UI
    if (errors.length > 0) {
      hadBlockingErrors = true;
      ui.showBlockingErrors(errors);
      if (messagePoller) {
        messagePoller.stop();
      }
      scheduleNext(RETRY_MS);
    } else {
      const shouldFullSync = hadBlockingErrors;
      hadBlockingErrors = false;
      ui.clearBlockingErrors();

      if (shouldFullSync && typeof resetMessagingAfterReconnect === 'function') {
        await resetMessagingAfterReconnect();
      } else if (messagePoller) {
        messagePoller.start();
        try {
          await messagePoller.poll();
        } catch (e) {
          // Poller error handler will surface this and reschedule.
        }
      }

      scheduleNext(RETRY_MS);
    }
  };

  const notifyRpcDown = () => {
    // Start a fresh 30s countdown and retry schedule
    hadBlockingErrors = true;
    ui.showBlockingErrors(['RPC: Unable to connect to RPC server or Node.']);
    const messagePoller = getMessagePoller();
    if (messagePoller) {
      messagePoller.wasDisconnected = true;
      messagePoller.stop();
    }
    scheduleNext(RETRY_MS);
  };

  const start = () => {
    verify();
  };

  return { notifyRpcDown, start };
}

/**
 * Main application entry point
 * Orchestrates initialization and starts the application
 */
async function main() {
  try {
    // Emergency cleanup to ensure terminal is in a clean state
    emergencyTerminalCleanup();

    console.log('Neurai DePIN Terminal');
    console.log('=====================\n');

    // 1. Load configuration
    const config = await initializeConfig();

    // Comprehensive stdin cleanup after password prompt
    if (process.stdin.isTTY) {
      process.stdin.removeAllListeners('data');
      process.stdin.removeAllListeners('keypress');
      process.stdin.setRawMode(false);
      process.stdin.pause();

      // Flush any pending data in buffer
      if (process.stdin.readableLength > 0) {
        process.stdin.read();
      }

      // Wait one tick for everything to stabilize
      await new Promise(resolve => setImmediate(resolve));
    }

    // 2. Load DePIN library
    const neuraiDepinMsg = await initializeLibrary();

    // 3. Initialize wallet
    const walletManager = await initializeWallet(config);

    // 4. Initialize RPC
    const rpcService = await initializeRpc(config);

    // 5. Initialize messaging components
    const { messageStore, messagePoller, messageSender, recipientDirectory } = initializeMessaging(
      config,
      walletManager,
      rpcService,
      neuraiDepinMsg
    );

    // Mutable messaging refs to allow reset on reconnect
    const messaging = {
      messageStore,
      messagePoller,
      messageSender,
      recipientDirectory,
      detachPollerUi: null,
      recipientRefreshInterval: null
    };

    const refreshRecipientCache = async (force = false) => {
      try {
        await messaging.messageSender.refreshRecipientCache(force);
      } catch (error) {
        // Non-fatal: keep existing cache if any
      }
    };

    // 6. Initialize UI
    console.log(INFO_MESSAGES.STARTING_UI);
    console.log('');
  const ui = await CharsmUI.create(config, walletManager, rpcService);
    uiInstance = ui;
    ui.setRecipientProvider(
      () => messaging.messageSender.getPrivateRecipientAddresses(),
      () => messaging.messageSender.getCachedPrivateRecipientAddresses()
    );

    // 7. Get initial pool info and check connection
    await performInitialConnectionCheck(rpcService, ui);
    refreshRecipientCache(true);
    messaging.recipientRefreshInterval = setInterval(
      () => refreshRecipientCache(true),
      RECIPIENT_CACHE.REFRESH_MS
    );

    let onRpcDownHandler = null;

    const attachCurrentPollerToUI = () => {
      if (messaging.detachPollerUi) {
        messaging.detachPollerUi();
        messaging.detachPollerUi = null;
      }
      messaging.detachPollerUi = connectPollerToUI(
        messaging.messagePoller,
        ui,
        rpcService,
        (err) => {
          if (typeof onRpcDownHandler === 'function') {
            onRpcDownHandler(err);
          }
        }
      );
    };

    const resetMessagingAfterReconnect = async () => {
      // Make reconnection behave like initial startup: new store + new poller + listeners.
      if (messaging.detachPollerUi) {
        messaging.detachPollerUi();
        messaging.detachPollerUi = null;
      }
      if (messaging.messagePoller) {
        messaging.messagePoller.stop();
        messaging.messagePoller.removeAllListeners();
      }

      messaging.messageStore = new MessageStore();
      messaging.messagePoller = new MessagePoller(
        config,
        rpcService,
        messaging.messageStore,
        neuraiDepinMsg,
        walletManager,
        messaging.recipientDirectory
      );

      // Mark as disconnected so the first poll is a full sync
      messaging.messagePoller.wasDisconnected = true;

      attachCurrentPollerToUI();

      // Refresh pool info like at startup
      await performInitialConnectionCheck(rpcService, ui);

      await refreshRecipientCache(true);
      messaging.messagePoller.start();
      await messaging.messagePoller.poll();
    };

    const getMessagePoller = () => messaging.messagePoller;
    const getMessageStore = () => messaging.messageStore;

    // 8. Create verification loop (Single retry mechanism)
    const verification = startVerificationLoop(
      rpcService,
      walletManager,
      config,
      ui,
      getMessagePoller,
      resetMessagingAfterReconnect
    );
    onRpcDownHandler = verification.notifyRpcDown;

    // 9. Connect poller events to UI
    attachCurrentPollerToUI();

    // 10. Connect message sending from UI
    connectSenderToUI(ui, messaging.messageSender, getMessageStore, getMessagePoller);

    // 11. Start verification loop (after wiring listeners)
    verification.start();

    // 12. Mark as disconnected if starting without connection
    if (!rpcService.isConnected()) {
      messaging.messagePoller.wasDisconnected = true;
    }

    // 13. Show instructions
    ui.showInfo(INFO_MESSAGES.PRESS_CTRL_C);

  } catch (error) {
    if (uiInstance) {
      uiInstance.cleanup();
    }

    const errorMsg = extractErrorMessage(error, 'Unknown error');

    // For known errors, show a clean message. For unknown errors or debug mode, show stack trace
    if (isKnownError(error)) {
      console.error('\n✗ Error:', errorMsg);
      if (isDebugMode() && error.stack) {
        console.error('\nStack trace:');
        console.error(error.stack);
      }
    } else {
      console.error('\n✗ Fatal error:', errorMsg);
      if (error.stack) {
        console.error('\nStack trace:');
        console.error(error.stack);
      }
    }

    process.exit(1);
  }
}

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (error) => {
  if (uiInstance) {
    uiInstance.cleanup();
  }

  const errorMsg = extractErrorMessage(error, 'Unknown error');

  if (isKnownError(error)) {
    console.error('\n✗ Error:', errorMsg);
    if (isDebugMode() && error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
  } else {
    console.error('\n✗ Unhandled error:', errorMsg);
    if (error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
  }

  process.exit(1);
});

/**
 * Handle SIGINT (Ctrl+C)
 */
process.on('SIGINT', () => {
  if (uiInstance) {
    uiInstance.cleanup();
  }
  process.exit(0);
});

/**
 * Handle SIGTERM
 */
process.on('SIGTERM', () => {
  if (uiInstance) {
    uiInstance.cleanup();
  }
  process.exit(0);
});

/**
 * Handle process exit
 */
process.on('exit', () => {
  if (uiInstance) {
    uiInstance.cleanup();
  }
});

// Execute main function
main();
