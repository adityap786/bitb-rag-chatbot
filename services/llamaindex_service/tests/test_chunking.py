import pytest
from app.chunking import split_text_to_chunks, chunk_document_payloads

def test_split_text_to_chunks_basic():
    text = "abcdefghijklmnopqrstuvwxyz"
    chunks = split_text_to_chunks(text, chunk_size=10, overlap=2)
    assert len(chunks) == 3
    assert chunks[0][0] == "abcdefghij"
    assert chunks[1][0] == "ijklmnopqr"
    assert chunks[2][0] == "qrstuvwxyz"
    # Check overlap and offsets
    assert chunks[1][1] == 8  # start offset
    assert chunks[2][1] == 16

def test_chunk_document_payloads_metadata():
    doc_id = "doc1"
    tenant_id = "tn"
    content = "abcdefghij" * 3  # 30 chars
    meta = {"title": "Test"}
    payloads = chunk_document_payloads(tenant_id, doc_id, content, metadata=meta, chunk_size=10, overlap=2)
    assert len(payloads) == 4
    expected_contents = ["abcdefghij", "ijabcdefgh", "ghijabcdef", "efghij"]
    for i, p in enumerate(payloads):
        assert p["tenant_id"] == tenant_id
        assert p["doc_id"] == f"{doc_id}::chunk::{i}"
        assert p["metadata"]["parent_doc_id"] == doc_id
        assert p["metadata"]["chunk_index"] == i
        assert p["metadata"]["chunk_offset"] >= 0
        assert p["metadata"]["chunk_length"] == len(p["content"])
        assert p["metadata"]["title"] == "Test"
        assert p["content"] == expected_contents[i]
