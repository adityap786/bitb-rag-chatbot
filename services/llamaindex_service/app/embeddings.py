import os
import hashlib
import json
from typing import List, Optional

try:
    import openai  # type: ignore
except Exception:
    openai = None


try:
    from sentence_transformers import SentenceTransformer  # type: ignore
except Exception:
    SentenceTransformer = None  # type: ignore

try:
    import redis as redis_lib  # type: ignore
except Exception:
    redis_lib = None

try:
    from cachetools import LRUCache  # type: ignore
except Exception:
    LRUCache = None  # type: ignore

try:
    from fastapi.concurrency import run_in_threadpool
except Exception:
    # minimal fallback if fastapi not installed in test env: use asyncio.to_thread/run_in_executor
    import asyncio

    def run_in_threadpool(fn, *args, **kwargs):
        return asyncio.get_event_loop().run_in_executor(None, lambda: fn(*args, **kwargs))


class EmbeddingProvider:
    """Embedding provider abstraction.

    - Supports `local` (sentence-transformers) and `openai`.
    - Optional Redis cache when `EMBEDDING_CACHE_REDIS_URL` is set.
    - Falls back to an in-process LRU cache if Redis is not configured.
    """

    _local_model: Optional[object] = None
    _redis: Optional[object] = None
    _lru: Optional[object] = None

    @classmethod
    def _get_redis(cls):
        if cls._redis is not None:
            return cls._redis
        url = os.getenv("EMBEDDING_CACHE_REDIS_URL")
        if not url or redis_lib is None:
            cls._redis = None
            return None
        try:
            cls._redis = redis_lib.from_url(url, decode_responses=True)
        except Exception:
            cls._redis = None
        return cls._redis

    @classmethod
    def _get_lru(cls):
        if cls._lru is not None:
            return cls._lru
        if LRUCache is not None:
            maxsize = int(os.getenv("EMBEDDING_LRU_MAX", "10000"))
            cls._lru = LRUCache(maxsize=maxsize)
        else:
            cls._lru = {}
        return cls._lru

    @classmethod
    def _hash_key(cls, text: str, model: Optional[str], provider: str) -> str:
        h = hashlib.sha256()
        h.update(provider.encode("utf-8"))
        h.update((model or "").encode("utf-8"))
        h.update(b"\x00")
        h.update(text.encode("utf-8"))
        return "emb:" + h.hexdigest()

    @classmethod
    def _get_cached(cls, key: str):
        r = cls._get_redis()
        if r:
            try:
                val = r.get(key)
                if val:
                    return json.loads(val)
            except Exception:
                return None
        else:
            cache = cls._get_lru()
            return cache.get(key)
        return None

    @classmethod
    def _set_cached(cls, key: str, embedding: List[float]):
        r = cls._get_redis()
        val = json.dumps(embedding)
        if r:
            try:
                ttl = int(os.getenv("EMBEDDING_CACHE_TTL", "86400"))
                r.setex(key, ttl, val)
            except Exception:
                pass
        else:
            cache = cls._get_lru()
            try:
                cache[key] = embedding
            except Exception:
                pass

    @classmethod
    def _ensure_local_model(cls, model_name: Optional[str] = None):
        if cls._local_model is not None:
            return cls._local_model
        if SentenceTransformer is None:
            raise RuntimeError("Local embedding provider is not installed (sentence-transformers not available)")
        # Default model updated to a high-quality open-source embedding model.
        # Use `EMBEDDING_MODEL` env var to override for CPU/GPU preferences.
        model_name = model_name or os.getenv("EMBEDDING_MODEL", "intfloat/e5-large-v2")
        cls._local_model = SentenceTransformer(model_name)
        return cls._local_model

    @classmethod
    def _embed_local_batch(cls, texts: List[str], model_name: Optional[str], batch_size: int) -> List[List[float]]:
        model = cls._ensure_local_model(model_name)
        embs = model.encode(texts, batch_size=batch_size, show_progress_bar=False, convert_to_numpy=True)
        return [list(map(float, e.tolist())) for e in embs]

    @classmethod
    def _embed_openai_batch(cls, texts: List[str], model_name: Optional[str]) -> List[List[float]]:
        if openai is None:
            raise RuntimeError("openai package not installed")
        openai.api_key = os.getenv("OPENAI_API_KEY")
        model = model_name or os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
        resp = openai.Embedding.create(input=texts, model=model)
        return [r["embedding"] for r in resp["data"]]

    @classmethod
    def available(cls, provider: Optional[str] = None) -> bool:
        prov = (provider or os.getenv("EMBEDDING_PROVIDER", "local")).lower()
        if prov == "openai":
            return bool(os.getenv("OPENAI_API_KEY")) and openai is not None
        if prov == "local":
            return SentenceTransformer is not None
        return False

    @classmethod
    def get_batch_embeddings(cls, texts: List[str], provider: Optional[str] = None, model: Optional[str] = None, batch_size: Optional[int] = None) -> List[List[float]]:
        """Synchronous batch embedding call with caching and deduplication."""
        if not texts:
            return []

        prov = (provider or os.getenv("EMBEDDING_PROVIDER", "local")).lower()
        model = model or os.getenv("EMBEDDING_MODEL", None)
        batch_size = int(batch_size or int(os.getenv("EMBEDDING_BATCH_SIZE", "64")))

        # Deduplicate preserving order
        uniq_map = {}
        uniq_texts = []
        indices = []
        for t in texts:
            if t not in uniq_map:
                uniq_map[t] = len(uniq_texts)
                uniq_texts.append(t)
            indices.append(uniq_map[t])

        results_by_uniq = [None] * len(uniq_texts)

        # Check cache for each unique text
        for i, t in enumerate(uniq_texts):
            key = cls._hash_key(t, model, prov)
            cached = cls._get_cached(key)
            if cached is not None:
                results_by_uniq[i] = cached

        # Build list of missing texts
        missing = []
        missing_idxs = []
        for i, v in enumerate(results_by_uniq):
            if v is None:
                missing.append(uniq_texts[i])
                missing_idxs.append(i)

        # Compute embeddings for missing in batches
        if missing:
            for i in range(0, len(missing), batch_size):
                chunk = missing[i : i + batch_size]
                if prov == "local":
                    try:
                        embs = cls._embed_local_batch(chunk, model, batch_size)
                    except Exception:
                        # fallback to openai if available
                        if openai is not None and os.getenv("OPENAI_API_KEY"):
                            embs = cls._embed_openai_batch(chunk, model)
                        else:
                            raise
                else:
                    embs = cls._embed_openai_batch(chunk, model)

                # assign and cache
                for j, emb in enumerate(embs):
                    uniq_idx = missing_idxs[i + j]
                    results_by_uniq[uniq_idx] = emb
                    key = cls._hash_key(missing[i + j], model, prov)
                    cls._set_cached(key, emb)

        # map back to original order
        final = [results_by_uniq[idx] for idx in indices]
        return final

    @classmethod
    async def get_batch_embeddings_async(cls, texts: List[str], provider: Optional[str] = None, model: Optional[str] = None, batch_size: Optional[int] = None) -> List[List[float]]:
        # run the blocking embedding work in a thread pool
        return await run_in_threadpool(cls.get_batch_embeddings, texts, provider, model, batch_size)

    @classmethod
    def get_embedding(cls, text: str, provider: Optional[str] = None, model: Optional[str] = None) -> List[float]:
        res = cls.get_batch_embeddings([text], provider=provider, model=model)
        return res[0]
