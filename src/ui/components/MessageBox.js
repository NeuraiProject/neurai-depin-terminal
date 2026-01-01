import blessed from 'blessed';
import { UI, COLORS } from '../../constants.js';

export class MessageBox {
  constructor(screen) {
    this.screen = screen;
    
    this.component = blessed.box({
      top: UI.TOP_BAR_HEIGHT,
      left: 0,
      width: '100%',
      height: `100%-${UI.MESSAGE_BOX_OFFSET}`,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      mouse: true,
      tags: true,
      scrollbar: {
        ch: UI.SCROLLBAR_CHAR,
        style: {
          bg: COLORS.BG_BLUE
        }
      },
      style: {
        fg: COLORS.FG_WHITE,
        bg: COLORS.BG_BLACK
      }
    });

    this.screen.append(this.component);
  }

  addMessage(formattedLine) {
    const current = this.component.getContent();
    const next = current && current.length > 0 ? `${current}\n${formattedLine}` : formattedLine;
    this.component.setContent(next);
    this.component.setScrollPerc(100);
    this.screen.render();
  }

  scrollUp() {
    this.component.scroll(-1);
    this.screen.render();
  }

  scrollDown() {
    this.component.scroll(1);
    this.screen.render();
  }
}
