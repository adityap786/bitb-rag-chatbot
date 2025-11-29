from typing import List, Tuple


def split_text_to_chunks(text: str, chunk_size: int = 1000, overlap: int = 200) -> List[Tuple[str, int]]:
    """
    Split text into chunks with overlap.
    Returns a list of tuples (chunk_text, start_offset).
    """
    if not text:
        return []

    if chunk_size <= 0:
        raise ValueError("chunk_size must be > 0")

    if overlap >= chunk_size:
        overlap = int(chunk_size / 10)

    chunks: List[Tuple[str, int]] = []
    start = 0
    text_len = len(text)

    while start < text_len:
        end = start + chunk_size
        chunk = text[start:end]
        chunks.append((chunk, start))
        if end >= text_len:
            break
        start = max(0, end - overlap)

    return chunks


def chunk_document_payloads(tenant_id: str, doc_id: str, content: str, metadata: dict = None, chunk_size: int = 1000, overlap: int = 200) -> List[dict]:
    """
    Given a document, produce a list of payloads suitable for `ingest/batch` where each
    payload has: tenant_id, doc_id (chunked id), content (chunk text), metadata (including parent_doc_id, chunk_index, offset).
    """
    chunks = split_text_to_chunks(content, chunk_size=chunk_size, overlap=overlap)
    payloads = []
    for i, (chunk_text, offset) in enumerate(chunks):
        chunk_doc_id = f"{doc_id}::chunk::{i}"
        md = dict(metadata or {})
        md.update({
            "parent_doc_id": doc_id,
            "chunk_index": i,
            "chunk_offset": offset,
            "chunk_length": len(chunk_text),
        })
        payloads.append({
            "tenant_id": tenant_id,
            "doc_id": chunk_doc_id,
            "content": chunk_text,
            "metadata": md,
        })
    return payloads
