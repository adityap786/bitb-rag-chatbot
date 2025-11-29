import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateEmbeddings } from '../../src/lib/trial/embeddings';
import { ExternalServiceError } from '../../src/lib/trial/errors';
import axios from 'axios';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('generateEmbeddings (BGE)', () => {
  it('returns [] for empty input', async () => {
    const res = await generateEmbeddings([]);
    expect(res).toEqual([]);
  });

  it('throws ExternalServiceError when API returns non-ok', async () => {
    vi.spyOn(axios, 'post').mockRejectedValueOnce(new Error('server error'));
    await expect(generateEmbeddings(['hi'])).rejects.toBeInstanceOf(ExternalServiceError);
  });

  it('returns embeddings on success', async () => {
    vi.spyOn(axios, 'post').mockResolvedValueOnce({
      data: { embeddings: [[1, 2, 3], [4, 5, 6]] }
    });
    const res = await generateEmbeddings(['a', 'b']);
    expect(res).toEqual([[1, 2, 3], [4, 5, 6]]);
  });

  it('returns 1024-dim embeddings from BGE', async () => {
    const fakeEmbedding = Array(1024).fill(0.5);
    vi.spyOn(axios, 'post').mockResolvedValueOnce({
      data: { embeddings: [fakeEmbedding, fakeEmbedding] }
    });
    const res = await generateEmbeddings(['foo', 'bar']);
    expect(res.length).toBe(2);
    expect(res[0]).toHaveLength(1024);
    expect(res[1]).toHaveLength(1024);
  });
});
