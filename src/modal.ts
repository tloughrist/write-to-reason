import { App, Editor, Modal } from 'obsidian';
import { StorageManager } from './storage';
import { QueryResult, queryDeletions, integrateIdea } from './query';

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

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Search deleted ideas' });

		const input = contentEl.createEl('input', {
			type: 'text',
			placeholder: 'What are you looking for?',
		});
		input.style.cssText = 'width:100%; margin-bottom:8px; padding:4px;';

		const searchBtn = contentEl.createEl('button', { text: 'Search' });

		const results = contentEl.createEl('div');
		results.style.marginTop = '16px';

		const run = async () => {
			if (!input.value.trim()) return;
			if (!this.apiKey) {
				results.setText('No API key set. Add your Anthropic API key in plugin settings.');
				return;
			}
			searchBtn.disabled = true;
			results.setText('Searching...');
			try {
				const queryResults = await queryDeletions(input.value, this.documentId, this.storage, this.apiKey);
				results.empty();
				if (queryResults.length === 0) {
					results.setText('No relevant deleted ideas found.');
				} else {
					this.renderResults(results, queryResults);
				}
			} catch (e) {
				results.setText(`Error: ${e instanceof Error ? e.message : String(e)}`);
			} finally {
				searchBtn.disabled = false;
			}
		};

		searchBtn.addEventListener('click', run);
		input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });

		setTimeout(() => input.focus(), 50);
	}

	private renderResults(container: HTMLElement, results: QueryResult[]) {
		for (const result of results) {
			const card = container.createEl('div');
			card.style.cssText = 'border:1px solid var(--background-modifier-border); border-radius:4px; padding:12px; margin-bottom:12px;';

			card.createEl('p', { text: result.summary }).style.cssText = 'font-weight:bold; margin:0 0 8px 0;';
			card.createEl('p', { text: result.excerpt }).style.cssText = 'font-size:0.9em; color:var(--text-muted); margin:0 0 12px 0; white-space:pre-wrap;';

			const actions = card.createEl('div');
			actions.style.cssText = 'display:flex; gap:8px;';

			const insert = (text: string) => {
				const cursor = this.editor.getCursor();
				this.editor.replaceRange(text, cursor);
				this.close();
			};

			actions.createEl('button', { text: 'Raw excerpt' })
				.addEventListener('click', () => insert(result.excerpt));

			actions.createEl('button', { text: 'Excerpt + summary' })
				.addEventListener('click', () => insert(`**${result.summary}**\n\n${result.excerpt}`));

			const integrateBtn = actions.createEl('button', { text: 'Integrate at cursor' });
			integrateBtn.addEventListener('click', async () => {
				integrateBtn.disabled = true;
				integrateBtn.setText('Integrating...');
				try {
					const integrated = await integrateIdea(result, this.editor, this.apiKey);
					insert(integrated);
				} catch (e) {
					integrateBtn.disabled = false;
					integrateBtn.setText('Integrate at cursor');
					card.createEl('p', { text: `Error: ${e instanceof Error ? e.message : String(e)}` })
						.style.color = 'var(--text-error)';
				}
			});
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
