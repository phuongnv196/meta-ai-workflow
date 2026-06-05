import { API_BASE_URL } from '../config';

/**
 * Sends a workflow execution request and processes the SSE stream.
 *
 * @param {Object} payload - { nodes, edges, targetNodeId? }
 * @param {Object} callbacks
 * @param {Function} callbacks.onWorkflowStarted  - (data) => void
 * @param {Function} callbacks.onNodeStarted      - (data) => void
 * @param {Function} callbacks.onNodeCompleted     - (data) => void
 * @param {Function} callbacks.onNodeFailed        - (data) => void
 * @param {Function} callbacks.onWorkflowCompleted - (data) => void
 * @param {Function} callbacks.onWorkflowFailed    - (data) => void
 */
export async function executeViaSSE(payload, callbacks, signal = null) {
  const response = await fetch(`${API_BASE_URL}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const segments = buffer.split('\n\n');
    buffer = segments.pop(); // keep incomplete segment in buffer

    for (const rawEvent of segments) {
      if (!rawEvent.trim()) continue;

      let eventName = '';
      let eventDataRaw = '';

      for (const line of rawEvent.split('\n')) {
        if (line.startsWith('event:')) {
          eventName = line.substring(6).trim();
        } else if (line.startsWith('data:')) {
          eventDataRaw = line.substring(5).trim();
        }
      }

      if (!eventDataRaw) continue;

      try {
        const data = JSON.parse(eventDataRaw);
        const handler = callbacks[`on${capitalize(eventName)}`];
        if (handler) handler(data);
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    }
  }
}

function capitalize(str) {
  return str
    .split('_')
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}
