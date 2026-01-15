/**
 * Test utilities module exports
 * @module tests/utils
 */

export {
  // Mock types
  type MockCallRecord,
  type MockStorageAdapter,
  type MockRuntimeAdapter,
  type MockTabsAdapter,
  type MockDOMAdapter,
  type MockAlarmsAdapter,
  // Factory functions
  createMockStorageAdapter,
  createMockRuntimeAdapter,
  createMockTabsAdapter,
  createMockDOMAdapter,
  createMockAlarmsAdapter,
  createMockAdapterContainer,
} from './mock-factories';
