import { App, Editor, Modal } from 'obsidian';
import { DeletionRecord, StorageManager } from './storage';
import { QueryResult, generateNames, queryDeletions, integrateIdea } from './query';

export class QueryModal extends Modal {
	private editor: Editor;
	private documentId: string;
	private storage: StorageManager;
	private apiKey: string;

	constructor(app: App, editor: Editor, documentId: string, storage: StorageManager, apiKey: string) {
		super(app);
		this.editor = editor;
		this.documentId = documentId;
		this.storage = storage;
		this.apiKey = apiKey;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.style.minWidth = '500px';

		contentEl.createEl('h2', { text: 'Deleted ideas' });

		const searchRow = contentEl.createEl('div');
		searchRow.style.cssText = 'display:flex; gap:8px; margin-bottom:12px;';

		const filterInput = searchRow.createEl('input', {
			type: 'text',
			placeholder: 'Filter by name...',
		});
		filterInput.style.cssText = 'flex:1; padding:4px;';

		const aiSearchBtn = searchRow.createEl('button', { text: 'Search with AI' });

		const listContainer = contentEl.createEl('div');
		const aiContainer = contentEl.createEl('div');
		aiContainer.style.display = 'none';

		// Load records and generate missing names
		const allRecords = await this.storage.load();
		const records = allRecords.filter(r => r.document_id === this.documentId);

		if (records.length === 0) {
			listContainer.setText('No deleted ideas captured for this document yet.');
			return;
		}

		const unnamed = records.filter(r => !r.name);
		if (unnamed.length > 0) {
			listContainer.setText('Generating idea names...');
			try {
				const names = await generateNames(unnamed, this.apiKey);
				await this.storage.updateNames(names);
				for (const r of records) {
					if (names[r.id]) r.name = names[r.id] ?? null;
				}
			} catch {
				// Fall back to showing records without names
			}
		}

		listContainer.empty();
		this.renderList(listContainer, records, filterInput);

		// Filter as user types
		filterInput.addEventListener('input', () => {
			this.renderList(listContainer, records, filterInput);
		});

		// AI search mode
		let aiMode = false;
		aiSearchBtn.addEventListener('click', async () => {
			if (!aiMode) {
				aiMode = true;
				listContainer.style.display = 'none';
				aiContainer.style.display = 'block';
				aiSearchBtn.setText('Browse all');
				filterInput.placeholder = 'What are you looking for?';
				filterInput.value = '';
				filterInput.focus();
			} else {
				aiMode = false;
				aiContainer.style.display = 'none';
				listContainer.style.display = 'block';
				aiSearchBtn.setText('Search with AI');
				filterInput.placeholder = 'Filter by name...';
				filterInput.value = '';
				this.renderList(listContainer, records, filterInput);
			}
		});

		filterInput.addEventListener('keydown', async (e) => {
			if (e.key !== 'Enter' || !aiMode) return;
			if (!filterInput.value.trim() || !this.apiKey) return;

			aiSearchBtn.disabled = true;
			aiContainer.setText('Searching...');
			try {
				const results = await queryDeletions(filterInput.value, this.documentId, this.storage, this.apiKey);
				aiContainer.empty();
				if (results.length === 0) {
					aiContainer.setText('No relevant ideas found.');
				} else {
					this.renderResults(aiContainer, results);
				}
			} catch (e) {
				aiContainer.setText(`Error: ${e instanceof Error ? e.message : String(e)}`);
			} finally {
				aiSearchBtn.disabled = false;
			}
		});

		setTimeout(() => filterInput.focus(), 50);
	}

	private renderList(container: HTMLElement, records: DeletionRecord[], filterInput: HTMLInputElement) {
		container.empty();
		const filter = filterInput.value.toLowerCase();
		const filtered = filter
			? records.filter(r => (r.name ?? r.raw_text).toLowerCase().includes(filter))
			: records;

		if (filtered.length === 0) {
			container.createEl('p', { text: 'No ideas match that filter.' }).style.color = 'var(--text-muted)';
			return;
		}

		for (const record of filtered) {
			const item = container.createEl('div');
			item.style.cssText = 'border:1px solid var(--background-modifier-border); border-radius:4px; padding:10px 12px; margin-bottom:8px; cursor:pointer;';

			const nameEl = item.createEl('div', { text: record.name ?? 'Untitled idea' });
			nameEl.style.cssText = 'font-weight:bold;';

			const details = item.createEl('div');
			details.style.display = 'none';

			const excerpt = details.createEl('p', { text: record.raw_text });
			excerpt.style.cssText = 'font-size:0.9em; color:var(--text-muted); margin:8px 0; white-space:pre-wrap;';

			const actions = details.createEl('div');
			actions.style.cssText = 'display:flex; gap:8px; margin-top:8px;';
			this.addActionButtons(actions, { summary: record.name ?? '', excerpt: record.raw_text });

			item.addEventListener('click', () => {
				const isOpen = details.style.display !== 'none';
				details.style.display = isOpen ? 'none' : 'block';
			});
		}
	}

	private renderResults(container: HTMLElement, results: QueryResult[]) {
		for (const result of results) {
			const card = container.createEl('div');
			card.style.cssText = 'border:1px solid var(--background-modifier-border); border-radius:4px; padding:12px; margin-bottom:12px;';
			card.createEl('p', { text: result.summary }).style.cssText = 'font-weight:bold; margin:0 0 8px 0;';
			card.createEl('p', { text: result.excerpt }).style.cssText = 'font-size:0.9em; color:var(--text-muted); margin:0 0 12px 0; white-space:pre-wrap;';
			const actions = card.createEl('div');
			actions.style.cssText = 'display:flex; gap:8px;';
			this.addActionButtons(actions, result);
		}
	}

	private addActionButtons(container: HTMLElement, result: QueryResult) {
		const insert = (text: string) => {
			this.editor.replaceRange(text, this.editor.getCursor());
			this.close();
		};

		container.createEl('button', { text: 'Raw excerpt' })
			.addEventListener('click', () => insert(result.excerpt));

		container.createEl('button', { text: 'Excerpt + summary' })
			.addEventListener('click', () => insert(`**${result.summary}**\n\n${result.excerpt}`));

		const integrateBtn = container.createEl('button', { text: 'Integrate at cursor' });
		integrateBtn.addEventListener('click', async () => {
			integrateBtn.disabled = true;
			integrateBtn.setText('Integrating...');
			try {
				const integrated = await integrateIdea(result, this.editor, this.apiKey);
				insert(integrated);
			} catch (e) {
				integrateBtn.disabled = false;
				integrateBtn.setText('Integrate at cursor');
				container.createEl('p', { text: `Error: ${e instanceof Error ? e.message : String(e)}` })
					.style.color = 'var(--text-error)';
			}
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
