/**
 * Mock for Next.js useRouter hook.
 * ------------------------------------------------
 * Provides default route info and mock functions for navigation methods:
 *  - push, pop, reload, back, prefetch, beforePopState
 *  - events: on, off, emit
 * Useful for testing components that depend on router navigation.
 */

module.exports = {
  useRouter: () => ({
    route: '/',
    pathname: '/',
    query: {},
    asPath: '/',
    push: jest.fn(),
    pop: jest.fn(),
    reload: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
    beforePopState: jest.fn(),
    events: { on: jest.fn(), off: jest.fn(), emit: jest.fn() },
  }),
};
