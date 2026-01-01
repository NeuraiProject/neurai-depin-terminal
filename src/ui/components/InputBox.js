import blessed from 'blessed';
import { UI, COLORS, KEY_CODES } from '../../constants.js';

export class InputBox {
  constructor(screen, onSend) {
    this.screen = screen;
    this.onSend = onSend;
    
    this.component = blessed.textarea({
      bottom: UI.STATUS_BAR_HEIGHT,
      left: 0,
      width: '100%',
      height: UI.INPUT_BOX_HEIGHT,
      inputOnFocus: true,
      keys: true,
      style: {
        fg: COLORS.FG_WHITE,
        bg: COLORS.BG_BLACK,
        border: {
          fg: COLORS.BORDER
        }
      },
      border: {
        type: 'line'
      }
    });

    this.setupEvents();
    this.screen.append(this.component);
  }

  setupEvents() {
    this.component.key('enter', () => {
      const message = this.component.getValue().trim();
      if (message) {
        this.onSend(message);
        this.component.clearValue();
        this.screen.render();
      }
    });
  }

  focus() {
    if (!this.disabled) {
      this.component.focus();
    }
  }

  disable() {
    this.disabled = true;
    this.component.inputOnFocus = false;
    // Optional: Change style to indicate disabled state
    this.component.style.border.fg = 'gray';
    this.screen.render();
  }

  enable() {
    this.disabled = false;
    this.component.inputOnFocus = true;
    this.component.style.border.fg = COLORS.BORDER;
    this.screen.render();
  }
}
