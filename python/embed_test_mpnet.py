from sentence_transformers import SentenceTransformer
import numpy as np

print('Loading model: all-mpnet-base-v2')
model = SentenceTransformer('all-mpnet-base-v2')
texts = ['Hello world', 'This is a test', 'Embedding sanity check']
embs = model.encode(texts, show_progress_bar=False)
arr = np.array(embs)
print('Embeddings shape:', arr.shape)
print('First vector (first 8 values):', arr[0][:8])
