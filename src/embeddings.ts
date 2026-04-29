import { requestUrl } from 'obsidian';

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3';

export async function generateEmbeddings(texts: string[], apiKey: string): Promise<number[][]> {
	if (texts.length === 0) return [];

	const response = await requestUrl({
		url: VOYAGE_URL,
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			input: texts,
			model: VOYAGE_MODEL,
		}),
	});

	const data = response.json as { data: { embedding: number[]; index: number }[] };
	const sorted = [...data.data].sort((a, b) => a.index - b.index);
	return sorted.map(d => d.embedding);
}

export async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
	const result = await generateEmbeddings([text], apiKey);
	return result[0]!;
}

export function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i]! * b[i]!;
		normA += a[i]! * a[i]!;
		normB += b[i]! * b[i]!;
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	return denom === 0 ? 0 : dot / denom;
}
