/**
 * Unit Tests for Types and Message Protocol
 *
 * Tests the CJ_* message protocol types and enums
 */

import {
  PageMessageType,
  StorageKeys,
  MessageType,
  RpcErrorCode,
  ProviderRpcError,
  SUPPORTED_CHAINS,
} from '../types';

describe('PageMessageType enum', () => {
  describe('Main App → Extension messages', () => {
    it('should have CJ_CHECK_EXTENSION for extension detection', () => {
      expect(PageMessageType.CJ_CHECK_EXTENSION).toBe('CJ_CHECK_EXTENSION');
    });

    it('should have CJ_OPEN_AUTH for auth flow trigger', () => {
      expect(PageMessageType.CJ_OPEN_AUTH).toBe('CJ_OPEN_AUTH');
    });

    it('should have CJ_GET_SESSION for session query', () => {
      expect(PageMessageType.CJ_GET_SESSION).toBe('CJ_GET_SESSION');
    });

    it('should have CJ_DISCONNECT for logout', () => {
      expect(PageMessageType.CJ_DISCONNECT).toBe('CJ_DISCONNECT');
    });
  });

  describe('Extension → Main App messages', () => {
    it('should have CJ_EXTENSION_PRESENT response', () => {
      expect(PageMessageType.CJ_EXTENSION_PRESENT).toBe('CJ_EXTENSION_PRESENT');
    });

    it('should have CJ_AUTH_OPENED response', () => {
      expect(PageMessageType.CJ_AUTH_OPENED).toBe('CJ_AUTH_OPENED');
    });

    it('should have CJ_SESSION_RESPONSE for session data', () => {
      expect(PageMessageType.CJ_SESSION_RESPONSE).toBe('CJ_SESSION_RESPONSE');
    });

    it('should have CJ_SESSION_CHANGED for push updates', () => {
      expect(PageMessageType.CJ_SESSION_CHANGED).toBe('CJ_SESSION_CHANGED');
    });

    it('should have CJ_DISCONNECT_RESPONSE for disconnect confirmation', () => {
      expect(PageMessageType.CJ_DISCONNECT_RESPONSE).toBe('CJ_DISCONNECT_RESPONSE');
    });
  });

  it('should have all message types prefixed with CJ_', () => {
    const allTypes = Object.values(PageMessageType);
    expect(allTypes.every((type) => type.startsWith('CJ_'))).toBe(true);
  });
});

describe('StorageKeys enum', () => {
  it('should have SESSION_TOKEN key', () => {
    expect(StorageKeys.SESSION_TOKEN).toBe('sessionToken');
  });

  it('should have CONNECTED_ADDRESS key', () => {
    expect(StorageKeys.CONNECTED_ADDRESS).toBe('connectedAddress');
  });

  it('should have CHAIN_ID key', () => {
    expect(StorageKeys.CHAIN_ID).toBe('chainId');
  });

  it('should have ACCOUNT_MODE key', () => {
    expect(StorageKeys.ACCOUNT_MODE).toBe('accountMode');
  });

  it('should have LAST_CONNECTED key', () => {
    expect(StorageKeys.LAST_CONNECTED).toBe('lastConnected');
  });
});

describe('MessageType enum', () => {
  it('should have REQUEST_ACCOUNTS for account requests', () => {
    expect(MessageType.REQUEST_ACCOUNTS).toBe('REQUEST_ACCOUNTS');
  });

  it('should have SIGN_MESSAGE for signing', () => {
    expect(MessageType.SIGN_MESSAGE).toBe('SIGN_MESSAGE');
  });

  it('should have GET_SESSION for session queries', () => {
    expect(MessageType.GET_SESSION).toBe('GET_SESSION');
  });

  it('should have DISCONNECT for logout', () => {
    expect(MessageType.DISCONNECT).toBe('DISCONNECT');
  });

  it('should have event types', () => {
    expect(MessageType.ACCOUNTS_CHANGED).toBe('ACCOUNTS_CHANGED');
    expect(MessageType.CHAIN_CHANGED).toBe('CHAIN_CHANGED');
    expect(MessageType.CONNECT).toBe('CONNECT');
    expect(MessageType.DISCONNECT_EVENT).toBe('DISCONNECT_EVENT');
  });
});

describe('RpcErrorCode enum', () => {
  it('should have USER_REJECTED code 4001', () => {
    expect(RpcErrorCode.USER_REJECTED).toBe(4001);
  });

  it('should have UNAUTHORIZED code 4100', () => {
    expect(RpcErrorCode.UNAUTHORIZED).toBe(4100);
  });

  it('should have UNSUPPORTED_METHOD code 4200', () => {
    expect(RpcErrorCode.UNSUPPORTED_METHOD).toBe(4200);
  });

  it('should have DISCONNECTED code 4900', () => {
    expect(RpcErrorCode.DISCONNECTED).toBe(4900);
  });

  it('should have standard JSON-RPC error codes', () => {
    expect(RpcErrorCode.INVALID_PARAMS).toBe(-32602);
    expect(RpcErrorCode.INTERNAL_ERROR).toBe(-32603);
  });
});

describe('ProviderRpcError', () => {
  it('should create error with code and message', () => {
    const error = new ProviderRpcError(4001, 'User rejected request');

    expect(error.code).toBe(4001);
    expect(error.message).toBe('User rejected request');
    expect(error.name).toBe('ProviderRpcError');
  });

  it('should create error with optional data', () => {
    const data = { reason: 'User clicked cancel' };
    const error = new ProviderRpcError(4001, 'User rejected', data);

    expect(error.data).toEqual(data);
  });

  it('should be instanceof Error', () => {
    const error = new ProviderRpcError(4001, 'Error');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('SUPPORTED_CHAINS', () => {
  it('should have Ethereum mainnet (0x1)', () => {
    const eth = SUPPORTED_CHAINS['0x1'];
    expect(eth).toBeDefined();
    expect(eth.chainName).toBe('Ethereum Mainnet');
    expect(eth.nativeCurrency.symbol).toBe('ETH');
  });

  it('should have Polygon mainnet (0x89)', () => {
    const polygon = SUPPORTED_CHAINS['0x89'];
    expect(polygon).toBeDefined();
    expect(polygon.chainName).toBe('Polygon Mainnet');
    expect(polygon.nativeCurrency.symbol).toBe('MATIC');
  });

  it('should have Arbitrum (0xa4b1)', () => {
    const arb = SUPPORTED_CHAINS['0xa4b1'];
    expect(arb).toBeDefined();
    expect(arb.chainName).toBe('Arbitrum One');
  });

  it('should have Optimism (0xa)', () => {
    const op = SUPPORTED_CHAINS['0xa'];
    expect(op).toBeDefined();
    expect(op.chainName).toBe('Optimism');
  });

  it('should have Base (0x2105)', () => {
    const base = SUPPORTED_CHAINS['0x2105'];
    expect(base).toBeDefined();
    expect(base.chainName).toBe('Base');
  });

  it('should have BSC (0x38)', () => {
    const bsc = SUPPORTED_CHAINS['0x38'];
    expect(bsc).toBeDefined();
    expect(bsc.chainName).toBe('BNB Smart Chain');
    expect(bsc.nativeCurrency.symbol).toBe('BNB');
  });

  it('should have Avalanche (0xa86a)', () => {
    const avax = SUPPORTED_CHAINS['0xa86a'];
    expect(avax).toBeDefined();
    expect(avax.chainName).toBe('Avalanche C-Chain');
    expect(avax.nativeCurrency.symbol).toBe('AVAX');
  });

  it('should have proper chain config structure', () => {
    Object.values(SUPPORTED_CHAINS).forEach((chain) => {
      expect(chain.chainId).toBeDefined();
      expect(chain.chainName).toBeDefined();
      expect(chain.nativeCurrency).toBeDefined();
      expect(chain.nativeCurrency.name).toBeDefined();
      expect(chain.nativeCurrency.symbol).toBeDefined();
      expect(chain.nativeCurrency.decimals).toBe(18);
      expect(chain.rpcUrls).toBeDefined();
      expect(Array.isArray(chain.rpcUrls)).toBe(true);
      expect(chain.rpcUrls.length).toBeGreaterThan(0);
    });
  });
});
