/**
 * Suppress TensorFlow kernel registration warnings that don't affect functionality
 * These errors occur when TensorFlow libraries are loaded for features we're not using
 */
export function setupConsoleErrorFilter() {
  // Store the original console.error
  const originalError = console.error;

  // Override console.error to filter out benign TensorFlow warnings
  (console as any).error = function (...args: any[]) {
    const message = args[0]?.toString?.() || '';

    // Suppress TensorFlow kernel registration warnings
    // These are safe to ignore and don't affect functionality
    if (
      message.includes('kernel') &&
      (message.includes('already registered') || message.includes('backend'))
    ) {
      // Silently ignore these specific warnings
      return;
    }

    // Also suppress the "wasm backend was already registered" log message from log.js
    if (message.includes('wasm backend was already registered')) {
      return;
    }

    // Call the original console.error for all other errors
    originalError.apply(console, args);
  };
}
