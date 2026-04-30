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

export interface RelatedItem<T> {
	item: T;
	similarity: number;
}

export function findRelated<T extends { id: string; embedding: number[] | null }>(
	target: T,
	candidates: T[],
	topN: number,
	threshold: number,
): RelatedItem<T>[] {
	if (!target.embedding) return [];
	const scored: RelatedItem<T>[] = [];
	for (const candidate of candidates) {
		if (candidate.id === target.id || !candidate.embedding) continue;
		const sim = cosineSimilarity(target.embedding, candidate.embedding);
		if (sim >= threshold) scored.push({ item: candidate, similarity: sim });
	}
	return scored.sort((a, b) => b.similarity - a.similarity).slice(0, topN);
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
