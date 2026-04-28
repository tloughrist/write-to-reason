import { App, Modal } from 'obsidian';
import { StorageManager } from './storage';
import { queryDeletions } from './query';

export class QueryModal extends Modal {
	private documentId: string;
	private storage: StorageManager;
	private apiKey: string;

	constructor(app: App, documentId: string, storage: StorageManager, apiKey: string) {
		super(app);
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

		const button = contentEl.createEl('button', { text: 'Search' });

		const results = contentEl.createEl('div');
		results.style.cssText = 'margin-top:16px; white-space:pre-wrap; line-height:1.5;';

		const run = async () => {
			if (!input.value.trim()) return;
			if (!this.apiKey) {
				results.setText('No API key set. Add your Anthropic API key in plugin settings.');
				return;
			}
			button.disabled = true;
			results.setText('Searching...');
			try {
				const response = await queryDeletions(input.value, this.documentId, this.storage, this.apiKey);
				results.setText(response);
			} catch (e) {
				results.setText(`Error: ${e instanceof Error ? e.message : String(e)}`);
			} finally {
				button.disabled = false;
			}
		};

		button.addEventListener('click', run);
		input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });

		setTimeout(() => input.focus(), 50);
	}

	onClose() {
		this.contentEl.empty();
	}
}
