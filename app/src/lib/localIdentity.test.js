import { describe, it, expect } from 'vitest';
import { getMyResponseId, setMyResponseId, clearMyResponseId } from './localIdentity.js';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

describe('localIdentity', () => {
  it('stores and recalls a response id per event token', () => {
    const s = fakeStorage();
    expect(getMyResponseId('tok1', s)).toBeNull();
    setMyResponseId('tok1', 'resp-a', s);
    setMyResponseId('tok2', 'resp-b', s);
    expect(getMyResponseId('tok1', s)).toBe('resp-a');
    expect(getMyResponseId('tok2', s)).toBe('resp-b');
    clearMyResponseId('tok1', s);
    expect(getMyResponseId('tok1', s)).toBeNull();
    expect(getMyResponseId('tok2', s)).toBe('resp-b');
  });

  it('survives corrupted storage', () => {
    const s = fakeStorage();
    s.setItem('gotime_my_responses', '{not json');
    expect(getMyResponseId('tok1', s)).toBeNull();
    setMyResponseId('tok1', 'resp-a', s);
    expect(getMyResponseId('tok1', s)).toBe('resp-a');
  });

  it('tolerates missing storage', () => {
    expect(getMyResponseId('tok1', null)).toBeNull();
    expect(() => setMyResponseId('tok1', 'x', null)).not.toThrow();
  });
});
