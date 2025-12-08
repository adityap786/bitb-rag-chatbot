import os
from typing import Any, Dict, List, Optional

# Vector store implementations should implement the BaseVectorStore interface below.
# This file provides a small Chroma-backed implementation as a scaffold.


class BaseVectorStore:
    def create_index(self, tenant_id: str, name: Optional[str] = None) -> Dict[str, Any]:
        raise NotImplementedError()

    def add_document(self, tenant_id: str, doc_id: str, content: str, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        raise NotImplementedError()

    def add_documents_batch(self, documents: List[Dict[str, Any]]) -> Dict[str, Any]:
        raise NotImplementedError()

    def delete_document(self, tenant_id: str, doc_id: str) -> Dict[str, Any]:
        raise NotImplementedError()

    def search(self, tenant_id: str, query: str, k: int = 5, hybrid: bool = False, rerank: bool = False, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        raise NotImplementedError()


class ChromaVectorStore(BaseVectorStore):
    def __init__(self):
        try:
            import chromadb
            from chromadb.config import Settings
        except Exception as e:
            raise RuntimeError("Missing chromadb dependency; install chromadb to use the Chroma backend")

        # chroma client - defaults are fine for local dev
        self.client = chromadb.Client(Settings())

    def _collection(self, tenant_id: str):
        name = f"tenant_{tenant_id}"
        return self.client.get_or_create_collection(name=name)

    def create_index(self, tenant_id: str, name: Optional[str] = None) -> Dict[str, Any]:
        col = self._collection(tenant_id)
        return {"created": True, "collection_name": col.name}

    def add_document(self, tenant_id: str, doc_id: str, content: str, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        # Embeddings are expected to be provided by the embeddings provider
        from .embeddings import EmbeddingProvider
        if not EmbeddingProvider.available():
            raise RuntimeError("Embeddings provider is not configured or available; install/configure a provider (e.g. set EMBEDDING_PROVIDER, install sentence-transformers or set OPENAI_API_KEY)")

        emb = EmbeddingProvider.get_embedding(content)
        col = self._collection(tenant_id)
        col.add(ids=[doc_id], documents=[content], metadatas=[metadata or {}], embeddings=[emb])
        return {"added": 1, "doc_id": doc_id}

    def add_documents_batch(self, documents: List[Dict[str, Any]]) -> Dict[str, Any]:
        # documents: List[ { tenant_id, doc_id, content, metadata } ]
        from .embeddings import EmbeddingProvider

        if not EmbeddingProvider.available():
            raise RuntimeError("Embeddings provider is not configured or available; install/configure a provider (e.g. set EMBEDDING_PROVIDER, install sentence-transformers or set OPENAI_API_KEY)")

        # group by tenant
        by_tenant: Dict[str, List[Dict[str, Any]]] = {}
        for d in documents:
            by_tenant.setdefault(d["tenant_id"], []).append(d)

        total = 0
        for tenant_id, docs in by_tenant.items():
            col = self._collection(tenant_id)
            texts = [d["content"] for d in docs]
            ids = [d["doc_id"] for d in docs]
            metadatas = [d.get("metadata", {}) for d in docs]
            embs = EmbeddingProvider.get_batch_embeddings(texts)
            col.add(ids=ids, documents=texts, metadatas=metadatas, embeddings=embs)
            total += len(docs)

        return {"added": total}

    def delete_document(self, tenant_id: str, doc_id: str) -> Dict[str, Any]:
        col = self._collection(tenant_id)
        col.delete(ids=[doc_id])
        return {"deleted": 1, "doc_id": doc_id}

    def search(self, tenant_id: str, query: str, k: int = 5, hybrid: bool = False, rerank: bool = False, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        from .embeddings import EmbeddingProvider
        if not EmbeddingProvider.available():
            raise RuntimeError("Embeddings provider is not configured or available; cannot perform vector search")

        emb = EmbeddingProvider.get_embedding(query)
        col = self._collection(tenant_id)
        # chroma returns dict with ids/documents/metadatas/distances
        results = col.query(query_embeddings=[emb], n_results=k, include=["documents", "metadatas", "distances", "ids"])

        hits = []
        # results fields are lists per query; we only passed one query
        for idx, doc in enumerate(results.get("documents", [[]])[0]):
            hit = {
                "id": results.get("ids", [[]])[0][idx],
                "score": results.get("distances", [[]])[0][idx],
                "document": doc,
                "metadata": results.get("metadatas", [[]])[0][idx],
            }
            hits.append(hit)

        return {"hits": hits, "total": len(hits)}


class VectorStoreFactory:
    @staticmethod
    def get_store(name: str = "chroma") -> BaseVectorStore:
        name = (name or "chroma").lower()
        if name == "chroma":
            return ChromaVectorStore()
        raise RuntimeError(f"Unknown vector store backend: {name}")
