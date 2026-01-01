import blessed from 'blessed';
import { UI, COLORS } from '../../constants.js';

export class StatusBar {
  constructor(screen) {
    this.screen = screen;
    
    this.component = blessed.box({
      bottom: 0,
      left: 0,
      width: '100%',
      height: UI.STATUS_BAR_HEIGHT,
      content: ' Ready',
      tags: true,
      style: {
        fg: COLORS.FG_WHITE,
        bg: COLORS.BG_BLUE
      }
    });

    this.screen.append(this.component);
  }

  update(message, type = 'info') {
    let color = COLORS.INFO;
    if (type === 'error') color = COLORS.ERROR;
    if (type === 'success') color = COLORS.SUCCESS;

    this.component.setContent(` {${color}}${message}{/${color}}`);
    this.screen.render();
  }
}
