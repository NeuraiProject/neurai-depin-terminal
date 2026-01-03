/**
 * Recipient selector state for Charsm UI
 * Manages loading, selection index, and scroll position.
 * @module RecipientSelector
 */

export class RecipientSelector {
  constructor() {
    this.open = false;
    this.loading = false;
    this.items = [];
    this.index = 0;
    this.scroll = 0;
    this.loadPromise = null;
  }

  isOpen() {
    return this.open;
  }

  async openSelector({ cachedItems, loadItems, onUpdate, onError }) {
    if (this.open || typeof loadItems !== 'function') {
      return;
    }

    this.open = true;
    this.loading = false;

    if (cachedItems && cachedItems.length > 0) {
      this.items = cachedItems;
      this.index = 0;
      this.scroll = 0;
      if (onUpdate) {
        onUpdate();
      }
    } else {
      this.loading = true;
      if (onUpdate) {
        onUpdate();
      }
    }

    try {
      const recipients = await this.load(loadItems);
      this.items = recipients;
      this.index = 0;
      this.scroll = 0;
      this.loading = false;
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      this.open = false;
      this.loading = false;
      if (onError) {
        onError(error);
      }
    }
  }

  close() {
    this.open = false;
    this.loading = false;
  }

  handleKeypress(key) {
    if (!key) {
      return { action: 'noop' };
    }

    if (key.name === 'escape') {
      return { action: 'close' };
    }

    if (key.name === 'up') {
      if (this.index > 0) {
        this.index -= 1;
        if (this.index < this.scroll) {
          this.scroll = this.index;
        }
        return { action: 'update' };
      }
      return { action: 'noop' };
    }

    if (key.name === 'down') {
      if (this.index < this.items.length - 1) {
        this.index += 1;
        return { action: 'update' };
      }
      return { action: 'noop' };
    }

    if (key.name === 'return') {
      return { action: 'select', address: this.items[this.index] };
    }

    return { action: 'noop' };
  }

  async load(loadItems) {
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = Promise.resolve(loadItems());

    try {
      return await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }
}
