/**
 * Auth UI Module
 * 
 * Full-page authentication experience components.
 * 
 * @module ui/auth
 */

export { AuthController } from './AuthController';
export type {
  AuthState,
  AuthControllerConfig,
  AuthApiClient,
  EIP6963ProviderDetail,
} from './AuthController';

export { AuthView, AUTH_STEPS } from './AuthView';
export type {
  AuthViewSection,
  AuthStep,
  AuthElements,
  AuthSuccessData,
  AuthViewEventHandlers,
} from './AuthView';
