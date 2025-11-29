"""Re-embed runner (improved)

This script scans `vector_documents` for rows missing `embedding_768`, generates
768-dim embeddings with the local `sentence-transformers` model (via
`ingest_worker.EmbeddingGenerator`), and upserts the embedding into Supabase
(`vector_documents.embedding_768`).

Features:
 - Batching with configurable `--batch-size`
 - Resume support via a checkpoint file
 - Retries + exponential backoff for HTTP operations
 - Optional validation RPC call after each batch

Usage:
  python reembed_runner.py --tenant tn_prioritized --batch-size 200 --resume

Requirements:
 - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in environment or `.env.local`
 - `sentence-transformers` installed for local embeddings (this repo's
   `ingest_worker.EmbeddingGenerator` will prefer a local model)

Notes:
 - This runner is focused on per-tenant backfills (pass `--tenant`).
 - For large backfills across all tenants, consider a driver that enumerates
   tenants and runs this script per-tenant to allow parallel/resumable work.
"""

import argparse
import json
import os
import sys
import time
import uuid
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv

# Local embedding generator from the ingestion worker
from ingest_worker import EmbeddingGenerator


load_dotenv('.env.local')

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment or .env.local')
    sys.exit(1)

DEFAULT_CHECKPOINT = os.path.join(os.path.dirname(__file__), 'reembed_checkpoint.json')


def load_checkpoint(path: str) -> Dict[str, Any]:
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_checkpoint(path: str, data: Dict[str, Any]):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, path)


def request_with_retries(session: requests.Session, method: str, url: str, max_retries: int = 5, backoff: float = 1.0, **kwargs) -> requests.Response:
    attempt = 0
    while True:
        try:
            resp = session.request(method, url, timeout=60, **kwargs)
        except requests.RequestException as e:
            attempt += 1
            if attempt > max_retries:
                raise
            sleep = backoff * (2 ** (attempt - 1))
            print(f'[Retry] network error: {e}; sleeping {sleep}s (attempt {attempt}/{max_retries})')
            time.sleep(sleep)
            continue

        if resp.status_code in (200, 201, 204):
            return resp

        # Retry on 429 or 5xx
        if resp.status_code >= 500 or resp.status_code == 429:
            attempt += 1
            if attempt > max_retries:
                resp.raise_for_status()
            sleep = backoff * (2 ** (attempt - 1))
            print(f'[Retry] HTTP {resp.status_code}: {resp.text[:300]}... sleeping {sleep}s (attempt {attempt}/{max_retries})')
            time.sleep(sleep)
            continue

        # Other client errors, raise
        resp.raise_for_status()


def fetch_batch(session: requests.Session, tenant: Optional[str], last_id: Optional[str], batch_size: int) -> List[Dict[str, Any]]:
    params = {
        'select': 'id,content,metadata,tenant_id',
        'embedding_768': 'is.null',
        'order': 'id.asc',
        'limit': str(batch_size)
    }
    if tenant:
        params['tenant_id'] = f'eq.{tenant}'
    if last_id:
        params['id'] = f'gt.{last_id}'

    url = f"{SUPABASE_URL}/rest/v1/vector_documents"
    resp = request_with_retries(session, 'GET', url, params=params)
    return resp.json()


def upsert_embeddings(session: requests.Session, rows: List[Dict[str, Any]]) -> Any:
    if not rows:
        return None
    url = f"{SUPABASE_URL}/rest/v1/vector_documents?on_conflict=id"
    resp = request_with_retries(session, 'POST', url, json=rows, headers={'Prefer': 'return=representation'})
    return resp.json()


def call_match_rpc(session: requests.Session, query_embedding: List[float], tenant_id: str, match_count: int = 5) -> Any:
    url = f"{SUPABASE_URL}/rest/v1/rpc/match_embeddings_by_tenant_768"
    payload = {
        'query_embedding': query_embedding,
        'match_count': match_count,
        'p_tenant_id': tenant_id
    }
    resp = request_with_retries(session, 'POST', url, json=payload)
    return resp.json()


def main():
    parser = argparse.ArgumentParser(description='Re-embed runner for embedding_768 backfill')
    parser.add_argument('--tenant', type=str, help='Tenant id to backfill (recommended)')
    parser.add_argument('--model', type=str, default='all-mpnet-base-v2', help='Embedding model name')
    parser.add_argument('--batch-size', type=int, default=200, help='Documents per batch')
    parser.add_argument('--max-rows', type=int, default=0, help='Stop after processing this many rows (0 = unlimited)')
    parser.add_argument('--checkpoint-file', type=str, default=DEFAULT_CHECKPOINT, help='Path to checkpoint file')
    parser.add_argument('--resume', action='store_true', help='Resume from checkpoint')
    parser.add_argument('--sleep', type=float, default=0.5, help='Seconds to sleep between batches')
    parser.add_argument('--validate', action='store_true', help='Call RPC to validate sample after each batch')
    parser.add_argument('--dry-run', action='store_true', help='Do not write to Supabase; just show planned actions')
    args = parser.parse_args()

    print(f'[Start] re-embed runner; tenant={args.tenant} model={args.model} batch_size={args.batch_size} checkpoint={args.checkpoint_file}')

    embedder = EmbeddingGenerator(model_name=args.model, use_hf_api=False)

    session = requests.Session()
    session.headers.update({
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json'
    })

    checkpoint = load_checkpoint(args.checkpoint_file) if args.resume else {}
    last_id = checkpoint.get(args.tenant) if args.tenant else checkpoint.get('__global_last_id')

    processed = 0

    try:
        while True:
            batch = fetch_batch(session, args.tenant, last_id, args.batch_size)
            if not batch:
                print('[Done] No more documents to process for this tenant/criteria.')
                break

            ids = [r['id'] for r in batch]
            texts = [r.get('content') or '' for r in batch]

            print(f'[Batch] Fetched {len(batch)} rows (ids {ids[0]} ... {ids[-1]})')

            if args.dry_run:
                print('[Dry-run] Would embed and upsert these ids:', ids)
                last_id = ids[-1]
                processed += len(batch)
                if args.max_rows and processed >= args.max_rows:
                    break
                time.sleep(args.sleep)
                continue

            # Generate embeddings
            embeddings = embedder.embed_batch(texts)

            # Prepare upsert payloads
            upsert_rows = []
            for i, row in enumerate(batch):
                emb = embeddings[i]
                # Convert numpy arrays to lists
                try:
                    emb_list = emb.tolist()
                except Exception:
                    emb_list = list(emb)

                upsert_rows.append({
                    'id': row['id'],
                    'tenant_id': row.get('tenant_id'),
                    'embedding_768': emb_list
                })

            # Upsert in a single batch call (on_conflict=id)
            resp = upsert_embeddings(session, upsert_rows)
            print(f'[Upsert] Updated {len(upsert_rows)} rows; response sample: {str(resp)[:300]}')

            # Optionally validate using the RPC for the first embedding
            if args.validate and batch:
                try:
                    sample_emb = embeddings[0].tolist()
                    results = call_match_rpc(session, sample_emb, batch[0].get('tenant_id'), match_count=3)
                    print('[Validate] RPC returned', len(results), 'rows')
                except Exception as e:
                    print('[Validate] RPC failed:', e)

            # Update checkpoint and counters
            last_id = ids[-1]
            if args.tenant:
                checkpoint[args.tenant] = last_id
            else:
                checkpoint['__global_last_id'] = last_id

            save_checkpoint(args.checkpoint_file, checkpoint)

            processed += len(batch)
            if args.max_rows and processed >= args.max_rows:
                print('[Stop] reached max_rows limit')
                break

            time.sleep(args.sleep)

        print(f'[Finished] Processed {processed} documents')

    except KeyboardInterrupt:
        print('[Interrupted] Saving checkpoint and exiting')
        save_checkpoint(args.checkpoint_file, checkpoint)
    except Exception as e:
        print('[Error] Exception during run:', e)
        save_checkpoint(args.checkpoint_file, checkpoint)
        raise


if __name__ == '__main__':
    main()
