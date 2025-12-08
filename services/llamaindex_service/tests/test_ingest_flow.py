import pytest
from fastapi.testclient import TestClient
from app.main import app

def test_ingest_and_chunking_flow():
    client = TestClient(app)
    doc = {
        "tenant_id": "tn_example",
        "doc_id": "doc1",
        "content": "abcdefghijklmnopqrstuvwxyz0123456789",
        "metadata": {"title": "TestDoc"}
    }
    # Default: chunking enabled
    resp = client.post("/ingest", json=doc)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    # Opt-out chunking
    resp2 = client.post("/ingest?chunk=false", json=doc)
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["success"] is True
