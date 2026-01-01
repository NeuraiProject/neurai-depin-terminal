import blessed from 'blessed';
import { UI, COLORS, ICONS } from '../../constants.js';
import { parseRpcHost, formatTimestamp } from '../../utils.js';

export class TopBar {
  constructor(screen, config, myAddress) {
    this.screen = screen;
    this.config = config;
    this.myAddress = myAddress;
    this.totalMessages = 0;
    this.encryptionType = 'N/A';
    
    this.component = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: UI.TOP_BAR_HEIGHT,
      content: 'Loading...',
      tags: true,
      style: {
        fg: COLORS.FG_WHITE,
        bg: COLORS.BG_BLUE
      }
    });

    this.screen.append(this.component);
  }

  update(status) {
    const rpcUrl = parseRpcHost(this.config.rpc_url);
    const connectedIndicator = status.connected ? 
      `{${COLORS.CONNECTED}}${ICONS.CONNECTED}{/${COLORS.CONNECTED}}` : 
      `{${COLORS.DISCONNECTED}}${ICONS.DISCONNECTED}{/${COLORS.DISCONNECTED}}`;
    
    const lastPollStr = status.lastPoll ? 
      formatTimestamp(status.lastPoll, this.config.timezone) : 
      '--:--:--';

    // Format timezone display
    let timezoneDisplay = this.config.timezone || 'UTC';
    if (timezoneDisplay !== 'UTC') {
       if (!timezoneDisplay.startsWith('+') && !timezoneDisplay.startsWith('-')) {
           timezoneDisplay = `+${timezoneDisplay}`;
       }
       timezoneDisplay = `UTC${timezoneDisplay}`;
    }

    this.component.setContent(
      `Neurai DePIN | ${connectedIndicator} RPC: ${rpcUrl} | Token: ${this.config.token} | Time: ${timezoneDisplay}\n` +
      `Address: ${this.myAddress} | Total: ${this.totalMessages} | Encryption: ${this.encryptionType} | Last poll: ${lastPollStr}`
    );

    this.screen.render();
  }

  setTotalMessages(count) {
    this.totalMessages = count;
  }

  setEncryptionType(type) {
    this.encryptionType = type;
  }
}
