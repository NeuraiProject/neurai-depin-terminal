import blessed from 'blessed';
import { COLORS } from '../../constants.js';

export class ErrorOverlay {
  constructor(screen) {
    this.screen = screen;
    this.timer = null;
    this.timeLeft = 30;
    this.currentErrors = [];
    
    this.component = blessed.box({
      top: 'center',
      left: 'center',
      width: '50%',
      height: 'shrink',
      content: '',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: COLORS.FG_WHITE,
        bg: COLORS.ERROR,
        border: {
          fg: COLORS.FG_WHITE
        }
      },
      hidden: true
    });

    this.screen.append(this.component);
  }

  /**
   * Show blocking error overlay
   * @param {string[]} errors - List of error messages
   */
  show(errors) {
    if (!errors || errors.length === 0) {
      this.hide();
      return;
    }

    this.currentErrors = errors;
    this.timeLeft = 30;
    
    // Clear existing timer if any
    if (this.timer) {
      clearInterval(this.timer);
    }

    this.updateContent();
    this.component.show();
    this.component.setFront();
    this.screen.render();

    // Start countdown
    this.timer = setInterval(() => {
      this.timeLeft--;
      if (this.timeLeft < 0) this.timeLeft = 0;
      this.updateContent();
    }, 1000);
  }

  /**
   * Update overlay content with current timer
   */
  updateContent() {
    const content = `\n{bold}CRITICAL ERRORS:{/bold}\n\n` +
      this.currentErrors.map(e => `• ${e}`).join('\n\n') +
      `\n\n{center}Retrying in ${this.timeLeft}s...{/center}\n`;

    this.component.setContent(content);
    this.screen.render();
  }

  /**
   * Hide blocking error overlay
   */
  hide() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (!this.component.hidden) {
      this.component.hide();
      this.screen.render();
    }
  }

  /**
   * Check if overlay is visible
   * @returns {boolean} True if visible
   */
  isVisible() {
    return !this.component.hidden;
  }
}
