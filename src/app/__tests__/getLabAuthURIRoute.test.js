/**
 * @jest-environment node
 */

import { getContractInstance } from '@/app/api/contract/utils/contractInstance';
import devLog from '@/utils/dev/logger';

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}));

jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
  },
}));

describe('/api/contract/lab/getLabAuthURI route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when labId is missing', async () => {
    const { GET } = await import('../api/contract/lab/getLabAuthURI/route.js');

    const req = new Request('http://localhost/api/contract/lab/getLabAuthURI');

    const res = await GET(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Missing required parameter: labId',
    });
  });

  test('returns authURI for valid labId', async () => {
    const mockAuthURI = 'https://auth.institution.edu/auth';
    
    getContractInstance.mockResolvedValue({
      getLabAuthURI: jest.fn().mockResolvedValue(mockAuthURI),
    });

    const { GET } = await import('../api/contract/lab/getLabAuthURI/route.js');

    const req = new Request('http://localhost/api/contract/lab/getLabAuthURI?labId=123');

    const res = await GET(req);
    expect(res.status).toBe(200);
    
    const json = await res.json();
    expect(json).toEqual({
      authURI: mockAuthURI,
    });

    const contract = await getContractInstance();
    expect(contract.getLabAuthURI).toHaveBeenCalledWith('123');
  });

  test('returns empty string when lab has no authURI', async () => {
    getContractInstance.mockResolvedValue({
      getLabAuthURI: jest.fn().mockResolvedValue(''),
    });

    const { GET } = await import('../api/contract/lab/getLabAuthURI/route.js');

    const req = new Request('http://localhost/api/contract/lab/getLabAuthURI?labId=456');

    const res = await GET(req);
    expect(res.status).toBe(200);
    
    const json = await res.json();
    expect(json).toEqual({
      authURI: '',
    });
  });

  test('handles contract errors gracefully', async () => {
    getContractInstance.mockResolvedValue({
      getLabAuthURI: jest.fn().mockRejectedValue(new Error('Contract call failed')),
    });

    const { GET } = await import('../api/contract/lab/getLabAuthURI/route.js');

    const req = new Request('http://localhost/api/contract/lab/getLabAuthURI?labId=789');

    const res = await GET(req);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Contract call failed',
    });
    expect(devLog.error).toHaveBeenCalledWith(
      'Error fetching lab authURI:',
      expect.any(Error)
    );
  });

  test('accepts numeric labId as string', async () => {
    const mockAuthURI = 'https://auth.example.com/auth';
    
    getContractInstance.mockResolvedValue({
      getLabAuthURI: jest.fn().mockResolvedValue(mockAuthURI),
    });

    const { GET } = await import('../api/contract/lab/getLabAuthURI/route.js');

    const req = new Request('http://localhost/api/contract/lab/getLabAuthURI?labId=999');

    const res = await GET(req);
    expect(res.status).toBe(200);
    
    const json = await res.json();
    expect(json.authURI).toBe(mockAuthURI);
  });
});
