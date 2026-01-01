/**
 * Application-wide constants for Neurai DePIN Terminal
 * @module constants
 */

// Network Configuration
export const NETWORK = {
  XNA: 'xna',
  DEFAULT: 'xna'
};

// Encryption
export const ENCRYPTION = {
  ALGORITHM: 'aes-256-gcm',
  SALT_LENGTH: 32,
  IV_LENGTH: 16,
  KEY_LENGTH: 32,
  SCRYPT_COST: 16384,
  SCRYPT_BLOCK_SIZE: 8,
  SCRYPT_PARALLELIZATION: 1
};

// Password Validation
export const PASSWORD = {
  MIN_LENGTH: 4,
  MAX_LENGTH: 30,
  MAX_ATTEMPTS: 3
};

// Polling Configuration
export const POLLING = {
  DEFAULT_INTERVAL: 10000, // 10 seconds in milliseconds
  MIN_INTERVAL: 1000,
  MAX_INTERVAL: 60000
};

// RPC Configuration
export const RPC = {
  ENDPOINT_SUFFIX: '/rpc',
  DEFAULT_URL: 'https://rpc-depin.neurai.org',
  TIMEOUT: 30000,
  DUMMY_MNEMONIC: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
};

// Message Deduplication
export const MESSAGE = {
  SEPARATOR: '|',
  FORCE_POLL_DELAY: 2000
};

// Token Validation
export const TOKEN = {
  PREFIX: '&',
  MIN_LENGTH: 2
};

// UI Layout
export const UI = {
  TOP_BAR_HEIGHT: 2,
  INPUT_BOX_HEIGHT: 3,
  STATUS_BAR_HEIGHT: 1,
  MESSAGE_BOX_OFFSET: 6, // top bar + input + status
  SCROLLBAR_CHAR: ' '
};

// UI Colors
export const COLORS = {
  CONNECTED: 'green-fg',
  DISCONNECTED: 'red-fg',
  MY_MESSAGE: 'cyan-fg',
  OTHER_MESSAGE: 'green-fg',
  ERROR: 'red-fg',
  SUCCESS: 'green-fg',
  INFO: 'yellow-fg',
  BORDER: 'cyan',
  BG_BLUE: 'blue',
  BG_BLACK: 'black',
  FG_WHITE: 'white'
};

// UI Status Icons
export const ICONS = {
  CONNECTED: '●',
  DISCONNECTED: '●',
  SUCCESS: '✓',
  ERROR: '✗',
  LOADING: '⟳'
};

// RPC Methods
export const RPC_METHODS = {
  GET_BLOCKCHAIN_INFO: 'getblockchaininfo',
  DEPIN_RECEIVE_MSG: 'depinreceivemsg',
  DEPIN_SUBMIT_MSG: 'depinsubmitmsg',
  DEPIN_GET_MSG_INFO: 'depingetmsginfo',
  LIST_ADDRESSES_BY_ASSET: 'listaddressesbyasset',
  GET_PUBKEY: 'getpubkey'
};

// Terminal Control Sequences
export const TERMINAL = {
  EXIT_ALT_SCREEN: '\x1b[?1049l',
  SHOW_CURSOR: '\x1b[?25h',
  RESET_ATTRIBUTES: '\x1b[0m',
  NEW_LINE: '\r\n',
  BACKSPACE: '\b \b'
};

// Config File
export const CONFIG = {
  FILE_NAME: 'config.json',
  EXAMPLE_FILE_NAME: 'config.example.json',
  ENCRYPTED_KEY: 'privateKeyEncrypted',
  PLAIN_KEY: 'privateKey'
};

// Special Key Codes
export const KEY_CODES = {
  ENTER: '\n',
  CARRIAGE_RETURN: '\r',
  CTRL_D: '\u0004',
  CTRL_C: '\u0003',
  BACKSPACE: '\u007f',
  BACKSPACE_ALT: '\b'
};

// Error Messages
export const ERROR_MESSAGES = {
  CONFIG_NOT_FOUND: 'Configuration file not found',
  INVALID_CONFIG: 'Invalid configuration',
  INVALID_PASSWORD: 'Invalid password',
  PASSWORD_TOO_SHORT: `Password must be at least ${PASSWORD.MIN_LENGTH} characters`,
  PASSWORD_TOO_LONG: `Password must be at most ${PASSWORD.MAX_LENGTH} characters`,
  PASSWORDS_DONT_MATCH: 'Passwords do not match',
  MAX_ATTEMPTS_REACHED: `Maximum password attempts (${PASSWORD.MAX_ATTEMPTS}) reached`,
  WALLET_INIT_FAILED: 'Failed to initialize wallet',
  RPC_NOT_INITIALIZED: 'RPC client not initialized',
  NO_TOKEN_HOLDERS: 'No token holders found',
  NO_RECIPIENTS: 'No recipients found with revealed public key',
  LIBRARY_LOAD_FAILED: 'Failed to load neuraiDepinMsg library',
  INVALID_WIF: 'Invalid WIF private key format',
  INVALID_TOKEN: `Token must start with "${TOKEN.PREFIX}"`,
  INVALID_RPC_URL: 'Invalid RPC URL',
  CONNECTION_ERROR: 'Connection error',
  TOKEN_NOT_OWNED: 'This address does not own the configured token',
  PUBKEY_NOT_REVEALED: 'Public key not revealed on blockchain'
};

// Success Messages
export const SUCCESS_MESSAGES = {
  CONFIG_LOADED: '✓ Configuration loaded',
  LIBRARY_LOADED: '✓ DePIN library loaded',
  RPC_CONNECTED: '✓ Connected to RPC server',
  TOKEN_VERIFIED: '✓ Token ownership verified',
  PUBKEY_VERIFIED: '✓ Public key revealed',
  CONNECTED: 'Connected! Type your message and press Enter to send.'
};

// Info Messages
export const INFO_MESSAGES = {
  LOADING_CONFIG: 'Loading configuration...',
  LOADING_LIBRARY: 'Loading DePIN library...',
  INITIALIZING_WALLET: 'Initializing wallet...',
  STARTING_UI: 'Starting terminal interface...',
  PRESS_CTRL_C: 'Press Ctrl+C to exit.',
  CONNECTING: 'Attempting to connect to DePIN server...',
  RECONNECTING: 'Reconnecting, check server configuration',
  SENDING: 'Sending message to all token holders...',
  VERIFYING_TOKEN: 'Verifying token ownership...',
  VERIFYING_PUBKEY: 'Verifying public key...'
};

// Warning Messages
export const WARNING_MESSAGES = {
  RPC_CONNECTION_FAILED: '⚠ Could not connect to RPC server. Will retry during polling.',
  RPC_INIT_FAILED: '⚠ RPC client initialization failed. Will retry during polling.'
};

// Privacy Layer
export const PRIVACY = {
  NO_KEY_VALUE: '0',
  DEFAULT_ENCRYPTION: 'N/A'
};

// Time Formats
export const TIME = {
  LOCALE_TIME: 'toLocaleTimeString',
  PLACEHOLDER: '--:--:--'
};

// Blessed Keys
export const BLESSED_KEYS = {
  QUIT: ['C-c', 'escape'],
  SEND: ['enter', 'C-s'],
  SCROLL_UP: ['up'],
  SCROLL_DOWN: ['down']
};

// Address Display
export const ADDRESS = {
  TRUNCATE_LENGTH: 10,
  PUBKEY_DISPLAY_LENGTH: 20
};

// Hash Display
export const HASH = {
  DISPLAY_LENGTH: 16
};
