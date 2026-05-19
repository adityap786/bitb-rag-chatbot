import { ragChunkingLatency, ingestionChunksCreated, ragVectorsGenerated, ragVectorsStored } from '../src/lib/monitoring/metrics';

console.log('Metrics loaded successfully');
console.log('ragChunkingLatency:', !!ragChunkingLatency);
console.log('ingestionChunksCreated:', !!ingestionChunksCreated);
console.log('ragVectorsGenerated:', !!ragVectorsGenerated);
