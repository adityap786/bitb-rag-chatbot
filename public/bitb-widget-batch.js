/**
 * BiTB Widget Batch Mode Extension
 * Add this script after bitb-widget.js to enable batch query functionality
 * 
 * Usage:
 * <script src="bitb-widget.js" data-trial-token="your_token"></script>
 * <script src="bitb-widget-batch.js"></script>
 */

(function() {
  'use strict';

  if (typeof window === 'undefined' || !window.BitBWidget) {
    console.warn('[BiTB Batch] Main widget not found. Load bitb-widget.js first.');
    return;
  }

  const originalWidget = window.BitBWidget;
  
  // Add batch mode state
  const batchState = {
    mode: 'single', // 'single' or 'batch'
    queries: [],
    results: null,
    isProcessing: false,
  };

  /**
   * Send batch queries to the API
   */
  async function submitBatchQueries(queries, trialToken, sessionId) {
    if (!queries || queries.length === 0) return null;

    try {
      const response = await fetch(`${originalWidget.config.apiBaseUrl}/api/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenant_id: originalWidget.tenantId || 'trial',
          trial_token: trialToken,
          batch: true,
          queries: queries.map(q => ({ query: q })),
          sessionId: sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Handle SSE streaming if available
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        return await handleBatchSSE(response);
      }

      // Regular JSON response
      return await response.json();
    } catch (error) {
      console.error('[BiTB Batch] Error:', error);
      return {
        results: queries.map(q => ({
          query: q,
          answer: 'Error processing query. Please try again.',
          sources: [],
          usage: { totalTokens: 0 },
          latencyMs: 0,
        })),
        totalTokens: 0,
        totalLatencyMs: 0,
        aggregated: false,
      };
    }
  }

  /**
   * Handle Server-Sent Events for progress updates
   */
  async function handleBatchSSE(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastData = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.progress) {
              updateBatchProgress(data.progress.current, data.progress.total, data.progress.query);
            } else if (data.results) {
              lastData = data;
            }
          } catch (e) {
            console.error('[BiTB Batch] SSE parse error:', e);
          }
        }
      }
    }

    return lastData;
  }

  /**
   * Update progress indicator in UI
   */
  function updateBatchProgress(current, total, query) {
    const progressEl = document.getElementById('bitb-batch-progress');
    if (!progressEl) return;

    const percentage = Math.round((current / total) * 100);
    progressEl.innerHTML = `
      <div style="padding: 1rem; background: rgba(15,23,42,0.8); border-radius: 0.75rem;">
        <div style="font-size: 0.875rem; margin-bottom: 0.5rem; color: #e2e8f0;">
          Processing question ${current} of ${total}...
        </div>
        <div style="height: 0.5rem; background: rgba(100,116,139,0.3); border-radius: 999px; overflow: hidden;">
          <div style="height: 100%; background: linear-gradient(90deg, #38bdf8, #6366f1); width: ${percentage}%; transition: width 0.3s ease;"></div>
        </div>
        ${query ? `<div style="font-size: 0.75rem; margin-top: 0.5rem; color: rgba(148,163,184,0.8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${query}</div>` : ''}
      </div>
    `;
  }

  /**
   * Render batch results in accordion
   */
  function renderBatchResults(results, totalTokens, totalLatencyMs, aggregated) {
    const container = document.getElementById('bitb-batch-results');
    if (!container) return;

    const html = `
      <div style="padding: 1rem; max-height: 400px; overflow-y: auto;">
        <!-- Summary -->
        <div style="background: rgba(15,23,42,0.8); border-radius: 0.75rem; padding: 1rem; margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
            <span style="font-size: 0.875rem; color: #94a3b8;">Total Time:</span>
            <span style="font-weight: 600;">${(totalLatencyMs / 1000).toFixed(2)}s</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
            <span style="font-size: 0.875rem; color: #94a3b8;">Tokens Used:</span>
            <span style="font-weight: 600;">${totalTokens.toLocaleString()}</span>
          </div>
          ${aggregated ? '<div style="font-size: 0.75rem; color: #10b981; margin-top: 0.5rem;">✨ Smart aggregation used</div>' : ''}
        </div>

        <!-- Results -->
        ${results.map((result, idx) => `
          <details style="background: rgba(15,23,42,0.6); border-radius: 0.75rem; padding: 0.75rem; margin-bottom: 0.5rem;">
            <summary style="cursor: pointer; font-weight: 500; font-size: 0.9rem; padding: 0.25rem;">
              Q${idx + 1}: ${escapeHtml(result.query)}
              <span style="font-size: 0.75rem; color: #94a3b8; margin-left: 0.5rem;">${result.usage.totalTokens} tokens</span>
            </summary>
            <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(148,163,184,0.12); font-size: 0.875rem; line-height: 1.6;">
              ${escapeHtml(result.answer)}
            </div>
            ${result.sources && result.sources.length > 0 ? `
              <div style="margin-top: 0.75rem; font-size: 0.75rem;">
                <div style="color: #94a3b8; margin-bottom: 0.5rem;">Sources:</div>
                ${result.sources.map(s => `
                  <div style="background: rgba(100,116,139,0.2); padding: 0.5rem; border-radius: 0.5rem; margin-bottom: 0.25rem;">
                    ${escapeHtml(s.content.substring(0, 100))}...
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </details>
        `).join('')}

        <button 
          id="bitb-new-batch-btn"
          style="width: 100%; padding: 0.75rem; background: rgba(56,189,248,0.15); border: 1px solid rgba(56,189,248,0.3); color: #38bdf8; border-radius: 0.75rem; cursor: pointer; margin-top: 1rem; font-size: 0.875rem; font-weight: 500;"
          onmouseover="this.style.background='rgba(56,189,248,0.25)'"
          onmouseout="this.style.background='rgba(56,189,248,0.15)'"
        >
          New Batch Query
        </button>
      </div>
    `;

    container.innerHTML = html;

    // Attach event listener
    document.getElementById('bitb-new-batch-btn')?.addEventListener('click', () => {
      batchState.results = null;
      renderBatchInput();
    });
  }

  /**
   * Render batch input UI
   */
  function renderBatchInput() {
    const container = document.getElementById('bitb-batch-input');
    if (!container) return;

    if (!batchState.queries.length) {
      batchState.queries = [''];
    }

    const html = `
      <div style="padding: 1rem;">
        <div style="font-size: 0.875rem; color: #94a3b8; margin-bottom: 1rem;">
          Submit multiple questions at once (max 10)
        </div>
        
        ${batchState.queries.map((q, idx) => `
          <div style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem;">
            <span style="color: #64748b; min-width: 1.5rem; padding-top: 0.5rem;">${idx + 1}.</span>
            <textarea 
              id="bitb-batch-q-${idx}"
              placeholder="Enter question ${idx + 1}..."
              style="flex: 1; min-height: 3rem; padding: 0.5rem 0.75rem; background: rgba(15,23,42,0.8); border: 1px solid rgba(148,163,184,0.2); border-radius: 0.5rem; color: #fff; font-size: 0.875rem; resize: vertical;"
            >${escapeHtml(q)}</textarea>
            ${batchState.queries.length > 1 ? `
              <button 
                onclick="window.BitBBatch.removeQuery(${idx})"
                style="width: 2rem; height: 2rem; background: transparent; border: 1px solid rgba(148,163,184,0.2); border-radius: 0.5rem; color: #94a3b8; cursor: pointer; margin-top: 0.5rem;"
              >×</button>
            ` : ''}
          </div>
        `).join('')}

        <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
          <button 
            onclick="window.BitBBatch.addQuery()"
            ${batchState.queries.length >= 10 ? 'disabled' : ''}
            style="flex: 1; padding: 0.625rem; background: rgba(100,116,139,0.2); border: 1px solid rgba(148,163,184,0.2); color: #e2e8f0; border-radius: 0.5rem; cursor: pointer; font-size: 0.875rem;"
          >
            + Add Question
          </button>
          <button 
            onclick="window.BitBBatch.submitBatch()"
            style="flex: 1; padding: 0.625rem; background: linear-gradient(135deg, #38bdf8, #6366f1); border: none; color: #fff; border-radius: 0.5rem; cursor: pointer; font-weight: 500; font-size: 0.875rem;"
          >
            Submit ${batchState.queries.filter(q => q.trim()).length} Question${batchState.queries.filter(q => q.trim()).length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Attach listeners to textareas
    batchState.queries.forEach((_, idx) => {
      const textarea = document.getElementById(`bitb-batch-q-${idx}`);
      if (textarea) {
        textarea.addEventListener('input', (e) => {
          batchState.queries[idx] = e.target.value;
        });
      }
    });
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Public API
  window.BitBBatch = {
    addQuery() {
      if (batchState.queries.length >= 10) return;
      batchState.queries.push('');
      renderBatchInput();
    },

    removeQuery(idx) {
      if (batchState.queries.length <= 1) return;
      batchState.queries.splice(idx, 1);
      renderBatchInput();
    },

    async submitBatch() {
      const validQueries = batchState.queries.filter(q => q.trim().length > 0);
      if (validQueries.length === 0) {
        alert('Please enter at least one question');
        return;
      }

      batchState.isProcessing = true;
      document.getElementById('bitb-batch-input').innerHTML = '<div id="bitb-batch-progress"></div>';
      
      const results = await submitBatchQueries(
        validQueries,
        originalWidget.config?.trialToken,
        originalWidget.sessionId || `session_${Date.now()}`
      );

      if (results) {
        batchState.results = results;
        document.getElementById('bitb-batch-results').style.display = 'block';
        renderBatchResults(results.results, results.totalTokens, results.totalLatencyMs, results.aggregated);
      }

      batchState.isProcessing = false;
    },

    toggleMode(mode) {
      batchState.mode = mode;
      if (mode === 'batch') {
        document.getElementById('bitb-single-input')?.style.display = 'none';
        document.getElementById('bitb-batch-container')?.style.display = 'block';
        renderBatchInput();
      } else {
        document.getElementById('bitb-single-input')?.style.display = 'block';
        document.getElementById('bitb-batch-container')?.style.display = 'none';
      }
    },
  };

  console.log('[BiTB Batch] Extension loaded successfully');
})();
