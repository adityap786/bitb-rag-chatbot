from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional


class IngestDocument(BaseModel):
    tenant_id: str = Field(..., description="Tenant identifier (e.g. tn_abc123)")
    doc_id: str = Field(..., description="Document identifier")
    content: str = Field(..., description="Raw document text")
    metadata: Optional[Dict[str, Any]] = None


class BatchIngestRequest(BaseModel):
    documents: List[IngestDocument]


class CreateIndexRequest(BaseModel):
    tenant_id: str
    name: Optional[str] = None
    backend: Optional[str] = None


class DeleteDocRequest(BaseModel):
    tenant_id: str
    doc_id: str


class SearchRequest(BaseModel):
    tenant_id: str
    query: str
    k: int = 5
    hybrid: bool = False
    rerank: bool = False
    filters: Optional[Dict[str, Any]] = None


class SearchHit(BaseModel):
    id: str
    score: float
    document: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class SearchResponse(BaseModel):
    hits: List[SearchHit]
    total: int


class EmbeddingsBatchRequest(BaseModel):
    texts: List[str]
    model: Optional[str] = None
    provider: Optional[str] = None
    batch_size: Optional[int] = None


class EmbeddingsBatchResponse(BaseModel):
    embeddings: List[List[float]]
    cached: Optional[List[bool]] = None
