import os
import json
import psycopg2
from psycopg2.extras import execute_values
from sentence_transformers import SentenceTransformer
from typing import List
from uuid import UUID

# --- CONFIG ---
DATABASE_URL = os.getenv("DATABASE_URL")  # e.g. postgres://service_role:...@host:5432/postgres
BATCH_SIZE = 16
MODEL_NAME = "nomic-ai/nomic-embed-text-v1.5"
# ----------------

model = SentenceTransformer(MODEL_NAME, trust_remote_code=True)

def fetch_rows_to_backfill(conn, limit=200):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, content, chunk_text
            FROM public.embeddings
            WHERE embedding_384 IS NOT NULL AND embedding_768 IS NULL
            ORDER BY created_at DESC
            LIMIT %s;
        """, (limit,))
        return cur.fetchall()  # list of (id, content, chunk_text)

def compute_embeddings(texts: List[str]) -> List[List[float]]:
    # model.encode returns numpy arrays; convert to list[float]
    embeddings = model.encode(texts, show_progress_bar=True, batch_size=BATCH_SIZE)
    return [emb.tolist() for emb in embeddings]

def update_rows_vector_column(conn, rows):
    """
    For tables using the 'vector' extension and a column of type vector (float4[] or vector),
    we can pass a Postgres array literal or use %s with psycopg2 and cast to vector.
    Here we update using jsonb -> to pass as array then cast to vector.
    Adjust if your column type is different.
    """
    with conn.cursor() as cur:
        for row_id, emb in rows:
            # convert to Postgres array literal of floats
            # psycopg2 will adapt Python list to array
            cur.execute("""
                UPDATE public.embeddings
                SET embedding_768 = %s::vector,
                    embedding_dim = 768,
                    embedding_model = %s
                WHERE id = %s;
            """, (emb, MODEL_NAME, str(row_id)))
    conn.commit()

def update_rows_jsonb_column(conn, rows):
    """If embedding_768 is jsonb storing an array of floats."""
    with conn.cursor() as cur:
        for row_id, emb in rows:
            cur.execute("""
                UPDATE public.embeddings
                SET embedding_768 = %s::jsonb,
                    embedding_dim = 768,
                    embedding_model = %s
                WHERE id = %s;
            """, (json.dumps(emb), MODEL_NAME, str(row_id)))
    conn.commit()

def main():
    if not DATABASE_URL:
        raise SystemExit("Set DATABASE_URL environment variable (use a service role for safety).")
    conn = psycopg2.connect(DATABASE_URL)
    try:
        to_fix = fetch_rows_to_backfill(conn, limit=200)
        if not to_fix:
            print("No rows to backfill.")
            return

        # Prepare text inputs (prefer chunk_text if present)
        id_text_pairs = []
        texts = []
        for _id, content, chunk_text in to_fix:
            text = (chunk_text or content or "")[:4096]  # optionally truncate to model token limit
            id_text_pairs.append((_id, text))
            texts.append(text)

        # compute in batches
        results = []
        for i in range(0, len(texts), BATCH_SIZE):
            batch_texts = texts[i:i+BATCH_SIZE]
            batch_ids = [id_text_pairs[j][0] for j in range(i, min(i+BATCH_SIZE, len(texts)))]
            batch_embs = compute_embeddings(batch_texts)
            # pair ids with embs
            results.extend(list(zip(batch_ids, batch_embs)))

        # Choose update method depending on your column type.
        # If embedding_768 is type 'vector' (vector extension), use update_rows_vector_column.
        # If embedding_768 is jsonb, use update_rows_jsonb_column.
        # By default, try to update vector type:
        update_rows_vector_column(conn, results)
        print(f"Updated {len(results)} rows.")

    finally:
        conn.close()

if __name__ == "__main__":
    main()
