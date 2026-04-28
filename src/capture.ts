import { ViewPlugin, ViewUpdate } from '@codemirror/view';
import { App } from 'obsidian';

const WORD_THRESHOLD = 50;

function wordCount(text: string): number {
	return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

export function buildCaptureExtension(app: App) {
	return ViewPlugin.fromClass(class {
		update(update: ViewUpdate) {
			if (!update.docChanged) return;

			update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
				const removed = update.startState.doc.sliceString(fromA, toA);
				const insertedText = inserted.toString();

				if (wordCount(removed) - wordCount(insertedText) < WORD_THRESHOLD) return;

				const filePath = app.workspace.getActiveFile()?.path ?? 'unknown';
				console.log('[WriteToReason] Captured deletion:', {
					text: removed,
					wordCount: wordCount(removed),
					filePath,
					timestamp: new Date().toISOString(),
				});
			});
		}
	});
}
