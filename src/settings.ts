import { App, PluginSettingTab, Setting } from 'obsidian';
import WriteToReasonPlugin from './main';

export type SearchScope = 'document' | 'project' | 'vault';

export interface WriteToReasonSettings {
	apiKey: string;
	voyageApiKey: string;
	wordThreshold: number;
	defaultScope: SearchScope;
}

export const DEFAULT_SETTINGS: WriteToReasonSettings = {
	apiKey: '',
	voyageApiKey: '',
	wordThreshold: 50,
	defaultScope: 'document',
};

export class WriteToReasonSettingTab extends PluginSettingTab {
	plugin: WriteToReasonPlugin;

	constructor(app: App, plugin: WriteToReasonPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Anthropic API key')
			.setDesc('Your API key from console.anthropic.com')
			.addText(text => text
				.setPlaceholder('sk-ant-...')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('Voyage AI API key')
			.setDesc('Used for embeddings (cross-document search). Get one at voyageai.com.')
			.addText(text => text
				.setPlaceholder('pa-...')
				.setValue(this.plugin.settings.voyageApiKey)
				.onChange(async (value) => {
					this.plugin.settings.voyageApiKey = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('Capture threshold (words)')
			.setDesc('Minimum word count for a deletion to be captured')
			.addText(text => text
				.setPlaceholder('50')
				.setValue(String(this.plugin.settings.wordThreshold))
				.onChange(async (value) => {
					const parsed = parseInt(value);
					if (!isNaN(parsed) && parsed > 0) {
						this.plugin.settings.wordThreshold = parsed;
						await this.plugin.saveSettings();
					}
				})
			);

		new Setting(containerEl)
			.setName('Default search scope')
			.setDesc('Default scope for searches. Project = top-level folder. Vault = all notes.')
			.addDropdown(dropdown => dropdown
				.addOption('document', 'Current document')
				.addOption('project', 'Current project')
				.addOption('vault', 'Entire vault')
				.setValue(this.plugin.settings.defaultScope)
				.onChange(async (value: SearchScope) => {
					this.plugin.settings.defaultScope = value;
					await this.plugin.saveSettings();
				})
			);
	}
}
