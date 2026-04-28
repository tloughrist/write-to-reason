import { Editor, Plugin } from 'obsidian';
import { buildCaptureExtension } from './capture';
import { StorageManager } from './storage';
import { WriteToReasonSettingTab, WriteToReasonSettings, DEFAULT_SETTINGS } from './settings';
import { QueryModal } from './modal';

export default class WriteToReasonPlugin extends Plugin {
	settings: WriteToReasonSettings;
	private storage: StorageManager;

	async onload() {
		await this.loadSettings();
		this.storage = new StorageManager(this.app.vault);

		this.registerEditorExtension(
			buildCaptureExtension(this.app, this.storage, () => this.settings.wordThreshold)
		);

		this.addSettingTab(new WriteToReasonSettingTab(this.app, this));

		this.addCommand({
			id: 'search-deleted-ideas',
			name: 'Search deleted ideas',
			editorCallback: (editor: Editor) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return;
				new QueryModal(this.app, editor, file.path, this.storage, this.settings.apiKey).open();
			}
		});
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<WriteToReasonSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
