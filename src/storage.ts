import { Vault } from 'obsidian';

const STORAGE_DIR = '.writing-history';
const STORAGE_FILE = '.writing-history/deletions.json';

export interface DeletionRecord {
	id: string;
	raw_text: string;
	timestamp: string;
	document_id: string;
	project_id: string;
	context_before: string;
	context_after: string;
	embedding: number[] | null;
	name: string | null;
}

export class StorageManager {
	constructor(private vault: Vault) {}

	async append(record: DeletionRecord): Promise<void> {
		const records = await this.load();
		records.push(record);
		await this.write(records);
	}

	async load(): Promise<DeletionRecord[]> {
		if (!await this.vault.adapter.exists(STORAGE_FILE)) {
			return [];
		}
		const raw = await this.vault.adapter.read(STORAGE_FILE);
		return JSON.parse(raw) as DeletionRecord[];
	}

	async updateNames(updates: Record<string, string>): Promise<void> {
		const records = await this.load();
		for (const record of records) {
			if (updates[record.id]) record.name = updates[record.id] ?? null;
		}
		await this.write(records);
	}

	async updateEmbeddings(updates: Record<string, number[]>): Promise<void> {
		const records = await this.load();
		for (const record of records) {
			if (updates[record.id]) record.embedding = updates[record.id] ?? null;
		}
		await this.write(records);
	}

	private async write(records: DeletionRecord[]): Promise<void> {
		if (!await this.vault.adapter.exists(STORAGE_DIR)) {
			await this.vault.adapter.mkdir(STORAGE_DIR);
		}
		await this.vault.adapter.write(STORAGE_FILE, JSON.stringify(records, null, 2));
	}
}
