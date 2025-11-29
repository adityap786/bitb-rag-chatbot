from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .schemas import (
    IngestDocument,
    BatchIngestRequest,
    CreateIndexRequest,
    DeleteDocRequest,
    SearchRequest,
    EmbeddingsBatchRequest,
    EmbeddingsBatchResponse,
)
from .service import ServiceManager
from .chunking import chunk_document_payloads
from fastapi import Query

app = FastAPI(title="LlamaIndex Microservice (scaffold)")

# Allow local testing; tighten in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

service = ServiceManager()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ingest")
def ingest(doc: IngestDocument, chunk: bool = Query(True, description="Whether to chunk the document before ingest"), chunk_size: int = Query(1000), overlap: int = Query(200)):
    """
    Ingest a single document. By default the document will be chunked into overlapping pieces
    and the microservice will embed & store chunks in the tenant's index. Set `chunk=false`
    to store the document as a single vector (not recommended for long documents).
    """
    try:
        if chunk:
            # Split document into chunks and call batch ingest
            payloads = chunk_document_payloads(doc.tenant_id, doc.doc_id, doc.content, metadata=doc.metadata or {}, chunk_size=chunk_size, overlap=overlap)
            res = service.ingest_batch(payloads)
        else:
            res = service.ingest_document(doc.tenant_id, doc.doc_id, doc.content, doc.metadata)
        return {"success": True, "result": res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ingest/batch")
def ingest_batch(req: BatchIngestRequest):
    try:
        payloads = [d.dict() for d in req.documents]
        res = service.ingest_batch(payloads)
        return {"success": True, "result": res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/index/create")
def create_index(req: CreateIndexRequest):
    try:
        res = service.create_index(req.tenant_id, name=req.name)
        return {"success": True, "result": res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/index/update")
def update_index():
    # placeholder for reindex/update operations
    raise HTTPException(status_code=501, detail="Not implemented yet")


@app.post("/index/delete")
def delete_doc(req: DeleteDocRequest):
    try:
        res = service.delete_document(req.tenant_id, req.doc_id)
        return {"success": True, "result": res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/search")
def search(req: SearchRequest):
    try:
        res = service.search(req.tenant_id, req.query, k=req.k, hybrid=req.hybrid, rerank=req.rerank, filters=req.filters)
        return {"success": True, "result": res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/embeddings/batch")
async def embeddings_batch(req: EmbeddingsBatchRequest):
    """Return batched embeddings for a list of texts. Honors provider/model/batch_size if provided.

    This endpoint uses the internal EmbeddingProvider which supports a local sentence-transformers
    model and optional Redis caching (configure via `EMBEDDING_CACHE_REDIS_URL`).
    """
    try:
        from .embeddings import EmbeddingProvider
        provider = req.provider or None
        model = req.model or None
        batch_size = req.batch_size or None
        embeddings = await EmbeddingProvider.get_batch_embeddings_async(req.texts, provider=provider, model=model, batch_size=batch_size)
        return {"success": True, "embeddings": embeddings}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
