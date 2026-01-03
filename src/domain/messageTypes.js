/**
 * Shared message type helpers
 * @module domain/messageTypes
 */

export const MESSAGE_TYPES = {
  GROUP: 'group',
  PRIVATE: 'private'
};

export const normalizeMessageType = (rawType) => {
  if (typeof rawType === 'string') {
    const lowered = rawType.toLowerCase();
    if (lowered === MESSAGE_TYPES.PRIVATE) {
      return MESSAGE_TYPES.PRIVATE;
    }
    if (lowered === MESSAGE_TYPES.GROUP) {
      return MESSAGE_TYPES.GROUP;
    }
  }
  return MESSAGE_TYPES.GROUP;
};

export const isPrivateMessage = (rawType) => {
  return normalizeMessageType(rawType) === MESSAGE_TYPES.PRIVATE;
};
