/**
 * Regression tests for the opaque server-side session cookie contract.
 */

jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const originalEnv = process.env;

describe('sessionCookie', () => {
  let sessionCookie;

  beforeEach(async () => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-session-secret-that-is-long-enough',
    };
    sessionCookie = await import('@/utils/auth/sessionCookie');
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('stores identity server-side and puts only an opaque identifier in the cookie', async () => {
    const sessionData = {
      id: 'user123',
      email: 'test@example.com',
      samlAssertion: '<Assertion>secret identity material</Assertion>',
    };

    const cookies = await sessionCookie.createSessionCookie(sessionData);

    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toEqual(expect.objectContaining({
      name: '__Host-user_session',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    }));
    expect(cookies[0].value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookies[0].value).not.toContain('Assertion');
    expect(cookies[0].value).not.toContain('user123');

    const session = await sessionCookie.getSessionFromCookies({
      get: () => ({ value: cookies[0].value }),
    });

    expect(session).toEqual(expect.objectContaining({
      id: 'user123',
      email: 'test@example.com',
      samlAssertion: sessionData.samlAssertion,
      sessionId: cookies[0].value,
    }));
  });

  it('rejects legacy JWT or JSON cookies instead of treating them as sessions', async () => {
    const cookieStore = {
      get: () => ({ value: 'eyJhbGciOiJIUzI1NiJ9.eyJzYW1sQXNzZXJ0aW9uIjoic2VjcmV0In0.signature' }),
    };

    await expect(sessionCookie.getSessionFromCookies(cookieStore)).resolves.toBeNull();
  });

  it('rejects duplicate base cookies', async () => {
    await expect(sessionCookie.getSessionFromCookies({
      getAll: () => [
        { name: '__Host-user_session', value: 'a'.repeat(43) },
        { name: '__Host-user_session', value: 'b'.repeat(43) },
      ],
    })).resolves.toBeNull();
  });

  it('creates a destroy cookie with the same host-only security attributes', () => {
    expect(sessionCookie.createDestroySessionCookie()).toEqual(expect.objectContaining({
      name: '__Host-user_session',
      value: '',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    }));
  });
});
