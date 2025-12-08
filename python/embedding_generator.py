"""
Unified Embedding Generator for BiTB RAG Chatbot
Supports FastEmbed (preferred) with fallback to sentence-transformers

Usage:
    generator = EmbeddingGenerator(model_name="BAAI/bge-small-en-v1.5")
    embeddings = generator.encode(texts, batch_size=32)
"""

import numpy as np
from typing import List, Optional
import logging

logger = logging.getLogger(__name__)

# Try importing FastEmbed
try:
    from fastembed import TextEmbedding
    HAS_FASTEMBED = True
except ImportError:
    logger.warning("FastEmbed not installed. Will use sentence-transformers fallback.")
    HAS_FASTEMBED = False

# Try importing sentence-transformers
try:
    from sentence_transformers import SentenceTransformer
    HAS_SENTENCE_TRANSFORMERS = True
except ImportError:
    logger.warning("sentence-transformers not installed.")
    HAS_SENTENCE_TRANSFORMERS = False


class EmbeddingGenerator:
    """
    Unified embedding interface supporting FastEmbed and sentence-transformers
    
    Automatically selects the best available backend:
    1. FastEmbed (preferred) - 3-5x faster
    2. sentence-transformers (fallback) - current implementation
    3. Hugging Face API (last resort) - requires API key
    """
    
    FASTEMBED_MODELS = {
        "all-MiniLM-L6-v2": "sentence-transformers/all-MiniLM-L6-v2",
        "bge-small": "BAAI/bge-small-en-v1.5",
        "bge-base": "BAAI/bge-base-en-v1.5",
        "nomic-embed": "nomic-ai/nomic-embed-text-v1",
    }
    
    def __init__(
        self,
        model_name: str = "BAAI/bge-small-en-v1.5",
        prefer_fastembed: bool = True,
        cache_dir: Optional[str] = None
    ):
        """
        Initialize embedding generator
        
        Args:
            model_name: Model identifier (FastEmbed or sentence-transformers format)
            prefer_fastembed: Try FastEmbed first if available
            cache_dir: Directory to cache models (optional)
        """
        self.model_name = model_name
        self.model = None
        self.backend = None
        self.dimensions = None
        
        # Try FastEmbed first if preferred
        if prefer_fastembed and HAS_FASTEMBED:
            try:
                self.model = TextEmbedding(
                    model_name=model_name,
                    cache_dir=cache_dir
                )
                self.backend = 'fastembed'
                # Get dimensions from first embedding
                test_embedding = list(self.model.embed(["test"], batch_size=1))[0]
                self.dimensions = len(test_embedding)
                logger.info(f"Initialized FastEmbed with model: {model_name} ({self.dimensions}-dim)")
                return
            except Exception as e:
                logger.warning(f"FastEmbed initialization failed: {e}")
        
        # Fallback to sentence-transformers
        if HAS_SENTENCE_TRANSFORMERS:
            try:
                self.model = SentenceTransformer(model_name, cache_folder=cache_dir)
                self.backend = 'sentence-transformers'
                self.dimensions = self.model.get_sentence_embedding_dimension()
                logger.info(f"Initialized sentence-transformers with model: {model_name} ({self.dimensions}-dim)")
                return
            except Exception as e:
                logger.warning(f"sentence-transformers initialization failed: {e}")
        
        # No backend available
        raise RuntimeError(
            "No embedding backend available. Install FastEmbed or sentence-transformers:\n"
            "  pip install fastembed  # Recommended\n"
            "  pip install sentence-transformers  # Fallback"
        )
    
    def encode(
        self,
        texts: List[str],
        batch_size: int = 32,
        normalize: bool = False,
        show_progress: bool = False
    ) -> np.ndarray:
        """
        Generate embeddings for a list of texts
        
        Args:
            texts: List of text strings to embed
            batch_size: Number of texts to process at once
            normalize: Whether to L2-normalize embeddings
            show_progress: Show progress bar (sentence-transformers only)
        
        Returns:
            numpy array of shape (len(texts), dimensions)
        """
        if not texts:
            return np.array([])
        
        if self.backend == 'fastembed':
            # FastEmbed returns generator, convert to array
            embeddings = list(self.model.embed(texts, batch_size=batch_size))
            embeddings = np.array(embeddings, dtype=np.float32)
            
            if normalize:
                # L2 normalization
                norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
                embeddings = embeddings / np.maximum(norms, 1e-12)
            
            return embeddings
        
        elif self.backend == 'sentence-transformers':
            # sentence-transformers
            embeddings = self.model.encode(
                texts,
                batch_size=batch_size,
                show_progress_bar=show_progress,
                normalize_embeddings=normalize,
                convert_to_numpy=True
            )
            return embeddings
        
        else:
            raise RuntimeError("No embedding backend initialized")
    
    def get_dimensions(self) -> int:
        """Get embedding dimensions"""
        return self.dimensions
    
    def get_backend(self) -> str:
        """Get active backend name"""
        return self.backend
    
    @classmethod
    def list_available_models(cls) -> List[str]:
        """List available models"""
        if HAS_FASTEMBED:
            try:
                from fastembed import TextEmbedding
                return list(TextEmbedding.list_supported_models())
            except:
                pass
        return list(cls.FASTEMBED_MODELS.values())


# ============================================================================
# Convenience functions for backward compatibility
# ============================================================================

_default_generator: Optional[EmbeddingGenerator] = None

def get_embedding_generator(
    model_name: str = "BAAI/bge-small-en-v1.5",
    cache_dir: Optional[str] = None
) -> EmbeddingGenerator:
    """Get or create default embedding generator (singleton)"""
    global _default_generator
    if _default_generator is None or _default_generator.model_name != model_name:
        _default_generator = EmbeddingGenerator(model_name, cache_dir=cache_dir)
    return _default_generator


def generate_embeddings(
    texts: List[str],
    model_name: str = "BAAI/bge-small-en-v1.5",
    batch_size: int = 32
) -> np.ndarray:
    """
    Generate embeddings (convenience function)
    
    Args:
        texts: List of text strings
        model_name: Model identifier
        batch_size: Batch size for inference
    
    Returns:
        numpy array of embeddings
    """
    generator = get_embedding_generator(model_name)
    return generator.encode(texts, batch_size=batch_size)


# ============================================================================
# Example usage
# ============================================================================

if __name__ == "__main__":
    # Example 1: Basic usage
    generator = EmbeddingGenerator(model_name="BAAI/bge-small-en-v1.5")
    texts = ["Hello world", "Embedding generation", "BiTB RAG chatbot"]
    embeddings = generator.encode(texts)
    print(f"Generated {len(embeddings)} embeddings with shape {embeddings.shape}")
    print(f"Backend: {generator.get_backend()}")
    
    # Example 2: Convenience function
    embeddings2 = generate_embeddings(texts)
    print(f"Convenience function result: {embeddings2.shape}")
    
    # Example 3: List available models
    print("\nAvailable models:")
    for model in EmbeddingGenerator.list_available_models()[:5]:
        print(f"  - {model}")
