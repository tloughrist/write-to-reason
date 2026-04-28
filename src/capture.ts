import { ViewPlugin, ViewUpdate } from '@codemirror/view';
import { App } from 'obsidian';
import { StorageManager } from './storage';

const WORD_THRESHOLD = 50;
const CONTEXT_CHARS = 200;

function wordCount(text: string): number {
	return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function projectId(filePath: string): string {
	const parts = filePath.split('/');
	return parts.length > 1 ? parts[0]! : 'root';
}

export function buildCaptureExtension(app: App, storage: StorageManager) {

	return ViewPlugin.fromClass(class {
		update(update: ViewUpdate) {
			if (!update.docChanged) return;

			update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
				const removed = update.startState.doc.sliceString(fromA, toA);
				const insertedText = inserted.toString();

				if (wordCount(removed) - wordCount(insertedText) < WORD_THRESHOLD) return;

				const filePath = app.workspace.getActiveFile()?.path ?? 'unknown';
				const oldDoc = update.startState.doc;

				const record = {
					id: crypto.randomUUID(),
					raw_text: removed,
					timestamp: new Date().toISOString(),
					document_id: filePath,
					project_id: projectId(filePath),
					context_before: oldDoc.sliceString(Math.max(0, fromA - CONTEXT_CHARS), fromA),
					context_after: oldDoc.sliceString(toA, Math.min(oldDoc.length, toA + CONTEXT_CHARS)),
					embedding: null,
				};

				storage.append(record);
			});
		}
	});
}
