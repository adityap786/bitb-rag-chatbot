# BGE Embedding Service (Production)

A FastAPI-based microservice for generating embeddings using BAAI/bge-large-en-v1.5 (or any compatible SentenceTransformer model).

## Features
- **/embed**: Single string embedding
- **/embed-batch**: Batch embedding (recommended for RAG)
- **/healthz**: Health check endpoint
- **Docker-ready**: For scalable deployment
- **Configurable model**: Set `BGE_MODEL` env var

## Usage

### 1. Build and Run (Docker)
```sh
docker build -t bge-embedding-service .
docker run -p 8000:8000 --env BGE_MODEL=BAAI/bge-large-en-v1.5 bge-embedding-service
```

### 2. Local Dev
```sh
pip install fastapi uvicorn[standard] sentence-transformers
python main.py
```

### 3. API
- POST `/embed` `{ "text": "hello world" }` → `{ "embedding": [...] }`
- POST `/embed-batch` `{ "texts": ["a", "b"] }` → `{ "embeddings": [[...], [...]] }`
- GET `/healthz` → `{ "status": "ok", "model": "..." }`

## Node.js Integration
Set `BGE_EMBEDDING_SERVICE_URL` in your Node.js app (default: `http://localhost:8000`).

## Production Notes
- Use a GPU for best performance (set up CUDA drivers if needed).
- Scale with Docker/K8s as needed.
- Monitor `/healthz` for liveness/readiness.

---
MIT License
