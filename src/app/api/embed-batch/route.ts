
import { NextResponse } from 'next/server';
import { pipeline } from '@xenova/transformers';

// Global extractor cache to prevent reloading model on every request
let extractor: any = null;

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { texts } = body;

        if (!Array.isArray(texts) || texts.length === 0) {
            return NextResponse.json({ error: 'Invalid input: texts must be a non-empty array' }, { status: 400 });
        }

        if (!extractor) {
            console.log('Loading embedding model (nomic-embed-text-v1.5, 768 dims)...');
            extractor = await pipeline('feature-extraction', 'nomic-ai/nomic-embed-text-v1.5', {
                quantized: true, // Use quantized model for faster inference
            });
        }

        // Generate embeddings
        const output = await extractor(texts, { pooling: 'mean', normalize: true });

        // Convert Tensor to JS array (nested array)
        const embeddings = output.tolist();

        return NextResponse.json({ embeddings });
    } catch (error: any) {
        console.error('Embedding generation failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
