/**
 * Tab manager for Charsm UI
 * Tracks group and private tabs, unread state, and ordering.
 * @module TabManager
 */

export class TabManager {
  constructor() {
    this.tabs = [];
    this.activeTabId = 'group';
    this.privateTabFirstSeen = new Map();
    this.closedPrivateTabs = new Set();
  }

  initialize() {
    this.tabs = [{
      id: 'group',
      label: 'Group',
      type: 'group',
      unread: false,
      firstSeen: 0
    }];
    this.activeTabId = 'group';
  }

  getTabs() {
    return this.tabs;
  }

  getActiveTabId() {
    return this.activeTabId;
  }

  getActivePeerAddress() {
    if (!this.activeTabId.startsWith('dm:')) {
      return null;
    }
    return this.activeTabId.slice(3);
  }

  setActiveTab(tabId) {
    const tab = this.tabs.find((entry) => entry.id === tabId);
    if (!tab) {
      return false;
    }
    this.activeTabId = tabId;
    tab.unread = false;
    return true;
  }

  activateNextTab() {
    if (this.tabs.length === 0) {
      return false;
    }
    const currentIndex = this.tabs.findIndex((tab) => tab.id === this.activeTabId);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % this.tabs.length;
    return this.setActiveTab(this.tabs[nextIndex].id);
  }

  activatePrevTab() {
    if (this.tabs.length === 0) {
      return false;
    }
    const currentIndex = this.tabs.findIndex((tab) => tab.id === this.activeTabId);
    const prevIndex = currentIndex === -1
      ? 0
      : (currentIndex - 1 + this.tabs.length) % this.tabs.length;
    return this.setActiveTab(this.tabs[prevIndex].id);
  }

  closeActiveTab() {
    if (this.activeTabId === 'group') {
      return false;
    }

    const peerAddress = this.getActivePeerAddress();
    this.tabs = this.tabs.filter((tab) => tab.id !== this.activeTabId);
    if (peerAddress) {
      this.closedPrivateTabs.add(peerAddress);
    }
    this.activeTabId = 'group';
    this.sortTabs();
    return true;
  }

  openPrivateTab(address, activate = false, timestamp = null) {
    if (!address) {
      return null;
    }

    const tabId = `dm:${address}`;
    let tab = this.tabs.find((entry) => entry.id === tabId);

    if (!this.privateTabFirstSeen.has(address)) {
      const firstSeen = timestamp || Math.floor(Date.now() / 1000);
      this.privateTabFirstSeen.set(address, firstSeen);
    }

    if (!tab) {
      if (this.closedPrivateTabs.has(address)) {
        this.closedPrivateTabs.delete(address);
      }

      tab = {
        id: tabId,
        label: this.formatTabLabel(address),
        type: 'dm',
        address: address,
        unread: false,
        firstSeen: this.privateTabFirstSeen.get(address)
      };

      this.tabs.push(tab);
      this.sortTabs();
    }

    if (activate) {
      this.setActiveTab(tabId);
    }

    return tab;
  }

  markUnread(tabId) {
    const tab = this.tabs.find((entry) => entry.id === tabId);
    if (tab) {
      tab.unread = true;
    }
  }

  markGroupUnread() {
    if (this.activeTabId === 'group') {
      return;
    }
    const groupTab = this.tabs.find((tab) => tab.id === 'group');
    if (groupTab) {
      groupTab.unread = true;
    }
  }

  formatTabLabel(address) {
    if (!address) {
      return 'Unknown';
    }

    const trimmed = address.trim();
    if (trimmed.length <= 6) {
      return trimmed;
    }

    return `${trimmed.slice(0, 3)}...${trimmed.slice(-3)}`;
  }

  sortTabs() {
    const groupTab = this.tabs.find((tab) => tab.type === 'group');
    const dmTabs = this.tabs
      .filter((tab) => tab.type === 'dm')
      .sort((a, b) => a.firstSeen - b.firstSeen);

    this.tabs = groupTab ? [groupTab, ...dmTabs] : dmTabs;
  }
}
