"""
BiTB Ingestion Worker - Crawl, Chunk, Embed & Index
Version: 2.0.0

This worker handles:
- Website crawling (respects robots.txt)
- Content extraction and cleaning
- Text chunking (~600 tokens, 100 overlap)
- Embedding generation (sentence-transformers local or HF API)
- FAISS vector storage
- Preview mode support for bitb.ltd

Usage:
    python ingest_worker.py --url https://bitb.ltd --token preview --depth 2
    python ingest_worker.py --files doc1.pdf doc2.txt --token tr_abc123
"""

import os
import sys
import json
import time
import hashlib
import argparse
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, asdict
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

# Core dependencies
import requests
from bs4 import BeautifulSoup
import numpy as np
import faiss

# Embedding - sentence-transformers (local) or HF API (fallback)
try:
    from sentence_transformers import SentenceTransformer
    HAS_LOCAL_EMBEDDINGS = True
except ImportError:
    print("[Warning] sentence-transformers not installed. Will use HF API fallback.")
    HAS_LOCAL_EMBEDDINGS = False

# Document parsing
try:
    import PyPDF2
    from docx import Document
    HAS_DOC_PARSING = True
except ImportError:
    print("[Warning] PyPDF2 or python-docx not installed. PDF/DOCX parsing disabled.")
    HAS_DOC_PARSING = False


# =============================================================================
# Configuration
# =============================================================================

@dataclass
class IngestConfig:
    """Configuration for ingestion job"""
    trial_token: str
    source_type: str  # 'url' or 'files'
    source_url: Optional[str] = None
    source_files: Optional[List[str]] = None
    crawl_depth: int = 2
    max_pages: int = 50
    chunk_size: int = 600  # tokens
    chunk_overlap: int = 100
    embedding_model: str = "all-MiniLM-L6-v2"
    use_hf_api: bool = False
    hf_api_key: Optional[str] = None
    faiss_index_path: str = "./data/faiss_indices"


# =============================================================================
# Website Crawler
# =============================================================================

class WebsiteCrawler:
    """Crawls websites respecting robots.txt"""
    
    def __init__(self, base_url: str, max_depth: int = 2, max_pages: int = 50):
        self.base_url = base_url
        self.max_depth = max_depth
        self.max_pages = max_pages
        self.visited = set()
        self.robot_parser = RobotFileParser()
        
        # Initialize robots.txt parser
        try:
            robots_url = urljoin(base_url, '/robots.txt')
            self.robot_parser.set_url(robots_url)
            self.robot_parser.read()
        except Exception as e:
            print(f"[Warning] Could not read robots.txt: {e}")
    
    def can_fetch(self, url: str) -> bool:
        """Check if URL can be fetched according to robots.txt"""
        try:
            return self.robot_parser.can_fetch("BitBBot", url)
        except:
            return True  # If error, allow fetch
    
    def is_same_domain(self, url: str) -> bool:
        """Check if URL belongs to same domain"""
        base_domain = urlparse(self.base_url).netloc
        url_domain = urlparse(url).netloc
        return base_domain == url_domain
    
    def extract_links(self, html: str, current_url: str) -> List[str]:
        """Extract all valid links from HTML"""
        soup = BeautifulSoup(html, 'html.parser')
        links = []
        
        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href']
            absolute_url = urljoin(current_url, href)
            
            # Filter valid links
            if (self.is_same_domain(absolute_url) and 
                absolute_url.startswith('http') and
                '#' not in absolute_url.split('/')[-1]):
                links.append(absolute_url)
        
        return list(set(links))  # Remove duplicates
    
    def extract_text(self, html: str) -> str:
        """Extract main content text from HTML"""
        soup = BeautifulSoup(html, 'html.parser')
        
        # Remove script and style elements
        for script in soup(["script", "style", "nav", "footer", "header"]):
            script.decompose()
        
        # Try to find main content area
        main_content = (
            soup.find('main') or 
            soup.find('article') or 
            soup.find('div', class_='content') or 
            soup.find('body')
        )
        
        if main_content:
            text = main_content.get_text(separator='\n', strip=True)
        else:
            text = soup.get_text(separator='\n', strip=True)
        
        # Clean up whitespace
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        return '\n'.join(lines)
    
    def crawl(self) -> List[Dict]:
        """Crawl website and return list of page data"""
        to_visit = [(self.base_url, 0)]  # (url, depth)
        crawled_pages = []
        
        while to_visit and len(crawled_pages) < self.max_pages:
            url, depth = to_visit.pop(0)
            
            # Skip if already visited or max depth exceeded
            if url in self.visited or depth > self.max_depth:
                continue
            
            # Check robots.txt
            if not self.can_fetch(url):
                print(f"[Skip] Robots.txt disallows: {url}")
                continue
            
            self.visited.add(url)
            
            try:
                print(f"[Crawl] {url} (depth: {depth})")
                response = requests.get(url, timeout=10, headers={
                    'User-Agent': 'BitBBot/2.0 (+https://bitb.ltd)'
                })
                
                if response.status_code != 200:
                    continue
                
                html = response.text
                text = self.extract_text(html)
                
                # Store page data
                if text and len(text) > 100:  # Minimum content threshold
                    crawled_pages.append({
                        'url': url,
                        'title': self._extract_title(html),
                        'text': text,
                        'depth': depth,
                        'timestamp': int(time.time())
                    })
                
                # Extract links for next level
                if depth < self.max_depth:
                    links = self.extract_links(html, url)
                    for link in links:
                        if link not in self.visited:
                            to_visit.append((link, depth + 1))
                
                # Rate limiting
                time.sleep(0.5)
                
            except Exception as e:
                print(f"[Error] Failed to crawl {url}: {e}")
                continue
        
        print(f"[Done] Crawled {len(crawled_pages)} pages")
        return crawled_pages
    
    def _extract_title(self, html: str) -> str:
        """Extract page title"""
        soup = BeautifulSoup(html, 'html.parser')
        title_tag = soup.find('title')
        return title_tag.get_text().strip() if title_tag else 'Untitled'


# =============================================================================
# Text Chunking
# =============================================================================

class TextChunker:
    """Chunks text into overlapping segments"""
    
    def __init__(self, chunk_size: int = 600, overlap: int = 100):
        self.chunk_size = chunk_size
        self.overlap = overlap
    
    def chunk_text(self, text: str, source_url: str, metadata: Dict = None) -> List[Dict]:
        """Split text into chunks with metadata"""
        # Simple word-based chunking (approximates tokens)
        words = text.split()
        chunks = []
        
        for i in range(0, len(words), self.chunk_size - self.overlap):
            chunk_words = words[i:i + self.chunk_size]
            chunk_text = ' '.join(chunk_words)
            
            if len(chunk_words) < 50:  # Skip very small chunks
                continue
            
            chunk_id = hashlib.md5(f"{source_url}:{i}".encode()).hexdigest()
            
            chunks.append({
                'id': chunk_id,
                'text': chunk_text,
                'source_url': source_url,
                'chunk_index': len(chunks),
                'metadata': metadata or {}
            })
        
        return chunks


# =============================================================================
# Embedding Generator
# =============================================================================

class EmbeddingGenerator:
    """Generate embeddings using local model or HF API"""
    
    def __init__(self, model_name: str = "all-MiniLM-L6-v2", use_hf_api: bool = False, hf_api_key: Optional[str] = None):
        self.model_name = model_name
        self.use_hf_api = use_hf_api
        self.hf_api_key = hf_api_key or os.getenv('HF_API_KEY')
        
        if not use_hf_api and HAS_LOCAL_EMBEDDINGS:
            print(f"[Embeddings] Loading local model: {model_name}")
            self.model = SentenceTransformer(model_name)
        elif use_hf_api and self.hf_api_key:
            print(f"[Embeddings] Using HuggingFace API")
            self.model = None
        else:
            raise ValueError("No embedding method available. Install sentence-transformers or provide HF_API_KEY")
    
    def embed_batch(self, texts: List[str]) -> np.ndarray:
        """Generate embeddings for a batch of texts"""
        if self.model:
            # Local embedding
            embeddings = self.model.encode(texts, show_progress_bar=True)
            return embeddings
        else:
            # HF API embedding
            return self._embed_via_hf_api(texts)
    
    def _embed_via_hf_api(self, texts: List[str]) -> np.ndarray:
        """Generate embeddings via HuggingFace API"""
        api_url = f"https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/{self.model_name}"
        headers = {"Authorization": f"Bearer {self.hf_api_key}"}
        
        embeddings = []
        for text in texts:
            response = requests.post(api_url, headers=headers, json={"inputs": text})
            if response.status_code == 200:
                embedding = np.array(response.json())
                embeddings.append(embedding.mean(axis=0))  # Average pooling
            else:
                print(f"[Error] HF API failed: {response.status_code}")
                embeddings.append(np.zeros(384))  # Fallback
            time.sleep(0.1)  # Rate limiting
        
        return np.array(embeddings)


# =============================================================================
# FAISS Index Manager
# =============================================================================

class FAISSIndexManager:
    """Manage FAISS vector indices"""
    
    def __init__(self, base_path: str = "./data/faiss_indices"):
        self.base_path = base_path
        os.makedirs(base_path, exist_ok=True)
    
    def create_index(self, trial_token: str, dimension: int = 384) -> Tuple[faiss.Index, str]:
        """Create a new FAISS index"""
        index = faiss.IndexFlatL2(dimension)
        index_path = os.path.join(self.base_path, f"{trial_token}.index")
        return index, index_path
    
    def save_index(self, index: faiss.Index, index_path: str, metadata: List[Dict]):
        """Save FAISS index and metadata to disk"""
        faiss.write_index(index, index_path)
        
        metadata_path = index_path.replace('.index', '.metadata.json')
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        print(f"[Saved] Index: {index_path}")
        print(f"[Saved] Metadata: {metadata_path}")
    
    def load_index(self, trial_token: str) -> Tuple[Optional[faiss.Index], Optional[List[Dict]]]:
        """Load existing FAISS index and metadata"""
        index_path = os.path.join(self.base_path, f"{trial_token}.index")
        metadata_path = index_path.replace('.index', '.metadata.json')
        
        if not os.path.exists(index_path):
            return None, None
        
        index = faiss.read_index(index_path)
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)
        
        return index, metadata
    
    def search(self, index: faiss.Index, metadata: List[Dict], query_embedding: np.ndarray, k: int = 6) -> List[Dict]:
        """Search index for similar vectors"""
        query_embedding = query_embedding.reshape(1, -1).astype('float32')
        distances, indices = index.search(query_embedding, k)
        
        results = []
        for i, idx in enumerate(indices[0]):
            if idx < len(metadata):
                result = metadata[idx].copy()
                result['similarity_score'] = float(1 / (1 + distances[0][i]))  # Convert distance to similarity
                results.append(result)
        
        return results


# =============================================================================
# Main Ingestion Pipeline
# =============================================================================

class IngestionPipeline:
    """Main pipeline coordinating all ingestion steps"""
    
    def __init__(self, config: IngestConfig):
        self.config = config
        self.chunker = TextChunker(config.chunk_size, config.chunk_overlap)
        self.embedder = EmbeddingGenerator(
            config.embedding_model, 
            config.use_hf_api, 
            config.hf_api_key
        )
        self.index_manager = FAISSIndexManager(config.faiss_index_path)
    
    def run(self) -> Dict:
        """Execute full ingestion pipeline"""
        print(f"\n{'='*60}")
        print(f"BiTB Ingestion Pipeline - Starting")
        print(f"Trial Token: {self.config.trial_token}")
        print(f"Source Type: {self.config.source_type}")
        print(f"{'='*60}\n")
        
        # Step 1: Gather content
        if self.config.source_type == 'url':
            pages = self._crawl_website()
        else:
            pages = self._process_files()
        
        if not pages:
            return {'status': 'failed', 'error': 'No content extracted'}
        
        # Step 2: Chunk text
        print("\n[Step 2] Chunking text...")
        all_chunks = []
        for page in pages:
            chunks = self.chunker.chunk_text(
                page['text'], 
                page['url'], 
                {'title': page.get('title', '')}
            )
            all_chunks.extend(chunks)
        
        print(f"[Done] Created {len(all_chunks)} chunks")
        
        # Step 3: Generate embeddings
        print("\n[Step 3] Generating embeddings...")
        chunk_texts = [chunk['text'] for chunk in all_chunks]
        embeddings = self.embedder.embed_batch(chunk_texts)
        print(f"[Done] Generated {embeddings.shape[0]} embeddings (dim: {embeddings.shape[1]})")
        
        # Step 4: Create FAISS index
        print("\n[Step 4] Building FAISS index...")
        index, index_path = self.index_manager.create_index(
            self.config.trial_token, 
            dimension=embeddings.shape[1]
        )
        index.add(embeddings.astype('float32'))
        
        # Prepare metadata
        for i, chunk in enumerate(all_chunks):
            chunk['embedding_index'] = i
        
        self.index_manager.save_index(index, index_path, all_chunks)
        
        # Summary
        summary = {
            'status': 'completed',
            'trial_token': self.config.trial_token,
            'source_type': self.config.source_type,
            'pages_crawled': len(pages),
            'chunks_created': len(all_chunks),
            'embeddings_generated': embeddings.shape[0],
            'index_path': index_path,
            'timestamp': int(time.time())
        }
        
        print(f"\n{'='*60}")
        print(f"Ingestion Complete!")
        print(f"Pages: {summary['pages_crawled']} | Chunks: {summary['chunks_created']}")
        print(f"Index: {index_path}")
        print(f"{'='*60}\n")
        
        return summary
    
    def _crawl_website(self) -> List[Dict]:
        """Crawl website and extract content"""
        print(f"\n[Step 1] Crawling website: {self.config.source_url}")
        crawler = WebsiteCrawler(
            self.config.source_url, 
            self.config.crawl_depth, 
            self.config.max_pages
        )
        return crawler.crawl()
    
    def _process_files(self) -> List[Dict]:
        """Process uploaded files"""
        print(f"\n[Step 1] Processing {len(self.config.source_files)} files")
        pages = []
        
        for file_path in self.config.source_files:
            try:
                if file_path.endswith('.txt'):
                    with open(file_path, 'r', encoding='utf-8') as f:
                        text = f.read()
                elif file_path.endswith('.pdf') and HAS_DOC_PARSING:
                    text = self._extract_pdf_text(file_path)
                elif file_path.endswith('.docx') and HAS_DOC_PARSING:
                    text = self._extract_docx_text(file_path)
                else:
                    print(f"[Skip] Unsupported file type: {file_path}")
                    continue
                
                pages.append({
                    'url': f"file://{file_path}",
                    'title': os.path.basename(file_path),
                    'text': text,
                    'timestamp': int(time.time())
                })
                
            except Exception as e:
                print(f"[Error] Failed to process {file_path}: {e}")
        
        return pages
    
    def _extract_pdf_text(self, file_path: str) -> str:
        """Extract text from PDF"""
        with open(file_path, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            text = '\n'.join([page.extract_text() for page in reader.pages])
        return text
    
    def _extract_docx_text(self, file_path: str) -> str:
        """Extract text from DOCX"""
        doc = Document(file_path)
        return '\n'.join([para.text for para in doc.paragraphs])


# =============================================================================
# CLI Interface
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description='BiTB Ingestion Worker')
    parser.add_argument('--url', type=str, help='Website URL to crawl')
    parser.add_argument('--files', nargs='+', help='Files to process')
    parser.add_argument('--token', type=str, required=True, help='Trial token')
    parser.add_argument('--depth', type=int, default=2, help='Crawl depth (default: 2)')
    parser.add_argument('--max-pages', type=int, default=50, help='Max pages (default: 50)')
    parser.add_argument('--use-hf-api', action='store_true', help='Use HuggingFace API instead of local model')
    parser.add_argument('--hf-api-key', type=str, help='HuggingFace API key')
    
    args = parser.parse_args()
    
    # Validate input
    if not args.url and not args.files:
        print("Error: Must provide either --url or --files")
        sys.exit(1)
    
    # Create config
    config = IngestConfig(
        trial_token=args.token,
        source_type='url' if args.url else 'files',
        source_url=args.url,
        source_files=args.files,
        crawl_depth=args.depth,
        max_pages=args.max_pages,
        use_hf_api=args.use_hf_api,
        hf_api_key=args.hf_api_key
    )
    
    # Run pipeline
    pipeline = IngestionPipeline(config)
    result = pipeline.run()
    
    # Output result
    print("\nResult JSON:")
    print(json.dumps(result, indent=2))
    
    # Save result to file
    result_path = f"./data/results/{config.trial_token}_result.json"
    os.makedirs(os.path.dirname(result_path), exist_ok=True)
    with open(result_path, 'w') as f:
        json.dump(result, f, indent=2)


if __name__ == '__main__':
    main()
