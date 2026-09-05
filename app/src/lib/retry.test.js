import { describe, it, expect, vi } from 'vitest';
import { retryClockSkew, isClockSkewError } from './retry.js';

const skew = () => new Error('JWT issued at future');
const noWait = () => Promise.resolve();

describe('isClockSkewError', () => {
  it('recognises the PostgREST message and nothing else', () => {
    expect(isClockSkewError(skew())).toBe(true);
    expect(isClockSkewError(new Error('not_found'))).toBe(false);
    expect(isClockSkewError(undefined)).toBe(false);
  });
});

describe('retryClockSkew', () => {
  it('returns the result straight away when the call succeeds', async () => {
    const fn = vi.fn().mockResolvedValue([1]);
    expect(await retryClockSkew(fn, { wait: noWait })).toEqual([1]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries after a clock-skew error and returns the later result', async () => {
    const fn = vi.fn().mockRejectedValueOnce(skew()).mockResolvedValue('ok');
    const wait = vi.fn(noWait);
    expect(await retryClockSkew(fn, { wait, delayMs: 7 })).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(7);
  });

  it('gives up after the configured retries and rethrows', async () => {
    const fn = vi.fn().mockRejectedValue(skew());
    await expect(retryClockSkew(fn, { wait: noWait, retries: 2 })).rejects.toThrow(/issued at future/);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry other errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('not_organizer'));
    await expect(retryClockSkew(fn, { wait: noWait })).rejects.toThrow('not_organizer');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
