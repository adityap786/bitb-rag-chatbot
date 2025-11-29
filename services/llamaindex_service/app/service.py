from typing import List, Dict, Any, Optional
import os

from .vector_store import VectorStoreFactory


class ServiceManager:
    """
    Thin service manager that delegates to a configured vector store backend.

    The actual vector store implementations live in `vector_store.py`. This wrapper
    provides a single entrypoint the FastAPI app can call.
    """

    def __init__(self):
        backend = os.getenv("INDEX_BACKEND", "chroma")
        self.store = VectorStoreFactory.get_store(backend)

    def create_index(self, tenant_id: str, name: Optional[str] = None) -> Dict[str, Any]:
        return self.store.create_index(tenant_id, name=name)

    def ingest_document(self, tenant_id: str, doc_id: str, content: str, metadata: Dict[str, Any] | None = None) -> Dict[str, Any]:
        return self.store.add_document(tenant_id, doc_id, content, metadata)

    def ingest_batch(self, documents: List[Dict[str, Any]]) -> Dict[str, Any]:
        return self.store.add_documents_batch(documents)

    def delete_document(self, tenant_id: str, doc_id: str) -> Dict[str, Any]:
        return self.store.delete_document(tenant_id, doc_id)

    def search(self, tenant_id: str, query: str, k: int = 5, hybrid: bool = False, rerank: bool = False, filters: Dict[str, Any] | None = None) -> Dict[str, Any]:
        return self.store.search(tenant_id, query, k=k, hybrid=hybrid, rerank=rerank, filters=filters)
