"""
FastEmbed Benchmark Script for BiTB RAG Chatbot
Compares FastEmbed vs sentence-transformers performance
"""

import time
import numpy as np
from typing import List, Tuple

# Try importing both libraries
try:
    from fastembed import TextEmbedding
    HAS_FASTEMBED = True
except ImportError:
    print("[Error] FastEmbed not installed. Run: pip install fastembed")
    HAS_FASTEMBED = False

try:
    from sentence_transformers import SentenceTransformer
    HAS_SENTENCE_TRANSFORMERS = True
except ImportError:
    print("[Error] sentence-transformers not installed. Run: pip install sentence-transformers")
    HAS_SENTENCE_TRANSFORMERS = False

# ============================================================================
# Test Data Generation
# ============================================================================

def generate_test_texts(count: int = 1000, avg_length: int = 300) -> List[str]:
    """Generate synthetic test texts simulating document chunks"""
    texts = []
    for i in range(count):
        # Simulate varied text lengths
        length = int(avg_length * (0.5 + np.random.random()))
        text = f"This is test document chunk {i}. " * (length // 30)
        texts.append(text[:length])
    return texts


# ============================================================================
# Benchmarking Functions
# ============================================================================

def benchmark_fastembed(
    texts: List[str],
    model_name: str = "BAAI/bge-small-en-v1.5",
    batch_size: int = 32
) -> Tuple[np.ndarray, float]:
    """Benchmark FastEmbed performance"""
    if not HAS_FASTEMBED:
        raise RuntimeError("FastEmbed not available")
    
    print(f"\n{'='*60}")
    print(f"FastEmbed Benchmark: {model_name}")
    print(f"{'='*60}")
    
    # Initialize model (measure init time)
    init_start = time.time()
    model = TextEmbedding(model_name)
    init_time = time.time() - init_start
    print(f"Model initialization: {init_time:.2f}s")
    
    # Warmup run
    print("Warming up...")
    list(model.embed(texts[:10], batch_size=batch_size))
    
    # Actual benchmark
    print(f"Encoding {len(texts)} texts with batch_size={batch_size}...")
    start = time.time()
    embeddings = list(model.embed(texts, batch_size=batch_size))
    embeddings = np.array(embeddings)
    elapsed = time.time() - start
    
    print(f"✓ Completed in {elapsed:.2f}s")
    print(f"  - Throughput: {len(texts)/elapsed:.1f} texts/sec")
    print(f"  - Latency: {elapsed/len(texts)*1000:.2f}ms per text")
    print(f"  - Embedding shape: {embeddings.shape}")
    
    return embeddings, elapsed


def benchmark_sentence_transformers(
    texts: List[str],
    model_name: str = "all-MiniLM-L6-v2",
    batch_size: int = 32
) -> Tuple[np.ndarray, float]:
    """Benchmark sentence-transformers performance"""
    if not HAS_SENTENCE_TRANSFORMERS:
        raise RuntimeError("sentence-transformers not available")
    
    print(f"\n{'='*60}")
    print(f"sentence-transformers Benchmark: {model_name}")
    print(f"{'='*60}")
    
    # Initialize model (measure init time)
    init_start = time.time()
    model = SentenceTransformer(model_name)
    init_time = time.time() - init_start
    print(f"Model initialization: {init_time:.2f}s")
    
    # Warmup run
    print("Warming up...")
    model.encode(texts[:10], batch_size=batch_size, show_progress_bar=False)
    
    # Actual benchmark
    print(f"Encoding {len(texts)} texts with batch_size={batch_size}...")
    start = time.time()
    embeddings = model.encode(texts, batch_size=batch_size, show_progress_bar=False)
    elapsed = time.time() - start
    
    print(f"✓ Completed in {elapsed:.2f}s")
    print(f"  - Throughput: {len(texts)/elapsed:.1f} texts/sec")
    print(f"  - Latency: {elapsed/len(texts)*1000:.2f}ms per text")
    print(f"  - Embedding shape: {embeddings.shape}")
    
    return embeddings, elapsed


def compare_embeddings(emb1: np.ndarray, emb2: np.ndarray, sample_size: int = 100):
    """Compare embedding similarity between two models"""
    from sklearn.metrics.pairwise import cosine_similarity
    
    print(f"\n{'='*60}")
    print(f"Embedding Compatibility Analysis")
    print(f"{'='*60}")
    
    # Sample random indices
    indices = np.random.choice(len(emb1), min(sample_size, len(emb1)), replace=False)
    
    similarities = []
    for idx in indices:
        sim = cosine_similarity([emb1[idx]], [emb2[idx]])[0][0]
        similarities.append(sim)
    
    similarities = np.array(similarities)
    
    print(f"Sample size: {len(similarities)}")
    print(f"Mean cosine similarity: {similarities.mean():.6f}")
    print(f"Std deviation: {similarities.std():.6f}")
    print(f"Min similarity: {similarities.min():.6f}")
    print(f"Max similarity: {similarities.max():.6f}")
    
    if similarities.mean() > 0.99:
        print("✓ Embeddings are highly compatible (>0.99 similarity)")
    elif similarities.mean() > 0.95:
        print("⚠ Embeddings are mostly compatible (>0.95 similarity)")
    else:
        print("✗ Embeddings differ significantly (<0.95 similarity)")
    
    return similarities


# ============================================================================
# Main Benchmark
# ============================================================================

def main():
    print("="*60)
    print("BiTB RAG Chatbot - FastEmbed Benchmark")
    print("="*60)
    
    # Configuration
    TEST_SIZE = 1000
    BATCH_SIZE = 32
    FASTEMBED_MODEL = "BAAI/bge-small-en-v1.5"
    SENTENCE_TRANSFORMERS_MODEL = "all-MiniLM-L6-v2"
    
    # Check dependencies
    if not HAS_FASTEMBED or not HAS_SENTENCE_TRANSFORMERS:
        print("\nError: Missing dependencies")
        print("Install with: pip install fastembed sentence-transformers scikit-learn")
        return 1
    
    # Generate test data
    print(f"\nGenerating {TEST_SIZE} test texts...")
    texts = generate_test_texts(TEST_SIZE)
    print(f"✓ Generated {len(texts)} texts (avg {np.mean([len(t) for t in texts]):.0f} chars)")
    
    # Benchmark FastEmbed
    fe_embeddings, fe_time = benchmark_fastembed(texts, FASTEMBED_MODEL, BATCH_SIZE)
    
    # Benchmark sentence-transformers
    st_embeddings, st_time = benchmark_sentence_transformers(
        texts, SENTENCE_TRANSFORMERS_MODEL, BATCH_SIZE
    )
    
    # Compare performance
    print(f"\n{'='*60}")
    print("Performance Comparison")
    print(f"{'='*60}")
    print(f"FastEmbed time: {fe_time:.2f}s")
    print(f"sentence-transformers time: {st_time:.2f}s")
    print(f"Speedup: {st_time/fe_time:.2f}x faster")
    
    speedup_pct = ((st_time - fe_time) / st_time) * 100
    print(f"Performance improvement: {speedup_pct:.1f}%")
    
    # Compare embeddings (if dimensions match)
    if fe_embeddings.shape[1] == st_embeddings.shape[1]:
        compare_embeddings(fe_embeddings, st_embeddings)
    else:
        print(f"\n⚠ Cannot compare embeddings: dimension mismatch")
        print(f"  FastEmbed: {fe_embeddings.shape}")
        print(f"  sentence-transformers: {st_embeddings.shape}")
    
    # Final recommendation
    print(f"\n{'='*60}")
    print("Recommendation")
    print(f"{'='*60}")
    if st_time / fe_time > 2.0:
        print("✓ FastEmbed provides significant performance improvement (>2x)")
        print("  Recommend migration to FastEmbed for production")
    elif st_time / fe_time > 1.5:
        print("✓ FastEmbed provides moderate performance improvement (>1.5x)")
        print("  Consider migration based on scale and throughput needs")
    else:
        print("⚠ Performance improvement is marginal (<1.5x)")
        print("  Migration may not be worth the effort")
    
    print(f"\nBenchmark complete!")
    return 0


if __name__ == "__main__":
    exit(main())
