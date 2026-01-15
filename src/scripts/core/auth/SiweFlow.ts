/**
 * SIWE (Sign-In with Ethereum) Flow
 *
 * Pure functions for handling SIWE authentication flow.
 * These functions have no side effects and are fully testable.
 *
 * @module core/auth/SiweFlow
 */

// ============================================================================
// Types
// ============================================================================

/**
 * SIWE message fields as per EIP-4361
 */
export interface SiweMessageFields {
  domain: string;
  address: string;
  statement?: string;
  uri: string;
  version: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources?: string[];
}

/**
 * Challenge response from the API
 */
export interface ChallengeResponse {
  message: string;
  nonce: string;
  expiresAt: number;
}

/**
 * Verify response from the API
 */
export interface VerifyResponse {
  success: boolean;
  address?: string;
  sessionToken?: string;
  error?: string;
}

/**
 * Result of parsing a SIWE message
 */
export interface ParsedSiweMessage {
  success: boolean;
  fields?: SiweMessageFields;
  error?: string;
}

/**
 * Result of validating a SIWE message
 */
export interface SiweValidationResult {
  isValid: boolean;
  error?: string;
}

// ============================================================================
// Message Creation
// ============================================================================

/**
 * Create a SIWE message string from fields
 * Pure function - no side effects
 */
export function createSiweMessage(fields: SiweMessageFields): string {
  const lines: string[] = [];

  // Header line
  lines.push(`${fields.domain} wants you to sign in with your Ethereum account:`);

  // Address
  lines.push(fields.address);

  // Empty line + statement (if present)
  if (fields.statement) {
    lines.push('');
    lines.push(fields.statement);
  }

  // Empty line before fields
  lines.push('');

  // Required fields
  lines.push(`URI: ${fields.uri}`);
  lines.push(`Version: ${fields.version}`);
  lines.push(`Chain ID: ${fields.chainId}`);
  lines.push(`Nonce: ${fields.nonce}`);
  lines.push(`Issued At: ${fields.issuedAt}`);

  // Optional fields
  if (fields.expirationTime) {
    lines.push(`Expiration Time: ${fields.expirationTime}`);
  }
  if (fields.notBefore) {
    lines.push(`Not Before: ${fields.notBefore}`);
  }
  if (fields.requestId) {
    lines.push(`Request ID: ${fields.requestId}`);
  }
  if (fields.resources && fields.resources.length > 0) {
    lines.push('Resources:');
    for (const resource of fields.resources) {
      lines.push(`- ${resource}`);
    }
  }

  return lines.join('\n');
}

/**
 * Create default SIWE message fields
 * Pure function - takes all dependencies as parameters
 */
export function createDefaultSiweFields(params: {
  domain: string;
  address: string;
  chainId: number;
  nonce: string;
  uri: string;
  statement?: string;
  issuedAt?: Date;
  expiresInMinutes?: number;
}): SiweMessageFields {
  const issuedAt = params.issuedAt ?? new Date();
  const expirationTime = params.expiresInMinutes
    ? new Date(issuedAt.getTime() + params.expiresInMinutes * 60 * 1000)
    : undefined;

  return {
    domain: params.domain,
    address: params.address,
    statement: params.statement ?? 'Sign in with Ethereum to the app.',
    uri: params.uri,
    version: '1',
    chainId: params.chainId,
    nonce: params.nonce,
    issuedAt: issuedAt.toISOString(),
    expirationTime: expirationTime?.toISOString(),
  };
}

// ============================================================================
// Message Parsing
// ============================================================================

/**
 * Parse a SIWE message string into fields
 * Pure function - no side effects
 */
export function parseSiweMessage(message: string): ParsedSiweMessage {
  try {
    const lines = message.split('\n');

    if (lines.length < 7) {
      return { success: false, error: 'Invalid SIWE message format: too few lines' };
    }

    // Parse header line: "{domain} wants you to sign in with your Ethereum account:"
    const headerMatch = lines[0].match(/^(.+) wants you to sign in with your Ethereum account:$/);
    if (!headerMatch) {
      return { success: false, error: 'Invalid SIWE header format' };
    }
    const domain = headerMatch[1];

    // Parse address (line 2)
    const address = lines[1].trim();
    if (!isValidEthereumAddress(address)) {
      return { success: false, error: 'Invalid Ethereum address' };
    }

    // Find the field section (starts after empty line)
    let fieldStartIndex = 2;
    let statement: string | undefined;

    // Check if there's a statement (lines 3 is empty, line 4 is statement, line 5 is empty)
    if (lines[2] === '' && lines[3] !== '' && !lines[3].includes(':')) {
      statement = lines[3];
      fieldStartIndex = 5; // Skip to after the second empty line
    } else if (lines[2] === '') {
      fieldStartIndex = 3;
    }

    // Parse key-value fields
    const fields: Partial<SiweMessageFields> = {
      domain,
      address,
      statement,
    };

    const resources: string[] = [];
    let inResources = false;

    for (let i = fieldStartIndex; i < lines.length; i++) {
      const line = lines[i];

      if (inResources) {
        if (line.startsWith('- ')) {
          resources.push(line.slice(2));
        } else {
          inResources = false;
        }
      }

      if (line === 'Resources:') {
        inResources = true;
        continue;
      }

      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();

      switch (key) {
        case 'URI':
          fields.uri = value;
          break;
        case 'Version':
          fields.version = value;
          break;
        case 'Chain ID':
          fields.chainId = parseInt(value, 10);
          break;
        case 'Nonce':
          fields.nonce = value;
          break;
        case 'Issued At':
          fields.issuedAt = value;
          break;
        case 'Expiration Time':
          fields.expirationTime = value;
          break;
        case 'Not Before':
          fields.notBefore = value;
          break;
        case 'Request ID':
          fields.requestId = value;
          break;
      }
    }

    if (resources.length > 0) {
      fields.resources = resources;
    }

    // Validate required fields
    if (!fields.uri || !fields.version || !fields.chainId || !fields.nonce || !fields.issuedAt) {
      return { success: false, error: 'Missing required SIWE fields' };
    }

    return {
      success: true,
      fields: fields as SiweMessageFields,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse SIWE message: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate a SIWE message
 * Pure function - takes current time as parameter for testability
 */
export function validateSiweMessage(
  fields: SiweMessageFields,
  options: {
    expectedDomain?: string;
    expectedAddress?: string;
    expectedChainId?: number;
    now?: Date;
  } = {}
): SiweValidationResult {
  const now = options.now ?? new Date();

  // Validate address format
  if (!isValidEthereumAddress(fields.address)) {
    return { isValid: false, error: 'Invalid Ethereum address format' };
  }

  // Check domain if specified
  if (options.expectedDomain && fields.domain !== options.expectedDomain) {
    return { isValid: false, error: `Domain mismatch: expected ${options.expectedDomain}` };
  }

  // Check address if specified
  if (options.expectedAddress && fields.address.toLowerCase() !== options.expectedAddress.toLowerCase()) {
    return { isValid: false, error: 'Address mismatch' };
  }

  // Check chain ID if specified
  if (options.expectedChainId !== undefined && fields.chainId !== options.expectedChainId) {
    return { isValid: false, error: `Chain ID mismatch: expected ${options.expectedChainId}` };
  }

  // Check expiration time
  if (fields.expirationTime) {
    const expirationDate = new Date(fields.expirationTime);
    if (now > expirationDate) {
      return { isValid: false, error: 'SIWE message has expired' };
    }
  }

  // Check not before
  if (fields.notBefore) {
    const notBeforeDate = new Date(fields.notBefore);
    if (now < notBeforeDate) {
      return { isValid: false, error: 'SIWE message is not yet valid' };
    }
  }

  // Validate nonce format (should be alphanumeric, at least 8 chars)
  if (!/^[a-zA-Z0-9]{8,}$/.test(fields.nonce)) {
    return { isValid: false, error: 'Invalid nonce format' };
  }

  return { isValid: true };
}

/**
 * Check if a string is a valid Ethereum address
 * Pure function - no side effects
 */
export function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Generate a random nonce for SIWE
 * Note: This is not pure as it uses random, but is included for convenience
 */
export function generateNonce(length: number = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ============================================================================
// Chain ID Helpers
// ============================================================================

/**
 * Convert hex chain ID to number
 * Pure function
 */
export function hexToChainId(hex: string): number {
  if (!hex.startsWith('0x')) {
    return parseInt(hex, 10);
  }
  return parseInt(hex, 16);
}

/**
 * Convert chain ID number to hex
 * Pure function
 */
export function chainIdToHex(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

/**
 * Get chain name from chain ID
 * Pure function
 */
export function getChainName(chainId: number): string {
  const chainNames: Record<number, string> = {
    1: 'Ethereum Mainnet',
    5: 'Goerli',
    10: 'Optimism',
    56: 'BNB Smart Chain',
    137: 'Polygon',
    42161: 'Arbitrum One',
    8453: 'Base',
    11155111: 'Sepolia',
    80002: 'Polygon Amoy',
  };

  return chainNames[chainId] ?? `Chain ${chainId}`;
}

// ============================================================================
// Challenge Flow Helpers
// ============================================================================

/**
 * Create challenge request body
 * Pure function
 */
export function createChallengeRequest(address: string, chainId: string | number): {
  address: string;
  chainId: number;
} {
  return {
    address: address.toLowerCase(),
    chainId: typeof chainId === 'string' ? hexToChainId(chainId) : chainId,
  };
}

/**
 * Create verify request body
 * Pure function
 */
export function createVerifyRequest(message: string, signature: string): {
  message: string;
  signature: string;
} {
  return { message, signature };
}

/**
 * Check if a challenge response is valid and not expired
 * Pure function
 */
export function isChallengeValid(
  challenge: ChallengeResponse,
  now: number = Date.now()
): boolean {
  return challenge.expiresAt > now && challenge.message.length > 0 && challenge.nonce.length > 0;
}
