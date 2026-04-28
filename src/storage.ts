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
	embedding: null;
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

	private async write(records: DeletionRecord[]): Promise<void> {
		if (!await this.vault.adapter.exists(STORAGE_DIR)) {
			await this.vault.adapter.mkdir(STORAGE_DIR);
		}
		await this.vault.adapter.write(STORAGE_FILE, JSON.stringify(records, null, 2));
	}
}
