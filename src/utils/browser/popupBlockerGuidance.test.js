import {
  getPopupGuidance,
  emitPopupBlockedEvent,
  createPopupBlockedError,
  POPUP_BLOCKED_EVENT,
  INTENT_POPUP_BLOCKED_CODE,
} from './popupBlockerGuidance';

describe('getPopupGuidance', () => {
  it('detects mobile user agents', () => {
    const result = getPopupGuidance('Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3)');
    expect(result.browser).toBe('Mobile browser');
    expect(result.steps).toContain('Open the browser menu in the address bar.');
  });

  it('detects Firefox', () => {
    const result = getPopupGuidance('Mozilla/5.0 Firefox/112.0');
    expect(result.browser).toBe('Firefox');
    expect(result.steps[0]).toMatch(/pop-up permission indicator/);
  });

  it('detects Safari (not Chrome)', () => {
    const result = getPopupGuidance('Mozilla/5.0 Safari/605.1.15');
    expect(result.browser).toBe('Safari');
    expect(result.steps[0]).toMatch(/Safari toolbar/);
  });

  it('detects Edge', () => {
    const result = getPopupGuidance('Mozilla/5.0 Edg/90.0.818.56');
    expect(result.browser).toBe('Microsoft Edge');
    expect(result.steps[0]).toMatch(/blocked pop-up icon/);
  });

  it('detects Opera', () => {
    const result = getPopupGuidance('Mozilla/5.0 OPR/76.0.4017.123');
    expect(result.browser).toBe('Opera');
    expect(result.steps[0]).toMatch(/blocked pop-up icon/);
  });

  it('defaults to Chrome-based', () => {
    const result = getPopupGuidance('Mozilla/5.0 Chrome/89.0.4389.90');
    expect(result.browser).toBe('Chrome-based browser');
    expect(result.steps[0]).toMatch(/blocked pop-up icon/);
  });
});

describe('emitPopupBlockedEvent', () => {
  let originalWindow;
  beforeEach(() => {
    originalWindow = global.window;
    global.window = {
      dispatchEvent: jest.fn(),
      CustomEvent: function (type, detail) {
        return { type, ...detail };
      },
    };
  });
  afterEach(() => {
    global.window = originalWindow;
  });

  it('dispatches a CustomEvent with correct details', () => {
    const dispatchEventMock = jest.fn();
    global.window.dispatchEvent = dispatchEventMock;
    emitPopupBlockedEvent({ authorizationUrl: 'https://test', source: 'test' });
    expect(dispatchEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: POPUP_BLOCKED_EVENT,
        detail: expect.objectContaining({
          authorizationUrl: 'https://test',
          source: 'test',
        }),
      })
    );
  });

  it('does nothing if window is undefined', () => {
    global.window = undefined;
    expect(() => emitPopupBlockedEvent()).not.toThrow();
  });
});

describe('createPopupBlockedError', () => {
  it('returns an error with the correct code and message', () => {
    const err = createPopupBlockedError('blocked!');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('blocked!');
    expect(err.code).toBe(INTENT_POPUP_BLOCKED_CODE);
  });

  it('defaults the message if not provided', () => {
    const err = createPopupBlockedError();
    expect(err.message).toMatch(/Authorization window was blocked/);
  });
});
