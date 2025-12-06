/**
 * Unit tests for guards.js
 * Tests authentication and authorization guards for API endpoints
 */

// Mock NextResponse before importing guards
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body, options = {}) => ({
      status: options.status || 200,
      json: async () => body,
    })),
  },
}));

// Mock dependencies
jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

jest.mock('@/utils/auth/sessionCookie', () => ({
  getSessionFromCookies: jest.fn(),
}));

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}));

jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('guards', () => {
  let guards;
  let mockCookies;
  let mockGetSessionFromCookies;
  let mockGetContractInstance;

  beforeEach(async () => {
    jest.resetModules();
    
    // Get mocked modules
    const headersModule = await import('next/headers');
    const sessionCookieModule = await import('@/utils/auth/sessionCookie');
    const contractInstanceModule = await import('@/app/api/contract/utils/contractInstance');
    
    mockCookies = headersModule.cookies;
    mockGetSessionFromCookies = sessionCookieModule.getSessionFromCookies;
    mockGetContractInstance = contractInstanceModule.getContractInstance;
    
    // Import guards module
    guards = await import('@/utils/auth/guards');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('requireAuth', () => {
    it('should return session when valid session exists', async () => {
      const mockSession = { id: 'user123', email: 'test@example.com' };
      const mockCookieStore = { get: jest.fn() };
      
      mockCookies.mockResolvedValue(mockCookieStore);
      mockGetSessionFromCookies.mockReturnValue(mockSession);

      const result = await guards.requireAuth();

      expect(result).toEqual(mockSession);
      expect(mockCookies).toHaveBeenCalled();
      expect(mockGetSessionFromCookies).toHaveBeenCalledWith(mockCookieStore);
    });

    it('should throw UnauthorizedError when no session exists', async () => {
      const mockCookieStore = { get: jest.fn() };
      
      mockCookies.mockResolvedValue(mockCookieStore);
      mockGetSessionFromCookies.mockReturnValue(null);

      await expect(guards.requireAuth()).rejects.toThrow(guards.UnauthorizedError);
      await expect(guards.requireAuth()).rejects.toThrow('No valid session');
    });
  });

  describe('requireAuthWithWallet', () => {
    it('should return session when session has valid wallet', async () => {
      const mockSession = {
        id: 'user123',
        wallet: '0x1234567890abcdef1234567890abcdef12345678',
      };
      const mockCookieStore = { get: jest.fn() };
      
      mockCookies.mockResolvedValue(mockCookieStore);
      mockGetSessionFromCookies.mockReturnValue(mockSession);

      const result = await guards.requireAuthWithWallet();

      expect(result).toEqual(mockSession);
    });

    it('should throw ForbiddenError when session has no wallet', async () => {
      const mockSession = { id: 'user123', email: 'test@example.com' };
      const mockCookieStore = { get: jest.fn() };
      
      mockCookies.mockResolvedValue(mockCookieStore);
      mockGetSessionFromCookies.mockReturnValue(mockSession);

      await expect(guards.requireAuthWithWallet()).rejects.toThrow(guards.ForbiddenError);
      await expect(guards.requireAuthWithWallet()).rejects.toThrow('No wallet linked');
    });

    it('should throw ForbiddenError when wallet is invalid format', async () => {
      const mockSession = { id: 'user123', wallet: 'invalid-wallet' };
      const mockCookieStore = { get: jest.fn() };
      
      mockCookies.mockResolvedValue(mockCookieStore);
      mockGetSessionFromCookies.mockReturnValue(mockSession);

      await expect(guards.requireAuthWithWallet()).rejects.toThrow(guards.ForbiddenError);
    });
  });

  describe('requireLabOwner', () => {
    const validSession = {
      id: 'user123',
      wallet: '0x1234567890abcdef1234567890abcdef12345678',
    };

    it('should return session when user owns the lab', async () => {
      const mockContract = {
        ownerOf: jest.fn().mockResolvedValue(validSession.wallet),
      };
      mockGetContractInstance.mockResolvedValue(mockContract);

      const result = await guards.requireLabOwner(validSession, '123');

      expect(result).toEqual(validSession);
      expect(mockContract.ownerOf).toHaveBeenCalledWith(123);
    });

    it('should throw BadRequestError for missing labId', async () => {
      await expect(guards.requireLabOwner(validSession, null)).rejects.toThrow(guards.BadRequestError);
      await expect(guards.requireLabOwner(validSession, '')).rejects.toThrow('Lab ID is required');
    });

    it('should throw BadRequestError for invalid labId format', async () => {
      await expect(guards.requireLabOwner(validSession, 'abc')).rejects.toThrow(guards.BadRequestError);
      await expect(guards.requireLabOwner(validSession, -1)).rejects.toThrow('Invalid lab ID format');
    });

    it('should throw ForbiddenError when session has no wallet', async () => {
      const sessionNoWallet = { id: 'user123' };

      await expect(guards.requireLabOwner(sessionNoWallet, '123')).rejects.toThrow(guards.ForbiddenError);
      await expect(guards.requireLabOwner(sessionNoWallet, '123')).rejects.toThrow('No wallet linked');
    });

    it('should throw ForbiddenError when user is not the owner', async () => {
      const mockContract = {
        ownerOf: jest.fn().mockResolvedValue('0xdifferent0wallet0address0000000000000001'),
      };
      mockGetContractInstance.mockResolvedValue(mockContract);

      await expect(guards.requireLabOwner(validSession, '123')).rejects.toThrow(guards.ForbiddenError);
      await expect(guards.requireLabOwner(validSession, '123')).rejects.toThrow('not the owner');
    });

    it('should handle case-insensitive wallet comparison', async () => {
      const mockContract = {
        ownerOf: jest.fn().mockResolvedValue(validSession.wallet.toUpperCase()),
      };
      mockGetContractInstance.mockResolvedValue(mockContract);

      const result = await guards.requireLabOwner(validSession, '123');

      expect(result).toEqual(validSession);
    });

    it('should throw BadRequestError when lab does not exist', async () => {
      const mockContract = {
        ownerOf: jest.fn().mockRejectedValue(new Error('nonexistent token')),
      };
      mockGetContractInstance.mockResolvedValue(mockContract);

      await expect(guards.requireLabOwner(validSession, '999')).rejects.toThrow(guards.BadRequestError);
      await expect(guards.requireLabOwner(validSession, '999')).rejects.toThrow('does not exist');
    });
  });

  describe('requireProviderRole', () => {
    it('should return session for provider role', () => {
      const session = { id: 'user123', role: 'provider' };
      expect(guards.requireProviderRole(session)).toEqual(session);
    });

    it('should return session for staff role', () => {
      const session = { id: 'user123', role: 'staff' };
      expect(guards.requireProviderRole(session)).toEqual(session);
    });

    it('should return session for admin role', () => {
      const session = { id: 'user123', role: 'admin' };
      expect(guards.requireProviderRole(session)).toEqual(session);
    });

    it('should return session if user has linked wallet', () => {
      const session = { 
        id: 'user123', 
        role: 'student',
        wallet: '0x1234567890abcdef1234567890abcdef12345678'
      };
      expect(guards.requireProviderRole(session)).toEqual(session);
    });

    it('should throw ForbiddenError for non-provider without wallet', () => {
      const session = { id: 'user123', role: 'student' };
      expect(() => guards.requireProviderRole(session)).toThrow(guards.ForbiddenError);
    });
  });

  describe('isValidAddress', () => {
    it('should return true for valid Ethereum address', () => {
      expect(guards.isValidAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe(true);
      expect(guards.isValidAddress('0xABCDEF1234567890abcdef1234567890ABCDEF12')).toBe(true);
    });

    it('should return false for invalid addresses', () => {
      expect(guards.isValidAddress(null)).toBe(false);
      expect(guards.isValidAddress(undefined)).toBe(false);
      expect(guards.isValidAddress('')).toBe(false);
      expect(guards.isValidAddress('invalid')).toBe(false);
      expect(guards.isValidAddress('0x123')).toBe(false); // Too short
      expect(guards.isValidAddress('1234567890abcdef1234567890abcdef12345678')).toBe(false); // Missing 0x
    });
  });

  describe('extractLabIdFromPath', () => {
    it('should extract labId from standard paths', () => {
      expect(guards.extractLabIdFromPath('/123/images/file.jpg')).toBe('123');
      expect(guards.extractLabIdFromPath('456/docs/document.pdf')).toBe('456');
      expect(guards.extractLabIdFromPath('/789/images/')).toBe('789');
    });

    it('should return null for temp folder paths', () => {
      expect(guards.extractLabIdFromPath('/temp/images/file.jpg')).toBeNull();
      expect(guards.extractLabIdFromPath('temp/docs/doc.pdf')).toBeNull();
    });

    it('should return null for invalid paths', () => {
      expect(guards.extractLabIdFromPath(null)).toBeNull();
      expect(guards.extractLabIdFromPath('')).toBeNull();
      expect(guards.extractLabIdFromPath('images/file.jpg')).toBeNull();
    });
  });

  describe('handleGuardError', () => {
    let NextResponse;
    
    beforeEach(async () => {
      NextResponse = (await import('next/server')).NextResponse;
    });
    
    it('should return 401 response for UnauthorizedError', () => {
      const error = new guards.UnauthorizedError('Test unauthorized');
      const response = guards.handleGuardError(error);

      expect(response.status).toBe(401);
    });

    it('should return 403 response for ForbiddenError', () => {
      const error = new guards.ForbiddenError('Test forbidden');
      const response = guards.handleGuardError(error);

      expect(response.status).toBe(403);
    });

    it('should return 400 response for BadRequestError', () => {
      const error = new guards.BadRequestError('Test bad request');
      const response = guards.handleGuardError(error);

      expect(response.status).toBe(400);
    });

    it('should return 500 response for unexpected errors', () => {
      const error = new Error('Unexpected error');
      const response = guards.handleGuardError(error);

      expect(response.status).toBe(500);
    });
  });

  describe('withAuth', () => {
    const buildRequest = () => ({ headers: new Map(), clone: () => buildRequest() });

    it('returns 401 response when unauthenticated', async () => {
      const mockCookieStore = { get: jest.fn() };
      mockCookies.mockResolvedValue(mockCookieStore);
      mockGetSessionFromCookies.mockReturnValue(null);

      const handler = jest.fn();
      const wrapped = guards.withAuth(handler);

      const response = await wrapped(buildRequest());

      expect(response.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it('blocks provider-only route with 403 when role missing', async () => {
      const mockCookieStore = { get: jest.fn() };
      const session = { id: 'user123', role: 'student', wallet: null };
      mockCookies.mockResolvedValue(mockCookieStore);
      mockGetSessionFromCookies.mockReturnValue(session);

      const handler = jest.fn();
      const wrapped = guards.withAuth(handler, { requireProvider: true });

      const response = await wrapped(buildRequest());

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });

    it('passes session to handler when authenticated and authorized', async () => {
      const mockCookieStore = { get: jest.fn() };
      const session = { id: 'user123', role: 'provider', wallet: '0x1234567890abcdef1234567890abcdef12345678' };
      mockCookies.mockResolvedValue(mockCookieStore);
      mockGetSessionFromCookies.mockReturnValue(session);

      const handler = jest.fn(() => ({ status: 200 }));
      const wrapped = guards.withAuth(handler, { requireProvider: true });

      const response = await wrapped(buildRequest());

      expect(handler).toHaveBeenCalledWith(session, expect.any(Object));
      expect(response.status).toBe(200);
    });
  });

  describe('Error classes', () => {
    it('UnauthorizedError should have correct properties', () => {
      const error = new guards.UnauthorizedError('Custom message');
      expect(error.status).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.message).toBe('Custom message');
      expect(error.name).toBe('UnauthorizedError');
    });

    it('ForbiddenError should have correct properties', () => {
      const error = new guards.ForbiddenError('Custom message');
      expect(error.status).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toBe('Custom message');
      expect(error.name).toBe('ForbiddenError');
    });

    it('BadRequestError should have correct properties', () => {
      const error = new guards.BadRequestError('Custom message');
      expect(error.status).toBe(400);
      expect(error.code).toBe('BAD_REQUEST');
      expect(error.message).toBe('Custom message');
      expect(error.name).toBe('BadRequestError');
    });
  });
});
