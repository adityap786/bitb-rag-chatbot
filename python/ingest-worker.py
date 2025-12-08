#!/usr/bin/env python3
"""
BiTB RAG Ingestion Worker
Version: 1.0.0

This worker handles the ingestion pipeline for BiTB RAG chatbots:
1. Fetch content (crawl website or process uploaded files)
2. Extract text from various formats (HTML, PDF, DOCX, TXT)
3. Chunk text into manageable pieces (600 tokens, 100 overlap)
4. Generate embeddings using sentence-transformers (local, free)
5. Store vectors in FAISS index (per trial_token namespace)
6. Auto-purge expired trial data after 3 days

Requirements:
    pip install -r requirements.txt

Usage:
    python ingest-worker.py --job-id <job_id>

Environment Variables:
    EMBEDDING_MODE=local  # "local" or "huggingface"
    HF_API_KEY=           # Optional for HF fallback
    VECTOR_STORE=faiss    # "faiss", "pinecone", or "weaviate"
    MAX_FILE_SIZE_MB=10   # Max file size limit
    MAX_TOKENS=100000     # Max tokens per file
    CRAWL_MAX_DEPTH=3     # Max crawl depth
"""

import os
import sys
if sys.version_info >= (3, 13):
    print("WARNING: Python 3.13+ detected. Some dependencies may not be compatible. Use Python 3.11 or 3.12 for best results.")
import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from pathlib import Path
import argparse

# Text processing
import tiktoken
from bs4 import BeautifulSoup
import requests

# Document parsers
try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None

try:
    from docx import Document
except ImportError:
    Document = None

# Embeddings
try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    SentenceTransformer = None

# Vector store
try:
    import faiss
    import numpy as np
except ImportError:
    faiss = None
    np = None

# Robots.txt parser
try:
    from urllib.robotparser import RobotFileParser
except ImportError:
    RobotFileParser = None

from urllib.parse import urljoin, urlparse
from collections import deque

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
CONFIG = {
    'embedding_mode': os.getenv('EMBEDDING_MODE', 'local'),
    'hf_api_key': os.getenv('HF_API_KEY', ''),
    'vector_store': os.getenv('VECTOR_STORE', 'faiss'),
    'max_file_size_mb': int(os.getenv('MAX_FILE_SIZE_MB', '10')),
    'max_tokens': int(os.getenv('MAX_TOKENS', '100000')),
    'crawl_max_depth': int(os.getenv('CRAWL_MAX_DEPTH', '3')),
    'chunk_size': 600,
    'chunk_overlap': 100,
    'embedding_dim': 384,  # all-MiniLM-L6-v2
    'embedding_model': 'sentence-transformers/all-MiniLM-L6-v2',
    'data_dir': Path('data'),
    'faiss_dir': Path('data/faiss_indexes'),
}

# Ensure directories exist
CONFIG['faiss_dir'].mkdir(parents=True, exist_ok=True)


# =============================================================================
# Text Extraction
# =============================================================================

class TextExtractor:
    """Extract text from various file formats."""
    
    @staticmethod
    def from_html(html_content: str) -> str:
        """Extract text from HTML."""
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # Remove script and style elements
        for script in soup(["script", "style", "nav", "footer"]):
            script.decompose()
        
        # Get text
        text = soup.get_text()
        
        # Clean up whitespace
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        text = ' '.join(chunk for chunk in chunks if chunk)
        
        return text
    
    @staticmethod
    def from_pdf(file_path: str) -> str:
        """Extract text from PDF."""
        if PdfReader is None:
            raise ImportError("pypdf not installed")
        
        reader = PdfReader(file_path)
        text = []
        
        for page in reader.pages:
            text.append(page.extract_text())
        
        return '\n\n'.join(text)
    
    @staticmethod
    def from_docx(file_path: str) -> str:
        """Extract text from DOCX."""
        if Document is None:
            raise ImportError("python-docx not installed")
        
        doc = Document(file_path)
        text = []
        
        for paragraph in doc.paragraphs:
            text.append(paragraph.text)
        
        return '\n\n'.join(text)
    
    @staticmethod
    def from_txt(file_path: str) -> str:
        """Extract text from TXT."""
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()


# =============================================================================
# Web Crawler
# =============================================================================

class WebCrawler:
    """Crawl website respecting robots.txt."""
    
    def __init__(self, start_url: str, max_depth: int = 2):
        self.start_url = start_url
        self.max_depth = max_depth
        self.visited = set()
        self.base_domain = urlparse(start_url).netloc
        self.robot_parser = self._init_robots_parser()
    
    def _init_robots_parser(self) -> Optional[RobotFileParser]:
        """Initialize robots.txt parser."""
        if RobotFileParser is None:
            logger.warning("robotexclusionrulesparser not installed")
            return None
        
        try:
            rp = RobotFileParser()
            rp.set_url(f"{urlparse(self.start_url).scheme}://{self.base_domain}/robots.txt")
            rp.read()
            return rp
        except Exception as e:
            logger.error(f"Failed to read robots.txt: {e}")
            return None
    
    def can_fetch(self, url: str) -> bool:
        """Check if URL can be fetched according to robots.txt."""
        if self.robot_parser is None:
            return True
        
        try:
            return self.robot_parser.can_fetch("BiTBBot", url)
        except:
            return True
    
    def crawl(self) -> List[Dict[str, str]]:
        """Crawl website and extract content."""
        queue = deque([(self.start_url, 0)])  # (url, depth)
        pages = []
        
        while queue:
            url, depth = queue.popleft()
            
            if depth > self.max_depth:
                continue
            
            if url in self.visited:
                continue
            
            if urlparse(url).netloc != self.base_domain:
                continue
            
            if not self.can_fetch(url):
                logger.info(f"Skipping {url} (robots.txt)")
                continue
            
            try:
                logger.info(f"Crawling {url} (depth {depth})")
                response = requests.get(url, timeout=10, headers={
                    'User-Agent': 'BiTBBot/1.0'
                })
                response.raise_for_status()
                
                if 'text/html' not in response.headers.get('Content-Type', ''):
                    continue
                
                # Extract text
                text = TextExtractor.from_html(response.text)
                
                if text.strip():
                    pages.append({
                        'url': url,
                        'text': text,
                        'depth': depth
                    })
                
                self.visited.add(url)
                
                # Find links for next depth
                if depth < self.max_depth:
                    soup = BeautifulSoup(response.text, 'html.parser')
                    for link in soup.find_all('a', href=True):
                        next_url = urljoin(url, link['href'])
                        if next_url not in self.visited:
                            queue.append((next_url, depth + 1))
                
            except Exception as e:
                logger.error(f"Error crawling {url}: {e}")
        
        logger.info(f"Crawled {len(pages)} pages")
        return pages


# =============================================================================
# Text Chunking
# =============================================================================

class TextChunker:
    """Chunk text with token-based splitting."""
    
    def __init__(self, chunk_size: int = 600, overlap: int = 100):
        self.chunk_size = chunk_size
        self.overlap = overlap
        self.encoder = tiktoken.get_encoding("cl100k_base")
    
    def chunk_text(self, text: str, metadata: Dict = None) -> List[Dict]:
        """Chunk text into smaller pieces with overlap."""
        tokens = self.encoder.encode(text)
        
        if len(tokens) > CONFIG['max_tokens']:
            logger.warning(f"Text too long ({len(tokens)} tokens), truncating")
            tokens = tokens[:CONFIG['max_tokens']]
        
        chunks = []
        for i in range(0, len(tokens), self.chunk_size - self.overlap):
            chunk_tokens = tokens[i:i + self.chunk_size]
            chunk_text = self.encoder.decode(chunk_tokens)
            
            chunk_data = {
                'text': chunk_text,
                'metadata': metadata or {},
                'chunk_index': len(chunks)
            }
            chunks.append(chunk_data)
        
        return chunks


# =============================================================================
# Embedding Generation
# =============================================================================

class EmbeddingGenerator:
    """Generate embeddings using sentence-transformers or HuggingFace API."""
    
    def __init__(self, mode: str = 'local'):
        self.mode = mode
        self.model = None
        
        if mode == 'local':
            if SentenceTransformer is None:
                raise ImportError("sentence-transformers not installed")
            logger.info(f"Loading embedding model: {CONFIG['embedding_model']}")
            self.model = SentenceTransformer(CONFIG['embedding_model'])
    
    def generate(self, texts: List[str]) -> np.ndarray:
        """Generate embeddings for list of texts."""
        if self.mode == 'local':
            return self.model.encode(texts, batch_size=32, show_progress_bar=True)
        elif self.mode == 'huggingface':
            return self._generate_hf(texts)
        else:
            raise ValueError(f"Invalid embedding mode: {self.mode}")
    
    def _generate_hf(self, texts: List[str]) -> np.ndarray:
        """Generate embeddings using HuggingFace Inference API."""
        if not CONFIG['hf_api_key']:
            raise ValueError("HF_API_KEY not set")
        
        url = f"https://api-inference.huggingface.co/models/{CONFIG['embedding_model']}"
        headers = {"Authorization": f"Bearer {CONFIG['hf_api_key']}"}
        
        embeddings = []
        for text in texts:
            response = requests.post(url, headers=headers, json={"inputs": text})
            embeddings.append(response.json())
        
        return np.array(embeddings)


# =============================================================================
# FAISS Vector Store
# =============================================================================

class FAISSVectorStore:
    """Store and retrieve vectors using FAISS."""
    
    def __init__(self, trial_token: str):
        self.trial_token = trial_token
        self.index_path = CONFIG['faiss_dir'] / f"{trial_token}.index"
        self.metadata_path = CONFIG['faiss_dir'] / f"{trial_token}.json"
        self.index = None
        self.chunks = []
    
    def create_index(self, embeddings: np.ndarray, chunks: List[Dict]):
        """Create FAISS index from embeddings."""
        if faiss is None or np is None:
            raise ImportError("faiss not installed")
        
        dimension = embeddings.shape[1]
        self.index = faiss.IndexFlatL2(dimension)
        self.index.add(embeddings.astype('float32'))
        self.chunks = chunks
        
        logger.info(f"Created FAISS index with {len(chunks)} vectors")
    
    def save(self):
        """Save FAISS index and metadata to disk."""
        # Save index
        faiss.write_index(self.index, str(self.index_path))
        
        # Save metadata
        metadata = {
            'trial_token': self.trial_token,
            'chunks': self.chunks,
            'created_at': datetime.now().isoformat(),
            'expires_at': (datetime.now() + timedelta(days=3)).isoformat(),
            'chunk_count': len(self.chunks)
        }
        
        with open(self.metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        logger.info(f"Saved index to {self.index_path}")
    
    @classmethod
    def load(cls, trial_token: str):
        """Load FAISS index from disk."""
        store = cls(trial_token)
        
        if not store.index_path.exists():
            raise FileNotFoundError(f"Index not found: {store.index_path}")
        
        store.index = faiss.read_index(str(store.index_path))
        
        with open(store.metadata_path, 'r') as f:
            metadata = json.load(f)
            store.chunks = metadata['chunks']
        
        logger.info(f"Loaded index with {len(store.chunks)} vectors")
        return store
    
    def search(self, query_embedding: np.ndarray, k: int = 5) -> List[Dict]:
        """Search for similar vectors."""
        distances, indices = self.index.search(
            query_embedding.reshape(1, -1).astype('float32'), 
            k
        )
        
        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx < len(self.chunks):
                result = self.chunks[idx].copy()
                result['score'] = float(1 / (1 + dist))  # Convert distance to similarity
                results.append(result)
        
        return results


# =============================================================================
# Ingestion Pipeline
# =============================================================================

class IngestionPipeline:
    """Main ingestion pipeline."""
    
    def __init__(self, trial_token: str, data_source: Dict):
        self.trial_token = trial_token
        self.data_source = data_source
        self.chunker = TextChunker(
            chunk_size=CONFIG['chunk_size'],
            overlap=CONFIG['chunk_overlap']
        )
        self.embedder = EmbeddingGenerator(mode=CONFIG['embedding_mode'])
        self.vector_store = FAISSVectorStore(trial_token)
    
    def run(self) -> Dict:
        """Run the ingestion pipeline."""
        logger.info(f"Starting ingestion for trial {self.trial_token}")
        # Emit early progress for queue monitor
        try:
            print("PROGRESS: 5", flush=True)
        except Exception:
            pass

        try:
            # Step 1: Fetch content
            pages = self._fetch_content()
            logger.info(f"Fetched {len(pages)} pages/files")
            try:
                print(f"PROGRESS: {10 + min(20, len(pages))}", flush=True)
            except Exception:
                pass
            
            # Step 2: Chunk text
            all_chunks = []
            for page in pages:
                chunks = self.chunker.chunk_text(
                    page['text'],
                    metadata={'url': page.get('url', ''), 'source': page.get('source', '')}
                )
                all_chunks.extend(chunks)
            
            logger.info(f"Created {len(all_chunks)} chunks")
            try:
                print("PROGRESS: 40", flush=True)
            except Exception:
                pass
            
            # Step 3: Generate embeddings
            texts = [chunk['text'] for chunk in all_chunks]
            embeddings = self.embedder.generate(texts)
            try:
                print("PROGRESS: 70", flush=True)
            except Exception:
                pass
            
            # Step 4: Store in FAISS
            self.vector_store.create_index(embeddings, all_chunks)
            self.vector_store.save()
            try:
                print("PROGRESS: 90", flush=True)
            except Exception:
                pass

            # Step 5: Upload embeddings to Supabase
            try:
                import requests
                SUPABASE_URL = os.getenv('SUPABASE_URL')
                SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
                if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
                    endpoint = f"{SUPABASE_URL}/rest/v1/embeddings"
                    headers = {
                        "apikey": SUPABASE_SERVICE_ROLE_KEY,
                        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                        "Content-Type": "application/json"
                    }
                    # Prepare records
                    records = []
                    for chunk, embedding in zip(all_chunks, embeddings):
                        records.append({
                            "tenant_id": self.trial_token,  # trial_token used as tenant_id for trial
                            "trial_token": self.trial_token,
                            "content": chunk['text'],
                            "embedding": embedding.tolist(),
                            "metadata": json.dumps(chunk.get('metadata', {})),
                        })
                    # Batch insert
                    resp = requests.post(endpoint, headers=headers, data=json.dumps(records))
                    if resp.status_code not in (200, 201):
                        logger.error(f"Supabase upload failed: {resp.text}")
                    else:
                        logger.info(f"Uploaded {len(records)} embeddings to Supabase")
                else:
                    logger.warning("Supabase env vars not set, skipping upload")
            except Exception as e:
                logger.error(f"Error uploading embeddings to Supabase: {e}")

            # Final progress update
            try:
                print("PROGRESS: 100", flush=True)
            except Exception:
                pass

            return {
                'status': 'completed',
                'pages_processed': len(pages),
                'chunks_created': len(all_chunks),
                'trial_token': self.trial_token
            }
            
        except Exception as e:
            logger.error(f"Ingestion failed: {e}", exc_info=True)
            return {
                'status': 'failed',
                'error': str(e)
            }
    
    def _fetch_content(self) -> List[Dict]:
        """Fetch content based on data source type."""
        if self.data_source['type'] == 'url':
            return self._crawl_website()
        elif self.data_source['type'] == 'files':
            return self._process_files()
        else:
            raise ValueError(f"Invalid data source type: {self.data_source['type']}")
    
    def _crawl_website(self) -> List[Dict]:
        """Crawl website and extract content."""
        url = self.data_source.get('url')
        depth = self.data_source.get('crawl_depth', 2)
        
        crawler = WebCrawler(url, max_depth=depth)
        return crawler.crawl()
    
    def _process_files(self) -> List[Dict]:
        """Process uploaded files."""
        files = self.data_source.get('files', [])
        pages = []
        
        for file_path in files:
            try:
                path = Path(file_path)
                
                # Check file size
                size_mb = path.stat().st_size / (1024 * 1024)
                if size_mb > CONFIG['max_file_size_mb']:
                    logger.warning(f"File too large: {file_path} ({size_mb:.1f}MB)")
                    continue
                
                # Extract text based on extension
                ext = path.suffix.lower()
                if ext == '.pdf':
                    text = TextExtractor.from_pdf(str(path))
                elif ext == '.docx':
                    text = TextExtractor.from_docx(str(path))
                elif ext in ['.txt', '.html']:
                    text = TextExtractor.from_txt(str(path))
                else:
                    logger.warning(f"Unsupported file type: {ext}")
                    continue
                
                pages.append({
                    'text': text,
                    'source': path.name
                })
                
            except Exception as e:
                logger.error(f"Error processing {file_path}: {e}")
        
        return pages


# =============================================================================
# Auto-Purge Expired Trials
# =============================================================================

def purge_expired_trials():
    """Delete expired trial data."""
    logger.info("Checking for expired trials...")
    
    purged = 0
    for metadata_file in CONFIG['faiss_dir'].glob("*.json"):
        try:
            with open(metadata_file, 'r') as f:
                metadata = json.load(f)
            
            expires_at = datetime.fromisoformat(metadata['expires_at'])
            if datetime.now() > expires_at:
                # Delete index and metadata
                trial_token = metadata['trial_token']
                index_file = CONFIG['faiss_dir'] / f"{trial_token}.index"
                
                index_file.unlink(missing_ok=True)
                metadata_file.unlink()
                
                logger.info(f"Purged expired trial: {trial_token}")
                purged += 1
        except Exception as e:
            logger.error(f"Error purging {metadata_file}: {e}")
    
    logger.info(f"Purged {purged} expired trials")
    return purged


# =============================================================================
# CLI
# =============================================================================

def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description='BiTB Ingestion Worker')
    parser.add_argument('--job-id', type=str, help='Job ID')
    parser.add_argument('--trial-token', type=str, help='Trial token')
    parser.add_argument('--data-source-file', type=str, help='Path to data source JSON')
    parser.add_argument('--purge', action='store_true', help='Purge expired trials')
    
    args = parser.parse_args()
    
    if args.purge:
        purge_expired_trials()
        return
    
    if not args.trial_token or not args.data_source_file:
        parser.print_help()
        sys.exit(1)
    
    # Load data source
    with open(args.data_source_file, 'r') as f:
        data_source = json.load(f)
    
    # Run ingestion
    pipeline = IngestionPipeline(args.trial_token, data_source)
    result = pipeline.run()
    
    # Print result
    print(json.dumps(result, indent=2))
    
    # Exit with appropriate code
    sys.exit(0 if result['status'] == 'completed' else 1)


if __name__ == '__main__':
    main()
