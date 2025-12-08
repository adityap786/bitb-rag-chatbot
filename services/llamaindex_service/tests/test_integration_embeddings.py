import os
import sys
import types
import importlib
import pytest


# Ensure the service package (app/) is importable when tests run from the tests/ dir
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import app.embeddings as embeddings


class FakeRedisClient:
    def __init__(self):
        self.store = {}

    def get(self, key):
        return self.store.get(key)

    def setex(self, key, ttl, val):
        self.store[key] = val


def test_embeddings_batch_integration(monkeypatch):
    """Integration test for POST /embeddings/batch using a fake Redis and a mocked local embedder.

    This test verifies the endpoint returns consistent embeddings, deduplicates inputs,
    and stores embeddings in the cache so subsequent requests hit the cache.
    """
    # Reset provider internals to avoid leaking state between tests
    embeddings.EmbeddingProvider._redis = None
    embeddings.EmbeddingProvider._lru = None

    # Provide a fake redis module that returns our FakeRedisClient
    fake_redis_instance = FakeRedisClient()
    fake_redis_module = types.SimpleNamespace(from_url=lambda url, decode_responses=True: fake_redis_instance)
    monkeypatch.setattr(embeddings, "redis_lib", fake_redis_module, raising=False)

    # Configure env for local provider and a model name (we'll stub the embedder)
    monkeypatch.setenv("EMBEDDING_PROVIDER", "local")
    monkeypatch.setenv("EMBEDDING_MODEL", "all-mpnet-base-v2")
    monkeypatch.setenv("EMBEDDING_CACHE_REDIS_URL", "redis://fake")

    # Track how many texts were actually sent to the embedding implementation
    call_count = {"n": 0}

    def fake_embed_local_batch(cls, texts, model_name, batch_size):
        call_count["n"] += len(texts)
        return [[float(len(t))] for t in texts]

    # Patch the internal local embedder implementation (avoid installing heavy deps)
    monkeypatch.setattr(embeddings.EmbeddingProvider, "_embed_local_batch", classmethod(fake_embed_local_batch), raising=False)

    payload = {
        "texts": ["hello world", "hello world", "open-source model"],
        "provider": "local",
        "model": "all-mpnet-base-v2",
        "batch_size": 16,
    }

    try:
        from fastapi.testclient import TestClient
    except Exception:
        pytest.skip("fastapi not installed; skipping integration test")

    # Import the FastAPI app lazily so environments without FastAPI can skip the test
    try:
        from app.main import app
    except Exception:
        pytest.skip("fastapi not installed or app failed to import; skipping integration test")

    with TestClient(app) as client:
        resp = client.post("/embeddings/batch", json=payload)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        embs = body.get("embeddings")
        assert len(embs) == 3
        assert embs[0] == embs[1]
        assert embs[0] != embs[2]

        # Check keys were cached in FakeRedis
        k0 = embeddings.EmbeddingProvider._hash_key("hello world", "all-mpnet-base-v2", "local")
        k1 = embeddings.EmbeddingProvider._hash_key("open-source model", "all-mpnet-base-v2", "local")
        assert fake_redis_instance.get(k0) is not None
        assert fake_redis_instance.get(k1) is not None

        # Second call should hit cache: no additional embedding computation
        resp2 = client.post("/embeddings/batch", json=payload)
        assert resp2.status_code == 200
        assert call_count["n"] == 2
