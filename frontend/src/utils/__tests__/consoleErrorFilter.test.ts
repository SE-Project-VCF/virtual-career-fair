import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupConsoleErrorFilter } from '../consoleErrorFilter';

describe('consoleErrorFilter', () => {
  let originalConsoleError: typeof console.error;
  let errorSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalConsoleError = console.error;
    errorSpy = vi.fn();
    console.error = errorSpy;
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('should suppress TensorFlow kernel registration warnings', () => {
    setupConsoleErrorFilter();

    console.error('Failed to register kernel already registered for backend');

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('should suppress wasm backend registration warnings', () => {
    setupConsoleErrorFilter();

    console.error('wasm backend was already registered in log.js');

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('should allow other error messages through', () => {
    setupConsoleErrorFilter();

    const errorMsg = 'Some other error that should be logged';
    console.error(errorMsg);

    expect(errorSpy).toHaveBeenCalledWith(errorMsg);
  });

  it('should handle non-string error arguments', () => {
    setupConsoleErrorFilter();

    const errorObj = new Error('Test error');
    console.error(errorObj);

    expect(errorSpy).toHaveBeenCalledWith(errorObj);
  });

  it('should suppress multiple TensorFlow warning patterns', () => {
    setupConsoleErrorFilter();

    const tensorflowMessages = [
      'Failed to register kernel already registered for cpu backend',
      'Cannot register kernel for wasm backend',
      'kernel_backend already registered',
    ];

    tensorflowMessages.forEach((msg) => {
      console.error(msg);
    });

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('should pass through custom errors', () => {
    setupConsoleErrorFilter();

    const customError = 'Custom application error';
    console.error(customError);

    expect(errorSpy).toHaveBeenCalledWith(customError);
  });
});
