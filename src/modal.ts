import { App, Editor, Modal } from 'obsidian';
import { DeletionRecord, StorageManager } from './storage';
import { QueryResult, filterByScope, generateNames, queryDeletions, integrateIdea } from './query';
import { SearchScope } from './settings';
import { findRelated, RelatedItem } from './embeddings';

const RELATED_TOP_N = 3;
const RELATED_THRESHOLD = 0.65;

export class QueryModal extends Modal {
	private editor: Editor;
	private documentId: string;
	private projectId: string;
	private storage: StorageManager;
	private apiKey: string;
	private voyageKey: string;
	private searchScope: SearchScope;
	private cardElements: Map<string, { item: HTMLElement; details: HTMLElement }> = new Map();

	constructor(
		app: App,
		editor: Editor,
		documentId: string,
		projectId: string,
		storage: StorageManager,
		apiKey: string,
		voyageKey: string,
		defaultScope: SearchScope,
	) {
		super(app);
		this.editor = editor;
		this.documentId = documentId;
		this.projectId = projectId;
		this.storage = storage;
		this.apiKey = apiKey;
		this.voyageKey = voyageKey;
		this.searchScope = defaultScope;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.style.minWidth = '500px';

		contentEl.createEl('h2', { text: 'Deleted ideas' });

		const controls = contentEl.createEl('div');
		controls.style.cssText = 'display:flex; gap:8px; margin-bottom:12px; align-items:center;';

		const filterInput = controls.createEl('input', {
			type: 'text',
			placeholder: 'Filter by name...',
		});
		filterInput.style.cssText = 'flex:1; padding:4px;';

		const scopeSelect = controls.createEl('select');
		const caretSvg = "<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path d='M2 3.5l3 3 3-3' fill='none' stroke='%23888' stroke-width='1.5'/></svg>";
		scopeSelect.style.cssText = `
			padding: 4px 24px 4px 8px;
			appearance: none;
			-webkit-appearance: none;
			background-image: url("data:image/svg+xml;utf8,${caretSvg}");
			background-repeat: no-repeat;
			background-position: right 8px center;
			background-color: var(--background-primary);
			border: 1px solid var(--background-modifier-border);
			border-radius: 4px;
		`;
		const opts: [SearchScope, string][] = [
			['document', 'This document'],
			['project', 'This project'],
			['vault', 'Entire vault'],
		];
		for (const [value, label] of opts) {
			const opt = scopeSelect.createEl('option', { text: label });
			opt.value = value;
		}
		scopeSelect.value = this.searchScope;

		const aiSearchBtn = controls.createEl('button', { text: 'Search with AI' });

		const listContainer = contentEl.createEl('div');
		const aiContainer = contentEl.createEl('div');
		aiContainer.style.display = 'none';

		const allRecords = await this.storage.load();

		const refreshList = async () => {
			const scopedRecords = filterByScope(allRecords, this.searchScope, this.documentId, this.projectId);

			if (scopedRecords.length === 0) {
				listContainer.empty();
				listContainer.setText('No deleted ideas captured at this scope yet.');
				return;
			}

			const unnamed = scopedRecords.filter(r => !r.name);
			if (unnamed.length > 0) {
				listContainer.setText('Generating idea names...');
				try {
					const names = await generateNames(unnamed, this.apiKey);
					await this.storage.updateNames(names);
					for (const r of scopedRecords) {
						if (names[r.id]) r.name = names[r.id] ?? null;
					}
				} catch {
					// Fall back to showing records without names
				}
			}

			listContainer.empty();
			this.renderList(listContainer, scopedRecords, filterInput);
		};

		await refreshList();

		filterInput.addEventListener('input', () => {
			if (aiContainer.style.display === 'none') {
				const scopedRecords = filterByScope(allRecords, this.searchScope, this.documentId, this.projectId);
				this.renderList(listContainer, scopedRecords, filterInput);
			}
		});

		scopeSelect.addEventListener('change', async () => {
			this.searchScope = scopeSelect.value as SearchScope;
			if (aiContainer.style.display === 'none') {
				await refreshList();
			}
		});

		let aiMode = false;
		aiSearchBtn.addEventListener('click', () => {
			aiMode = !aiMode;
			if (aiMode) {
				listContainer.style.display = 'none';
				aiContainer.style.display = 'block';
				aiSearchBtn.setText('Browse all');
				filterInput.placeholder = 'What are you looking for? (Enter to search)';
				filterInput.value = '';
				filterInput.focus();
			} else {
				aiContainer.style.display = 'none';
				listContainer.style.display = 'block';
				aiSearchBtn.setText('Search with AI');
				filterInput.placeholder = 'Filter by name...';
				filterInput.value = '';
				const scopedRecords = filterByScope(allRecords, this.searchScope, this.documentId, this.projectId);
				this.renderList(listContainer, scopedRecords, filterInput);
			}
		});

		filterInput.addEventListener('keydown', async (e) => {
			if (e.key !== 'Enter' || !aiMode) return;
			if (!filterInput.value.trim() || !this.apiKey) return;
			if (this.searchScope !== 'document' && !this.voyageKey) {
				aiContainer.setText('Cross-document search requires a Voyage AI API key. Add one in plugin settings.');
				return;
			}

			aiSearchBtn.disabled = true;
			aiContainer.setText('Searching...');
			try {
				const results = await queryDeletions(
					filterInput.value, this.searchScope, this.documentId, this.projectId,
					this.storage, this.apiKey, this.voyageKey,
				);
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
		this.cardElements.clear();

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
			nameEl.style.fontWeight = 'bold';

			if (this.searchScope !== 'document') {
				const meta = item.createEl('div', { text: record.document_id });
				meta.style.cssText = 'font-size:0.8em; color:var(--text-muted); margin-top:2px;';
			}

			const details = item.createEl('div');
			details.style.display = 'none';

			const excerpt = details.createEl('p', { text: record.raw_text });
			excerpt.style.cssText = 'font-size:0.9em; color:var(--text-muted); margin:8px 0; white-space:pre-wrap;';

			const actions = details.createEl('div');
			actions.style.cssText = 'display:flex; gap:8px; margin-top:8px;';
			this.addActionButtons(actions, { summary: record.name ?? '', excerpt: record.raw_text });

			const related = findRelated(record, records, RELATED_TOP_N, RELATED_THRESHOLD);
			if (related.length > 0) this.renderRelatedLinks(details, related);

			item.addEventListener('click', () => {
				const isOpen = details.style.display !== 'none';
				details.style.display = isOpen ? 'none' : 'block';
			});

			this.cardElements.set(record.id, { item, details });
		}
	}

	private renderRelatedLinks(container: HTMLElement, related: RelatedItem<DeletionRecord>[]) {
		const wrap = container.createEl('div');
		wrap.style.cssText = 'margin-top:12px; padding-top:8px; border-top:1px dashed var(--background-modifier-border); font-size:0.85em;';
		const label = wrap.createSpan({ text: 'Related: ' });
		label.style.color = 'var(--text-muted)';

		related.forEach((rel, i) => {
			if (i > 0) wrap.createSpan({ text: ', ' });
			const link = wrap.createEl('a', { text: rel.item.name ?? 'Untitled' });
			link.style.cssText = 'color:var(--text-accent); cursor:pointer; text-decoration:underline;';
			link.addEventListener('click', (e) => {
				e.stopPropagation();
				this.expandAndScrollTo(rel.item.id);
			});
		});
	}

	private expandAndScrollTo(id: string) {
		const target = this.cardElements.get(id);
		if (!target) return;
		for (const [otherId, { details }] of this.cardElements) {
			if (otherId !== id) details.style.display = 'none';
		}
		target.details.style.display = 'block';
		target.item.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
