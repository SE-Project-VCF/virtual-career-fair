import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupConsoleErrorFilter } from '../consoleErrorFilter';

describe('consoleErrorFilter', () => {
  let originalConsoleError: any;

  beforeEach(() => {
    // Save original console.error
    originalConsoleError = console.error;
    console.error = vi.fn();
  });

  afterEach(() => {
    // Restore original console.error
    console.error = originalConsoleError;
  });

  it('should suppress TensorFlow kernel registration warnings', () => {
    setupConsoleErrorFilter();

    // This should be suppressed
    console.error('Failed to register kernel already registered for backend');

    expect(console.error).not.toHaveBeenCalled();
  });

  it('should suppress wasm backend registration warnings', () => {
    setupConsoleErrorFilter();

    // This should be suppressed
    console.error('wasm backend was already registered in log.js');

    expect(console.error).not.toHaveBeenCalled();
  });

  it('should allow other error messages through', () => {
    setupConsoleErrorFilter();

    // This should pass through
    const errorMsg = 'Some other error that should be logged';
    console.error(errorMsg);

    expect(console.error).toHaveBeenCalledWith(errorMsg);
  });

  it('should handle non-string error arguments', () => {
    setupConsoleErrorFilter();

    const errorObj = new Error('Test error');
    console.error(errorObj);

    expect(console.error).toHaveBeenCalledWith(errorObj);
  });

  it('should suppress multiple TensorFlow warning patterns', () => {
    setupConsoleErrorFilter();

    const tensorflowMessages = [
      'Failed to register kernel already registered for cpu backend',
      'Cannot register for backend',
      'kernel_backend already registered',
    ];

    tensorflowMessages.forEach((msg) => {
      console.error(msg);
    });

    expect(console.error).not.toHaveBeenCalled();
  });

  it('should pass through custom errors', () => {
    setupConsoleErrorFilter();

    const customError = 'Custom application error';
    console.error(customError);

    expect(console.error).toHaveBeenCalledWith(customError);
  });
});
