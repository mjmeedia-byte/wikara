// Public entry point for the shared package.
// Anything the extension and website both need is re-exported from here.
export * from './types';
export * from './settings';

/** The current Wikara version. */
export const APP_VERSION = '0.1.0';
