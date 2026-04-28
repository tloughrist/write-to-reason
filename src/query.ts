import Anthropic from '@anthropic-ai/sdk';
import { StorageManager } from './storage';

export async function queryDeletions(
	query: string,
	documentId: string,
	storage: StorageManager,
	apiKey: string
): Promise<string> {
	const allRecords = await storage.load();
	const records = allRecords.filter(r => r.document_id === documentId);

	if (records.length === 0) {
		return 'No deleted content found for this document.';
	}

	const deletionsText = records.map((r, i) => `
--- Deletion ${i + 1} (${r.timestamp}) ---
Context before: ${r.context_before}
Deleted text: ${r.raw_text}
Context after: ${r.context_after}
`).join('\n');

	const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

	const message = await client.messages.create({
		model: 'claude-sonnet-4-6',
		max_tokens: 1024,
		messages: [{
			role: 'user',
			content: `You are helping a writer recover ideas they deleted during drafting.

The writer is asking: "${query}"

Below are sections of text they deleted from their current document, along with surrounding context showing what came before and after each deletion.

${deletionsText}

Identify and summarize any ideas relevant to the writer's query. For each relevant idea:
1. Provide a one-sentence summary of the idea
2. Quote the most relevant excerpt from the deleted text

If nothing relevant exists, say so briefly.`
		}]
	});

	const content = message.content[0];
	return content?.type === 'text' ? content.text : 'Unexpected response format.';
}
