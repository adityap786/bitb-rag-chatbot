import os
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from typing import List
from sentence_transformers import SentenceTransformer
import uvicorn

MODEL_NAME = os.getenv("BGE_MODEL", "BAAI/bge-large-en-v1.5")

app = FastAPI(title="BGE Embedding Service", version="1.0.0")

class EmbedRequest(BaseModel):
    text: str

class EmbedBatchRequest(BaseModel):
    texts: List[str]

class EmbedResponse(BaseModel):
    embedding: List[float]

class EmbedBatchResponse(BaseModel):
    embeddings: List[List[float]]

@app.on_event("startup")
def load_model():
    global model
    model = SentenceTransformer(MODEL_NAME)

@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest):
    try:
        emb = model.encode(req.text, show_progress_bar=False).tolist()
        return {"embedding": emb}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding failed: {str(e)}")

@app.post("/embed-batch", response_model=EmbedBatchResponse)
def embed_batch(req: EmbedBatchRequest):
    try:
        embs = model.encode(req.texts, show_progress_bar=False, batch_size=32).tolist()
        return {"embeddings": embs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch embedding failed: {str(e)}")

@app.get("/healthz")
def healthz():
    return {"status": "ok", "model": MODEL_NAME}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
