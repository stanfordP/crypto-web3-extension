/**
 * Lightweight SIWE (Sign-In With Ethereum) Message Utilities
 * 
 * This replaces the 'siwe' npm package to avoid the ethers.js dependency.
 * Only implements the minimal functionality needed for message preparation.
 * 
 * Reference: EIP-4361 - https://eips.ethereum.org/EIPS/eip-4361
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
 * Parse a SIWE message string into its component fields
 */
export function parseSiweMessage(message: string): SiweMessageFields {
  const lines = message.split('\n');
  
  // First line: "{domain} wants you to sign in with your Ethereum account:"
  const domainMatch = lines[0]?.match(/^(.+) wants you to sign in with your Ethereum account:$/);
  const domain = domainMatch?.[1] || '';
  
  // Second line: address
  const address = lines[1]?.trim() || '';
  
  // Find statement (everything between address and URI)
  let statement: string | undefined;
  let lineIndex = 2;
  
  // Skip empty line after address
  if (lines[lineIndex] === '') {
    lineIndex++;
  }
  
  // Collect statement lines until we hit URI:
  const statementLines: string[] = [];
  while (lineIndex < lines.length && !lines[lineIndex]?.startsWith('URI:')) {
    if (lines[lineIndex] !== '') {
      statementLines.push(lines[lineIndex]);
    }
    lineIndex++;
  }
  
  if (statementLines.length > 0) {
    statement = statementLines.join('\n');
  }
  
  // Parse remaining fields
  const fields: Record<string, string> = {};
  const resourceLines: string[] = [];
  let inResources = false;
  
  for (let i = lineIndex; i < lines.length; i++) {
    const line = lines[i];
    
    if (inResources && line?.startsWith('- ')) {
      resourceLines.push(line.substring(2));
      continue;
    }
    
    if (line === 'Resources:') {
      inResources = true;
      continue;
    }
    
    inResources = false;
    const colonIndex = line?.indexOf(':');
    if (colonIndex && colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      fields[key] = value;
    }
  }
  
  return {
    domain,
    address,
    statement,
    uri: fields['URI'] || '',
    version: fields['Version'] || '1',
    chainId: parseInt(fields['Chain ID'] || '1', 10),
    nonce: fields['Nonce'] || '',
    issuedAt: fields['Issued At'] || new Date().toISOString(),
    expirationTime: fields['Expiration Time'],
    notBefore: fields['Not Before'],
    requestId: fields['Request ID'],
    resources: resourceLines.length > 0 ? resourceLines : undefined,
  };
}

/**
 * Prepare a SIWE message for signing (EIP-4361 format)
 */
export function prepareSiweMessage(fields: SiweMessageFields): string {
  const {
    domain,
    address,
    statement,
    uri,
    version,
    chainId,
    nonce,
    issuedAt,
    expirationTime,
    notBefore,
    requestId,
    resources,
  } = fields;
  
  const lines: string[] = [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
  ];
  
  // Add statement if present
  if (statement) {
    lines.push('');
    lines.push(statement);
  }
  
  lines.push('');
  lines.push(`URI: ${uri}`);
  lines.push(`Version: ${version}`);
  lines.push(`Chain ID: ${chainId}`);
  lines.push(`Nonce: ${nonce}`);
  lines.push(`Issued At: ${issuedAt}`);
  
  if (expirationTime) {
    lines.push(`Expiration Time: ${expirationTime}`);
  }
  
  if (notBefore) {
    lines.push(`Not Before: ${notBefore}`);
  }
  
  if (requestId) {
    lines.push(`Request ID: ${requestId}`);
  }
  
  if (resources && resources.length > 0) {
    lines.push('Resources:');
    resources.forEach((resource) => {
      lines.push(`- ${resource}`);
    });
  }
  
  return lines.join('\n');
}

/**
 * Create a new SIWE message fields object
 */
export function createSiweMessage(options: {
  domain: string;
  address: string;
  statement?: string;
  uri: string;
  chainId: number;
  nonce: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources?: string[];
}): SiweMessageFields {
  return {
    ...options,
    version: '1',
    issuedAt: new Date().toISOString(),
  };
}

/**
 * Validate basic SIWE message structure
 */
export function validateSiweMessage(fields: SiweMessageFields): { valid: boolean; error?: string } {
  if (!fields.domain) {
    return { valid: false, error: 'Missing domain' };
  }
  
  if (!fields.address || !/^0x[a-fA-F0-9]{40}$/.test(fields.address)) {
    return { valid: false, error: 'Invalid Ethereum address' };
  }
  
  if (!fields.uri) {
    return { valid: false, error: 'Missing URI' };
  }
  
  if (!fields.nonce) {
    return { valid: false, error: 'Missing nonce' };
  }
  
  if (!fields.issuedAt) {
    return { valid: false, error: 'Missing issuedAt' };
  }
  
  // Check expiration if present
  if (fields.expirationTime) {
    const expiry = new Date(fields.expirationTime);
    if (expiry < new Date()) {
      return { valid: false, error: 'Message expired' };
    }
  }
  
  // Check notBefore if present
  if (fields.notBefore) {
    const notBefore = new Date(fields.notBefore);
    if (notBefore > new Date()) {
      return { valid: false, error: 'Message not yet valid' };
    }
  }
  
  return { valid: true };
}
