import { App, PluginSettingTab } from 'obsidian';
import WriteToReasonPlugin from './main';

export class WriteToReasonSettingTab extends PluginSettingTab {
	plugin: WriteToReasonPlugin;

	constructor(app: App, plugin: WriteToReasonPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		this.containerEl.empty();
	}
}
