'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { X, Plus, Send } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface BatchQuery {
  id: string;
  query: string;
}

interface BatchQueryInputProps {
  onSubmit: (queries: BatchQuery[]) => void;
  isProcessing?: boolean;
  maxQueries?: number;
}

export const BatchQueryInput: React.FC<BatchQueryInputProps> = ({
  onSubmit,
  isProcessing = false,
  maxQueries = 10,
}) => {
  const [queries, setQueries] = useState<BatchQuery[]>([
    { id: crypto.randomUUID(), query: '' },
  ]);
  const [error, setError] = useState<string | null>(null);

  const addQuery = () => {
    if (queries.length >= maxQueries) {
      setError(`Maximum ${maxQueries} queries allowed per batch`);
      return;
    }
    setQueries([...queries, { id: crypto.randomUUID(), query: '' }]);
    setError(null);
  };

  const removeQuery = (id: string) => {
    if (queries.length === 1) {
      setError('At least one query is required');
      return;
    }
    setQueries(queries.filter((q) => q.id !== id));
    setError(null);
  };

  const updateQuery = (id: string, query: string) => {
    setQueries(queries.map((q) => (q.id === id ? { ...q, query } : q)));
    setError(null);
  };

  const handleSubmit = () => {
    // Validate queries
    const validQueries = queries.filter((q) => q.query.trim().length > 0);

    if (validQueries.length === 0) {
      setError('Please enter at least one question');
      return;
    }

    if (validQueries.some((q) => q.query.trim().length < 3)) {
      setError('Each question must be at least 3 characters');
      return;
    }

    setError(null);
    onSubmit(validQueries);
  };

  const validQueryCount = queries.filter((q) => q.query.trim().length > 0).length;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Batch Query Mode</span>
          <span className="text-sm font-normal text-muted-foreground">
            {validQueryCount} / {maxQueries} questions
          </span>
        </CardTitle>
        <CardDescription>
          Submit multiple questions at once and get all answers together. Faster processing through intelligent aggregation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {queries.map((q, index) => (
          <div key={q.id} className="flex gap-2 items-start">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground min-w-[20px]">
                  {index + 1}.
                </span>
                <Textarea
                  value={q.query}
                  onChange={(e) => updateQuery(q.id, e.target.value)}
                  placeholder={`Enter question ${index + 1}...`}
                  className="min-h-[60px] resize-none"
                  disabled={isProcessing}
                />
              </div>
            </div>
            {queries.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeQuery(q.id)}
                disabled={isProcessing}
                className="mt-6"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            onClick={addQuery}
            disabled={isProcessing || queries.length >= maxQueries}
            className="flex-1"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Question
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isProcessing || validQueryCount === 0}
            className="flex-1"
          >
            <Send className="h-4 w-4 mr-2" />
            {isProcessing ? 'Processing...' : `Submit ${validQueryCount} Question${validQueryCount !== 1 ? 's' : ''}`}
          </Button>
        </div>

        <div className="text-xs text-muted-foreground pt-2">
          💡 Tip: Batch mode is 3x faster for multiple related questions. Questions will be intelligently aggregated when possible.
        </div>
      </CardContent>
    </Card>
  );
};
