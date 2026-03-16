// Ensure window.location.origin is defined for JSDOM
if (!window.location) window.location = {};
if (!window.location.origin) window.location.origin = 'http://localhost';

jest.mock('../imageToBase64', () => ({
  imageToBase64: jest.fn((url) => {
    if (!url || url === 'invalid-url' || url === '') {
      return Promise.reject(new Error('Invalid image URL'));
    }
    return Promise.resolve({
      dataUrl: 'data:image/jpeg;base64,MOCKDATA',
      originalUrl: url,
      size: 12345,
      dimensions: { width: 100, height: 100 },
      timestamp: Date.now(),
    });
  })
}));


import * as useLabImageModule from '../useLabImage'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// No-op DOM methods to prevent JSDOM errors
if (!document.body.appendChild) document.body.appendChild = () => {};
if (!document.body.removeChild) document.body.removeChild = () => {};




// Robust browser API mocks
class MockImage {
  constructor() {
    setTimeout(() => {
      if (this.onload) this.onload()
    }, 10)
    this.crossOrigin = ''
    this.src = ''
    this.width = 100
    this.height = 100
  }
}
global.Image = MockImage

// Patch createElement to only mock 'canvas', delegate others to original
const mockCanvasNode = {
  nodeType: 1, // Element node
  getContext: jest.fn(() => ({
    drawImage: jest.fn(),
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  })),
  toDataURL: jest.fn(() => 'data:image/jpeg;base64,MOCKDATA'),
  width: 0,
  height: 0,
};
const realCreateElement = global.document.createElement;
global.document.createElement = function(type, ...args) {
  if (type === 'canvas') {
    return mockCanvasNode;
  }
  return realCreateElement.call(this, type, ...args);
};

describe('useLabImage hooks', () => {
  // Use real timers for all tests
  let queryClient;
  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  beforeAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false }
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
  });

  describe('useLabImageQuery', () => {
    it('returns cached image data for valid URL', async () => {
      const { result } = renderHook(() => useLabImageModule.useLabImageQuery('http://test/image.jpg', { enabled: true }), { wrapper })
      let tries = 0;
      while (!result.current.data && tries < 10) {
        await act(async () => { result.current.refetch() })
        await new Promise(r => setTimeout(r, 50))
        tries++;
      }
      console.log('VALID URL result.current:', result.current)
      expect(result.current.data).not.toBeUndefined()
      expect(result.current.data).toMatchObject({
        dataUrl: expect.stringContaining('data:image/jpeg;base64'),
        originalUrl: 'http://test/image.jpg',
        size: expect.any(Number),
        dimensions: { width: 100, height: 100 },
        timestamp: expect.any(Number),
      })
    })

    it('throws error for invalid URL', async () => {
      const { result } = renderHook(() => useLabImageModule.useLabImageQuery('invalid-url', { enabled: true }), { wrapper })
      let tries = 0;
      while (!result.current.error && tries < 10) {
        await act(async () => { result.current.refetch() })
        await new Promise(r => setTimeout(r, 50))
        tries++;
      }
      console.log('INVALID URL result.current:', result.current)
      expect(result.current.error).not.toBeNull()
      expect(result.current.error).toBeInstanceOf(Error)
    })
  })

  describe('useLabImage', () => {
    it('returns cached dataUrl when preferCached=true', async () => {
      const { result } = renderHook(() => useLabImageModule.useLabImage('http://test/image2.jpg', { preferCached: true, enabled: true }), { wrapper })
      await act(async () => { result.current.refetch && result.current.refetch() })
      await waitFor(() => result.current.isCached)
      expect(result.current.imageUrl).toContain('data:image/jpeg;base64')
      expect(result.current.isCached).toBe(true)
    })

    it('returns original URL when preferCached=false', async () => {
      const { result } = renderHook(() => useLabImageModule.useLabImage('http://test/image3.jpg', { preferCached: false, enabled: true }), { wrapper })
      await act(async () => { result.current.refetch && result.current.refetch() })
      await waitFor(() => result.current.isCached)
      expect(result.current.imageUrl).toBe('http://test/image3.jpg')
    })
  })

  describe('useLabImageBatch', () => {
    it('caches multiple images and returns correct stats', async () => {
      const urls = ['http://test/img1.jpg', 'http://test/img2.jpg']
      const { result } = renderHook(() => useLabImageModule.useLabImageBatch(urls, { enabled: true }), { wrapper })
      await act(async () => { result.current.mainImage.refetch && result.current.mainImage.refetch() })
      await waitFor(() => result.current.cachedImages === 2)
      expect(result.current.totalImages).toBe(2)
      expect(result.current.cachedImages).toBe(2)
      expect(result.current.mainImage.imageUrl).toContain('data:image/jpeg;base64')
      expect(result.current.allImages[0].isCached).toBe(true)
      expect(result.current.allImages[1].isCached).toBe(true)
    })

    it('handles duplicate and invalid URLs', async () => {
      const urls = ['http://test/img1.jpg', '', 'http://test/img1.jpg']
      const { result } = renderHook(() => useLabImageModule.useLabImageBatch(urls, { enabled: true }), { wrapper })
      await act(async () => { result.current.mainImage.refetch && result.current.mainImage.refetch() })
      await waitFor(() => result.current.cachedImages === 1)
      expect(result.current.totalImages).toBe(1)
      expect(result.current.cachedImages).toBe(1)
    })
  })
})
