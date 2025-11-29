import os
import sys
import importlib
import types


# Ensure the service package (app/) is importable when tests run from the tests/ dir
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

embeddings = importlib.import_module("app.embeddings")


class FakeRedisClient:
    def __init__(self):
        self.store = {}

    def get(self, key):
        return self.store.get(key)

    def setex(self, key, ttl, val):
        self.store[key] = val


def test_get_batch_embeddings_caches_and_deduplicates(monkeypatch):
    """Verify deduplication, caching (Redis), and batching behavior for local provider."""
    # Reset provider internals to avoid leaking state between tests
    embeddings.EmbeddingProvider._redis = None
    embeddings.EmbeddingProvider._lru = None

    # Provide a fake redis module that returns our FakeRedisClient
    fake_redis_instance = FakeRedisClient()
    fake_redis_module = types.SimpleNamespace(from_url=lambda url, decode_responses=True: fake_redis_instance)
    monkeypatch.setattr(embeddings, "redis_lib", fake_redis_module, raising=False)

    # Configure env for local provider and a model name (use an open-source HF model name)
    monkeypatch.setenv("EMBEDDING_PROVIDER", "local")
    monkeypatch.setenv("EMBEDDING_MODEL", "all-mpnet-base-v2")
    monkeypatch.setenv("EMBEDDING_CACHE_REDIS_URL", "redis://fake")

    # Track how many texts were actually sent to the embedding implementation
    call_count = {"n": 0}

    def fake_embed_local_batch(cls, texts, model_name, batch_size):
        # Each call increments by number of texts embedded
        call_count["n"] += len(texts)
        # return a deterministic embedding for each text (list of floats)
        return [[float(len(t))] for t in texts]

    # Patch the internal local embedder implementation (avoid installing heavy deps)
    monkeypatch.setattr(embeddings.EmbeddingProvider, "_embed_local_batch", classmethod(fake_embed_local_batch), raising=False)

    texts = ["hello world", "hello world", "open-source model"]

    # First call should compute embeddings for 2 unique texts
    res1 = embeddings.EmbeddingProvider.get_batch_embeddings(texts, provider="local", model="all-mpnet-base-v2", batch_size=16)
    assert len(res1) == 3
    assert res1[0] == res1[1]
    assert res1[0] != res1[2]
    assert call_count["n"] == 2

    # Check keys were cached in FakeRedis
    k0 = embeddings.EmbeddingProvider._hash_key("hello world", "all-mpnet-base-v2", "local")
    k1 = embeddings.EmbeddingProvider._hash_key("open-source model", "all-mpnet-base-v2", "local")
    assert fake_redis_instance.get(k0) is not None
    assert fake_redis_instance.get(k1) is not None

    # Second call should hit cache: no additional embedding computation
    res2 = embeddings.EmbeddingProvider.get_batch_embeddings(texts, provider="local", model="all-mpnet-base-v2", batch_size=16)
    assert call_count["n"] == 2
    assert res2 == res1
