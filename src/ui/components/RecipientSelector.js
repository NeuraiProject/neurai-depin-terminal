import blessed from 'blessed';
import { COLORS, UI } from '../../constants.js';

export class RecipientSelector {
  constructor(screen) {
    this.screen = screen;
    this.selectable = false;
    this.onSelectCallback = null;

    this.component = blessed.list({
      top: 'center',
      left: 'center',
      width: '70%',
      height: '50%',
      label: ' Select recipient ',
      border: 'line',
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      style: {
        fg: COLORS.FG_WHITE,
        bg: COLORS.BG_BLACK,
        border: {
          fg: COLORS.BORDER
        },
        selected: {
          fg: COLORS.FG_WHITE,
          bg: COLORS.BG_BLUE
        }
      },
      scrollbar: {
        ch: UI.SCROLLBAR_CHAR,
        style: {
          bg: COLORS.BG_BLUE
        }
      },
      hidden: true
    });

    this.component.on('select', (item) => {
      if (!this.selectable) {
        return;
      }

      const text = item?.getText ? item.getText() : item?.content;
      if (text && this.onSelectCallback) {
        this.onSelectCallback(text);
      }
    });

    this.screen.append(this.component);
  }

  onSelect(callback) {
    this.onSelectCallback = callback;
  }

  isVisible() {
    return !this.component.hidden;
  }

  show() {
    this.component.show();
    this.component.focus();
    this.screen.render();
  }

  hide() {
    this.component.hide();
    this.screen.render();
  }

  setLoading() {
    this.selectable = false;
    this.component.setItems(['(loading recipients...)']);
    this.component.select(0);
  }

  setEmpty(message = '(no recipients available)') {
    this.selectable = false;
    this.component.setItems([message]);
    this.component.select(0);
  }

  setItems(items) {
    if (!items || items.length === 0) {
      this.setEmpty();
      return;
    }

    this.selectable = true;
    this.component.setItems(items);
    this.component.select(0);
  }
}
