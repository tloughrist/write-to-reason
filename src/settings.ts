import { App, PluginSettingTab, Setting } from 'obsidian';
import WriteToReasonPlugin from './main';

export interface WriteToReasonSettings {
	apiKey: string;
	wordThreshold: number;
}

export const DEFAULT_SETTINGS: WriteToReasonSettings = {
	apiKey: '',
	wordThreshold: 50,
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
	}
}
