/**
 * @file imageToBase64.test.js
 * @description Tests for imageToBase64 utility
 */
import { imageToBase64 } from '../imageToBase64';

// Mock browser APIs
beforeAll(() => {
  // Mock Image constructor
  global.Image = class {
    constructor() {
      this.crossOrigin = '';
      this.onload = null;
      this.onerror = null;
      this.src = '';
      this.width = 100;
      this.height = 100;
    }
  };
  // Mock document.createElement('canvas')
  global.document.createElement = jest.fn((type) => {
    if (type === 'canvas') {
      return {
        getContext: () => ({
          drawImage: jest.fn(),
          imageSmoothingEnabled: false,
          imageSmoothingQuality: 'low',
        }),
        toDataURL: jest.fn(() => 'data:image/jpeg;base64,FAKEBASE64DATA'),
        width: 0,
        height: 0,
      };
    }
    return {};
  });
  // Mock window.location.origin
  global.window = { location: { origin: 'http://localhost' } };
});

describe('imageToBase64', () => {
  it('should resolve with base64 data for valid image URL', async () => {
    let onload;
    global.Image = class {
      constructor() {
        this.crossOrigin = '';
        this.width = 100;
        this.height = 100;
        setTimeout(() => onload && onload.call(this), 10);
      }
      set onload(fn) { onload = fn; }
      get onload() { return onload; }
      set src(val) { this._src = val; }
      get src() { return this._src; }
    };
    const result = await imageToBase64('http://example.com/image.jpg');
    expect(result.dataUrl).toContain('data:image/jpeg;base64');
    expect(result.originalUrl).toBe('http://example.com/image.jpg');
    expect(result.size).toBeGreaterThan(0);
    expect(result.dimensions).toEqual({ width: 100, height: 100 });
    expect(typeof result.timestamp).toBe('number');
  });

  it('should resolve with base64 data for local image path', async () => {
    let onload;
    global.Image = class {
      constructor() {
        this.crossOrigin = '';
        this.width = 100;
        this.height = 100;
        setTimeout(() => onload && onload.call(this), 10);
      }
      set onload(fn) { onload = fn; }
      get onload() { return onload; }
      set src(val) { this._src = val; }
      get src() { return this._src; }
    };
    const result = await imageToBase64('/local/image.jpg');
    expect(result.originalUrl).toBe('/local/image.jpg');
    expect(result.dataUrl).toContain('data:image/jpeg;base64');
  });

  it('should reject if image fails to load', async () => {
    let onerror;
    global.Image = class {
      constructor() {
        setTimeout(() => onerror && onerror.call(this), 10);
      }
      set onerror(fn) { onerror = fn; }
      get onerror() { return onerror; }
      set src(val) { this._src = val; }
      get src() { return this._src; }
    };
    await expect(imageToBase64('bad-url')).rejects.toThrow('Failed to load image: bad-url');
  });

  it('should handle resizing for large images', async () => {
    let onload;
    global.Image = class {
      constructor() {
        this.crossOrigin = '';
        this.width = 2000;
        this.height = 1500;
        setTimeout(() => onload && onload.call(this), 10);
      }
      set onload(fn) { onload = fn; }
      get onload() { return onload; }
      set src(val) { this._src = val; }
      get src() { return this._src; }
    };
    const result = await imageToBase64('http://example.com/large.jpg');
    expect(result.dimensions.width).toBeLessThanOrEqual(800);
    expect(result.dimensions.height).toBeLessThanOrEqual(600);
  });
});
