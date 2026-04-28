import { Plugin } from 'obsidian';
import { buildCaptureExtension } from './capture';

export default class WriteToReasonPlugin extends Plugin {
	async onload() {
		this.registerEditorExtension(buildCaptureExtension(this.app));
	}

	onunload() {}
}
