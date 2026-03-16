// Separate error/batch tests for useLabImage with isolated mocks

jest.mock('../imageToBase64', () => ({
  imageToBase64: jest.fn((url) => {
    if (url === 'network-error') return Promise.reject(new Error('Network error'));
    if (url === 'bad-url-batch') return Promise.reject(new Error('fail'));
    if (!url || url === 'invalid-url' || url === '') return Promise.reject(new Error('Invalid image URL'));
    return Promise.resolve({
      dataUrl: 'data:image/jpeg;base64,MOCKDATA',
      originalUrl: url,
      size: 12345,
      dimensions: { width: 100, height: 100 },
      timestamp: Date.now(),
    });
  })
}));

import * as useLabImageModule from '../useLabImage';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

describe('useLabImage error/batch cases (isolated mocks)', () => {
  it('propaga error de red en imageToBase64', async () => {
    const url = 'network-error';
    const { result } = renderHook(() => useLabImageModule.useLabImageQuery(url, { enabled: true }), { wrapper });
    let tries = 0;
    while (!result.current.isError && !result.current.error && tries < 20) {
      await act(async () => { result.current.refetch() });
      await new Promise(r => setTimeout(r, 100));
      tries++;
    }
    expect(result.current.isError || !!result.current.error).toBe(true);
    expect(result.current.error && (result.current.error.message || String(result.current.error))).toMatch(/network/i);
  });

  it('batch: mezcla de éxitos y errores', async () => {
    const urls = ['ok1-batch', 'bad-url-batch', 'ok2-batch'];
    const { result } = renderHook(() => useLabImageModule.useLabImageBatch(urls, { enabled: true }), { wrapper });
    let tries = 0;
    while (!result.current.allImages.some(q => q.isError || q.error) && tries < 20) {
      await act(async () => { result.current.mainImage.refetch && result.current.mainImage.refetch() });
      await new Promise(r => setTimeout(r, 100));
      tries++;
    }
    console.log('BATCH allImages:', result.current.allImages);
    // Accept either isError or error presence
    const errorCount = result.current.allImages.filter(q => q.isError || q.error).length;
    expect(errorCount).toBeGreaterThanOrEqual(1);
    expect(result.current.allImages[1].isError || !!result.current.allImages[1].error).toBe(true);
    if (result.current.allImages[1].error) {
      expect(result.current.allImages[1].error.message || String(result.current.allImages[1].error)).toMatch(/fail/i);
    }
  });
});
