export interface PlaybookEntry {
  id: string;
  title: string;
  source: string;
  content: string;
}

export interface PlaybookSearchResult {
  entry: PlaybookEntry;
  chunk: string;
  score: number;
  keyword: number;
  semantic: number;
}

export declare const playbookEntries: PlaybookEntry[];
export declare function getPlaybookEntries(): PlaybookEntry[];
export declare function getPlaybookChunks(): string[];
export declare function getPlaybookEmbeddings(): number[][];
export declare function reviewPlaybookOutput(): {
  entries: PlaybookEntry[];
  chunks: string[];
  embeddings: number[][];
};
export declare function searchPlaybook(query: string, topK?: number): PlaybookSearchResult[];
