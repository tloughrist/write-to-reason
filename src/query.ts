import Anthropic from '@anthropic-ai/sdk';
import { Editor } from 'obsidian';
import { DeletionRecord, StorageManager } from './storage';
import { generateEmbedding, generateEmbeddings, cosineSimilarity } from './embeddings';
import { SearchScope } from './settings';

const TOP_N = 20;

export interface QueryResult {
	summary: string;
	excerpt: string;
}

export function filterByScope(
	records: DeletionRecord[],
	scope: SearchScope,
	documentId: string,
	projectId: string,
): DeletionRecord[] {
	if (scope === 'document') return records.filter(r => r.document_id === documentId);
	if (scope === 'project') return records.filter(r => r.project_id === projectId);
	return records;
}

async function ensureEmbeddings(
	records: DeletionRecord[],
	storage: StorageManager,
	voyageKey: string,
): Promise<DeletionRecord[]> {
	const missing = records.filter(r => !r.embedding);
	if (missing.length === 0) return records;

	const embeddings = await generateEmbeddings(missing.map(r => r.raw_text), voyageKey);
	const updates: Record<string, number[]> = {};
	missing.forEach((r, i) => {
		const e = embeddings[i];
		if (e) {
			r.embedding = e;
			updates[r.id] = e;
		}
	});
	await storage.updateEmbeddings(updates);
	return records;
}

export async function generateNames(
	records: DeletionRecord[],
	apiKey: string
): Promise<Record<string, string>> {
	if (records.length === 0) return {};

	const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
	const passages = records.map((r, i) => `Passage ${i + 1} (id: ${r.id}):\n${r.raw_text.slice(0, 300)}`).join('\n\n');

	const message = await client.messages.create({
		model: 'claude-sonnet-4-6',
		max_tokens: 512,
		messages: [{
			role: 'user',
			content: `Give each of these deleted passages a pithy 3-5 word name that captures its core idea (like "Reasons as Balance" or "Memory as Archive"). Return a JSON object mapping each passage id to its name.

${passages}

Return only valid JSON, no other text. Example: {"uuid-here": "Reasons as Balance"}`
		}]
	});

	const content = message.content[0];
	if (content?.type !== 'text') return {};

	try {
		const cleaned = content.text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
		return JSON.parse(cleaned) as Record<string, string>;
	} catch {
		return {};
	}
}

function parseResults(text: string): QueryResult[] {
	const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
	return JSON.parse(cleaned) as QueryResult[];
}

export async function queryDeletions(
	query: string,
	scope: SearchScope,
	documentId: string,
	projectId: string,
	storage: StorageManager,
	apiKey: string,
	voyageKey: string,
): Promise<QueryResult[]> {
	const allRecords = await storage.load();
	let records = filterByScope(allRecords, scope, documentId, projectId);

	if (records.length === 0) return [];

	// For non-document scope, use embeddings to retrieve top N
	if (scope !== 'document' && voyageKey) {
		records = await ensureEmbeddings(records, storage, voyageKey);
		const queryEmbedding = await generateEmbedding(query, voyageKey);
		records = records
			.filter(r => r.embedding)
			.map(r => ({ record: r, score: cosineSimilarity(queryEmbedding, r.embedding!) }))
			.sort((a, b) => b.score - a.score)
			.slice(0, TOP_N)
			.map(s => s.record);
	}

	const deletionsText = records.map((r, i) => `
--- Deletion ${i + 1} (${r.timestamp}, ${r.document_id}) ---
Context before: ${r.context_before}
Deleted text: ${r.raw_text}
Context after: ${r.context_after}
`).join('\n');

	const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

	const message = await client.messages.create({
		model: 'claude-sonnet-4-6',
		max_tokens: 2048,
		messages: [{
			role: 'user',
			content: `You are helping a writer recover ideas they deleted during drafting.

The writer is asking: "${query}"

Below are sections of text they deleted, along with surrounding context.

${deletionsText}

Return a JSON array of relevant results. Each result should have:
- "summary": one sentence describing the idea
- "excerpt": the most relevant quote from the deleted text

Return only valid JSON, no other text. Example format:
[{"summary": "...", "excerpt": "..."}]

If nothing is relevant, return an empty array: []`
		}]
	});

	const content = message.content[0];
	if (content?.type !== 'text') return [];

	try {
		return parseResults(content.text);
	} catch {
		return [];
	}
}

export async function integrateIdea(
	result: QueryResult,
	editor: Editor,
	apiKey: string
): Promise<string> {
	const cursor = editor.getCursor();
	const fullText = editor.getValue();
	const offset = editor.posToOffset(cursor);
	const contextBefore = fullText.slice(Math.max(0, offset - 500), offset);
	const contextAfter = fullText.slice(offset, Math.min(fullText.length, offset + 500));

	const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

	const message = await client.messages.create({
		model: 'claude-sonnet-4-6',
		max_tokens: 1024,
		messages: [{
			role: 'user',
			content: `You are helping a writer reintegrate a deleted idea into their document at the cursor position.

Text before cursor:
${contextBefore}

[CURSOR POSITION]

Text after cursor:
${contextAfter}

Idea to integrate:
Summary: ${result.summary}
Excerpt: ${result.excerpt}

Write a short passage that naturally integrates this idea at the cursor position, fitting the style and flow of the surrounding text. Return only the text to be inserted, nothing else.`
		}]
	});

	const content = message.content[0];
	return content?.type === 'text' ? content.text : '';
}
