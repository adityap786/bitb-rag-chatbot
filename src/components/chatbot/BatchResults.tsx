'use client';

import React from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Clock, Zap, FileText, CheckCircle2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface BatchQueryResult {
  query: string;
  answer: string;
  sources?: Array<{
    content: string;
    metadata?: Record<string, any>;
  }>;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  cached: boolean;
}

interface BatchResultsProps {
  results: BatchQueryResult[];
  totalTokens: number;
  totalLatencyMs: number;
  aggregated: boolean;
}

export const BatchResults: React.FC<BatchResultsProps> = ({
  results,
  totalTokens,
  totalLatencyMs,
  aggregated,
}) => {
  const averageLatency = Math.round(totalLatencyMs / results.length);

  return (
    <div className="space-y-4 w-full">
      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span>Batch Results ({results.length} questions)</span>
            </div>
            {aggregated && (
              <Badge variant="secondary" className="ml-2">
                <Zap className="h-3 w-3 mr-1" />
                Aggregated
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Total Time</span>
              </div>
              <div className="text-2xl font-bold">
                {(totalLatencyMs / 1000).toFixed(2)}s
              </div>
              <div className="text-xs text-muted-foreground">
                Avg: {(averageLatency / 1000).toFixed(2)}s per question
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Zap className="h-4 w-4" />
                <span>Tokens Used</span>
              </div>
              <div className="text-2xl font-bold">{totalTokens.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">
                Avg: {Math.round(totalTokens / results.length)} per question
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>Sources</span>
              </div>
              <div className="text-2xl font-bold">
                {results.reduce((sum, r) => sum + (r.sources?.length || 0), 0)}
              </div>
              <div className="text-xs text-muted-foreground">
                Total references retrieved
              </div>
            </div>
          </div>

          {aggregated && (
            <div className="mt-4 p-3 bg-green-50 dark:bg-green-950 rounded-md text-sm">
              <span className="font-medium text-green-700 dark:text-green-400">
                ✨ Smart Aggregation:
              </span>
              <span className="text-green-600 dark:text-green-500 ml-2">
                Questions processed in a single LLM call, saving ~{Math.round((results.length - 1) * averageLatency / 1000)}s
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Accordion */}
      <Accordion type="single" collapsible className="w-full space-y-2">
        {results.map((result, index) => (
          <AccordionItem key={index} value={`item-${index}`} className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-start gap-3 text-left w-full">
                <Badge variant="outline" className="mt-1 shrink-0">
                  Q{index + 1}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="font-medium line-clamp-2">{result.query}</div>
                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{result.usage.totalTokens} tokens</span>
                    <span>{(result.latencyMs / 1000).toFixed(2)}s</span>
                    {result.cached && <Badge variant="secondary" className="text-xs">Cached</Badge>}
                  </div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 pt-2">
                {/* Answer */}
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{result.answer}</ReactMarkdown>
                </div>

                {/* Sources */}
                {result.sources && result.sources.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">
                      Sources ({result.sources.length})
                    </div>
                    <div className="space-y-2">
                      {result.sources.map((source, sourceIdx) => (
                        <Card key={sourceIdx} className="bg-muted/50">
                          <CardContent className="p-3">
                            <div className="text-xs text-muted-foreground line-clamp-3">
                              {source.content}
                            </div>
                            {source.metadata && (
                              <div className="flex gap-2 mt-2 flex-wrap">
                                {source.metadata.source && (
                                  <Badge variant="outline" className="text-xs">
                                    {source.metadata.source}
                                  </Badge>
                                )}
                                {source.metadata.page && (
                                  <Badge variant="outline" className="text-xs">
                                    Page {source.metadata.page}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Token Breakdown */}
                <div className="pt-2 border-t">
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div className="flex justify-between">
                      <span>Prompt tokens:</span>
                      <span className="font-mono">{result.usage.promptTokens}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Completion tokens:</span>
                      <span className="font-mono">{result.usage.completionTokens}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>Total:</span>
                      <span className="font-mono">{result.usage.totalTokens}</span>
                    </div>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};

interface BatchProgressProps {
  currentQuery: number;
  totalQueries: number;
  currentQueryText?: string;
}

export const BatchProgress: React.FC<BatchProgressProps> = ({
  currentQuery,
  totalQueries,
  currentQueryText,
}) => {
  const progress = (currentQuery / totalQueries) * 100;

  return (
    <Card className="w-full">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-sm font-medium">
              Processing batch query...
            </div>
            <div className="text-xs text-muted-foreground">
              Question {currentQuery} of {totalQueries}
            </div>
          </div>
          <div className="text-2xl font-bold text-primary">
            {Math.round(progress)}%
          </div>
        </div>

        <Progress value={progress} className="h-2" />

        {currentQueryText && (
          <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-md">
            <span className="font-medium">Current: </span>
            <span className="line-clamp-2">{currentQueryText}</span>
          </div>
        )}

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
          <span>Intelligent aggregation in progress...</span>
        </div>
      </CardContent>
    </Card>
  );
};
