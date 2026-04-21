import { ProjectXError, toErrorMessage } from '../src/projectx/errors';

describe('project x sdk helpers', () => {
  it('keeps project x error codes', () => {
    const error = new ProjectXError('session_error', 'session failed');
    expect(error.code).toBe('session_error');
    expect(error.message).toBe('session failed');
  });

  it('normalizes unknown values into a fallback message', () => {
    expect(toErrorMessage('boom', 'fallback')).toBe('fallback');
    expect(toErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
  });
});
