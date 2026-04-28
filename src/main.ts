import { Notice, Plugin } from 'obsidian';

export default class WriteToReasonPlugin extends Plugin {
	async onload() {
		this.addCommand({
			id: 'test-command',
			name: 'Test command',
			callback: () => {
				new Notice('WriteToReason is alive');
			}
		});
	}

	onunload() {}
}
