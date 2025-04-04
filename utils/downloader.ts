// Node modules
import { promise as fastq } from 'fastq';
import { createWriteStream } from 'fs';
import { basename } from 'path';
import prettyBytes from 'pretty-bytes';
import { Readable } from 'stream';

import { DownloadItem } from '../types/downloader.js';
import HTTP from './http.js';
import logger from './logger.js';
import Task from './taskManager.js';

/** Downloader utilities, to download one or more files, complete with ~~a progress bar~~ and crepes. */

const service = 'Downloader';

async function fetchFile(dl: DownloadItem, task?: Task) {
	if (task)
		task.update({
			total: dl.size,
		});
	const writer = createWriteStream(dl.filename);
	const streamResponse = await HTTP.get<Readable>(dl.url, {
		responseType: 'stream',
		onDownloadProgress: e => {
			if (task)
				task.update({
					value: e.loaded,
				});
		}
	});
	streamResponse.data.pipe(writer, { end: true });

	return new Promise<void>((resolve, reject) => {
		writer.on('finish', () => {
			if (task)
				task.update({
					value: dl.size,
				});
			resolve();
		});
		writer.on('error', err => {
			reject(err);
		});
	});
}

export async function downloadFile(
	dl: DownloadItem,
	task?: Task,
	log_prepend?: string
) {
	try {
		const response = await HTTP.head(dl.url);
		dl.size = +response.headers['content-length'];
	} catch (err) {
		logger.error(`Error during download of ${basename(dl.filename)} (HEAD)`, {
			service,
			obj: err,
		});
		if (task) task.end();
		throw err;
	}
	const prettySize = !isNaN(dl.size) ? prettyBytes(dl.size) : 'size unknown';
	logger.info(
		`${log_prepend ? `${log_prepend} ` : ''}Downloading ${basename(
			dl.filename
		)} (${prettySize})`,
		{ service }
	);
	if (task)
		task.update({
			subtext: `${dl.name || basename(dl.filename)} (${prettySize})`,
			value: 0,
			total: dl.size,
		});
	try {
		await fetchFile(dl, task);
	} catch (err) {
		logger.error(`Error during download of ${basename(dl.filename)} (GET)`, {
			service,
			obj: err,
		});
		if (task) task.end();
		throw err;
	}
}

// the 2 last numbers are index (+ 1) of the task in queue and the length of queue
const wrappedDownloadFile = (payload: [DownloadItem, Task, number, number]) =>
	downloadFile(payload[0], payload[1], `(${payload[2]}/${payload[3]})`).catch(
		err => {
			// All errors should be captured correctly by handlers in downloadFile but this is like the ultimate safetynet
			logger.debug(`DL Queue entry ${payload[2]}/${payload[3]} failed`, {
				service,
				obj: err,
			});
			throw new Error(payload[0].filename);
		}
	);

export async function downloadFiles(files: DownloadItem[], task?: Task) {
	const queue = fastq<never, [DownloadItem, Task, number, number], void>(
		wrappedDownloadFile,
		1
	);
	const errors: string[] = [];
	queue.error((err: Error) => {
		if (err) errors.push(err.message);
	});
	files.forEach((dl, i) => queue.push([dl, task, i + 1, files.length]));
	await queue.drained();
	return errors;
}

// The crepes are a lie.

// The progress bar as well. It was removed when we switched to Electron and didn't need the console anymore.
