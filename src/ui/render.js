/**
 * Rendering helpers for Charsm UI
 * @module ui/render
 */

import { ADDRESS, TIME } from '../constants.js';
import { formatTimestamp, parseRpcHost } from '../utils.js';

export const stripAnsi = (value) => {
  if (!value) {
    return '';
  }
  return value.replace(/\x1b\[[0-9;]*m/g, '');
};

export const padLine = (value, width) => {
  const raw = value || '';
  const len = stripAnsi(raw).length;
  if (len >= width) {
    return raw;
  }
  return raw + ' '.repeat(width - len);
};

export const renderHeaderLines = ({
  config,
  myAddress,
  totalMessages,
  encryptionType,
  lastConnectionStatus,
  lastPollTime
}) => {
  const rpcUrl = parseRpcHost(config.rpc_url);
  const connectedIndicator = lastConnectionStatus ? '●' : '○';
  const lastPollStr = lastPollTime
    ? formatTimestamp(lastPollTime, config.timezone)
    : TIME.PLACEHOLDER;

  let timezoneDisplay = config.timezone || 'UTC';
  if (timezoneDisplay !== 'UTC') {
    if (!timezoneDisplay.startsWith('+') && !timezoneDisplay.startsWith('-')) {
      timezoneDisplay = `+${timezoneDisplay}`;
    }
    timezoneDisplay = `UTC${timezoneDisplay}`;
  }

  const line1 = `Neurai DePIN | ${connectedIndicator} RPC: ${rpcUrl} | Token: ${config.token} | Time: ${timezoneDisplay}`;
  const line2 = `Address: ${myAddress} | Total: ${totalMessages} | Encryption: ${encryptionType} | Last poll: ${lastPollStr}`;

  return [line1, line2];
};

export const renderTabLines = ({ tabs, activeTabId, applyStyle }) => {
  const blocks = tabs.map((tab) => {
    const label = tab.unread ? `${tab.label}*` : tab.label;
    const content = ` ${label} `;
    const borderChar = tab.id === activeTabId ? '═' : '─';
    const isActive = tab.id === activeTabId;
    const top = `┌${borderChar.repeat(content.length)}┐`;
    const middle = `│${content}│`;
    return {
      lines: [top, middle],
      styleId: isActive ? 'tabActive' : 'tabInactive',
      isActive
    };
  });

  if (blocks.length === 0) {
    return { lines: [''], activeRange: null };
  }

  const height = 2;
  const combined = [];
  let activeRange = null;
  let cursor = 0;
  blocks.forEach((block, index) => {
    const blockWidth = block.lines[0].length;
    if (block.isActive) {
      activeRange = { start: cursor, end: cursor + blockWidth - 1 };
    }
    cursor += blockWidth;
    if (index < blocks.length - 1) {
      cursor += 1;
    }
  });
  for (let i = 0; i < height; i += 1) {
    const line = blocks.map((block) => {
      return applyStyle(block.lines[i], block.styleId);
    }).join(' ');
    combined.push(line);
  }

  return { lines: combined, activeRange };
};

export const formatMessageLine = (msg, { config, myAddress, applyStyle }) => {
  const time = formatTimestamp(msg.timestamp, config.timezone);
  const isMe = msg.sender === myAddress;
  const senderLabel = isMe ? 'YOU' : msg.sender.slice(0, ADDRESS.TRUNCATE_LENGTH);
  const line = `[${time}] ${senderLabel}: ${msg.message}`;

  if (msg.isSystem) {
    const styleId = msg.systemType === 'error'
      ? 'msgError'
      : msg.systemType === 'success'
        ? 'msgSuccess'
        : 'msgInfo';
    return applyStyle(line, styleId);
  }

  const styleId = isMe ? 'msgMe' : 'msgOther';
  return applyStyle(line, styleId);
};

export const renderRecipientOverlay = ({ availableHeight, width, selector }) => {
  const contentLines = [];

  if (selector.loading) {
    contentLines.push('(loading recipients...)');
  } else if (!selector.items.length) {
    contentLines.push('(no recipients available)');
  } else {
    const maxVisible = Math.max(1, availableHeight - 2);
    if (selector.index >= selector.scroll + maxVisible) {
      selector.scroll = selector.index - maxVisible + 1;
    }

    const slice = selector.items.slice(selector.scroll, selector.scroll + maxVisible);
    slice.forEach((address, idx) => {
      const absoluteIndex = selector.scroll + idx;
      const prefix = absoluteIndex === selector.index ? '>' : ' ';
      contentLines.push(`${prefix} ${address}`);
    });
  }

  const frameWidth = Math.min(Math.max(width || 40, 40), 70);
  const innerWidth = frameWidth - 2;
  const top = `┌${'─'.repeat(innerWidth)}┐`;
  const bottom = `└${'─'.repeat(innerWidth)}┘`;
  const framed = [top, ...contentLines.map((line) => `│${padLine(line, innerWidth)}│`), bottom];

  const frameHeight = framed.length;
  const leftPadding = Math.max(Math.floor((width - frameWidth) / 2), 0);
  const topPadding = Math.max(Math.floor((availableHeight - frameHeight) / 2), 0);
  const paddedFrame = framed.map((line) => `${' '.repeat(leftPadding)}${line}`);

  const output = [];
  for (let i = 0; i < topPadding; i += 1) {
    output.push('');
  }
  output.push(...paddedFrame);

  while (output.length < availableHeight) {
    output.push('');
  }

  return output.slice(0, availableHeight);
};

export const renderInputLine = (inputValue) => `> ${inputValue}`;

export const renderStatusLine = (statusMessage, statusType, applyStyle) => {
  if (!statusMessage) {
    return '';
  }
  const styleId = statusType === 'error'
    ? 'statusError'
    : statusType === 'success'
      ? 'statusSuccess'
      : 'statusInfo';
  return applyStyle(statusMessage, styleId);
};
