import { BinaryToTextEncoding, createHash } from 'crypto';
import { fileTypeFromFile } from 'file-type';
import {
	constants as FSConstants,
	createWriteStream,
	PathLike,
	promises as fs,
} from 'fs';
import { mkdirp, move, MoveOptions } from 'fs-extra';
import { deburr } from 'lodash';
import { relative, resolve } from 'path';
import sanitizeFilename from 'sanitize-filename';
import { Stream } from 'stream';

import { getState } from '../../utils/state';
import { RepositoryType } from '../types/repo';
import { resolvedPathRepos } from './config';
import { imageFileRegexp, mediaFileRegexp } from './constants';
import logger from './logger';
import Task from './taskManager';

const service = 'Files';

export function sanitizeFile(file: string): string {
	const replaceMap = {
		'·': '.',
		'・': '.',
		Λ: 'A',
		Я: 'R',
		'³': '3',
		'²': '2',
		'°': '0',
		θ: '0',
		Ø: '0',
		'○': 'O',
		'×': 'x',
		Φ: 'O',
		φ: 'o',
		'±': '+',
		'∀': 'A',
		'∬': 'Fortissimo',
		ǒ: 'o',
		ǎ: 'a',
		ǔ: 'u',
		ǐ: 'i',
		Δ: 'Triangle',
		'１': '1',
		'２': '2',
		'３': '3',
		'４': '4',
		'５': '5',
		'６': '6',
		'７': '7',
		'８': '8',
		'９': '9',
		'０': '0',
		ё: 'e',
	};
	const replaceRegExp = new RegExp(
		`[${Object.keys(replaceMap).join('')}]`,
		'ig'
	);
	// Romanizing japanese characters by their romanization
	// Also making some obvious replacements of things we often find in japanese names.
	file = file
		.replaceAll('ô', 'ou')
		.replaceAll('Ô', 'Ou')
		.replaceAll('û', 'uu')
		.replaceAll("µ's", "Mu's")
		.replaceAll('®', '(R)')
		.replaceAll('∆', 'Delta')
		.replaceAll('Ω', 'O')
		.replaceAll(';', ' ')
		.replaceAll('[', ' ')
		.replaceAll(']', ' ')
		.replace(/[△:/☆★†↑½♪＊*∞♥❤♡⇄♬]/g, ' ')
		.replaceAll('…', '...')
		.replaceAll('+', ' Plus ')
		.replaceAll('＋', ' Plus ')
		.replaceAll('??', ' question_mark 2')
		.replaceAll('?', ' question_mark ')
		.replace(/^\./g, '')
		.replaceAll('♭', ' Flat ')
		.replaceAll('%', ' percent ')
		.replace(replaceRegExp, input => {
			return replaceMap[input];
		});
	// Remove all diacritics and other non-ascii characters we might have left
	// Also, remove useless spaces.
	file = deburr(file)
		.replace(/[^\x00-\xFF]/g, ' ')
		.replace(/ [ ]+/g, ' ');
	// One last go using sanitizeFilename just in case.
	file = sanitizeFilename(file);
	file = file.trim();
	return file;
}

export function detectSubFileFormat(
	sub: string
): 'ass' | 'toyunda' | 'ultrastar' | 'unknown' | 'karafun' | 'kar' {
	const data = sub.split('\n');
	if (data[0].includes('[Script Info]')) return 'ass';
	if (sub.substring(0, 4) === 'MThd') return 'kar';
	if (sub.substring(0, 3) === 'KFN' || sub.includes('[General]'))
		return 'karafun';
	if (data[0].includes('toyunda')) return 'toyunda';
	if (sub.includes('#TITLE:')) return 'ultrastar';
	return 'unknown';
}

export async function detectFileType(file: string): Promise<string> {
	const detected = await fileTypeFromFile(file);
	if (!detected) throw `Unable to detect filetype of ${file}`;
	return detected.ext;
}

export async function fileExists(
	file: PathLike,
	write = false
): Promise<boolean> {
	try {
		await fs.access(file, write ? FSConstants.W_OK : FSConstants.F_OK);
		return true;
	} catch (err) {
		return false;
	}
}

export function isImageFile(fileName: string) {
	return imageFileRegexp.test(fileName);
}

export function isMediaFile(fileName: string) {
	return mediaFileRegexp.test(fileName);
}

export function checksum(
	str: string,
	algorithm = 'md5',
	encoding: BinaryToTextEncoding = 'hex'
) {
	return createHash(algorithm).update(str, 'utf8').digest(encoding);
}

/** Function used to verify if a required file exists. It throws an exception if not. */
export async function fileRequired(file: string) {
	if (!(await fileExists(file))) throw `File "${file}" does not exist`;
}

export async function asyncCheckOrMkdir(dir: string) {
	try {
		const resolvedDir = resolve(dir);
		if (!(await fileExists(resolvedDir))) await mkdirp(resolvedDir);
	} catch (err) {
		throw `${dir} is unreachable. Check if drive is connected or permissions to that directory are correct : ${err}`;
	}
}

/**
 * Searching file in a list of folders. If the file is found, we return its complete path with resolve.
 */
export async function resolveFileInDirs(
	filename: string,
	dirs: string[]
): Promise<string[]> {
	const filesFound = [];
	for (const dir of dirs) {
		const resolved = resolve(getState().dataPath, dir, filename);
		if (await fileExists(resolved)) filesFound.push(resolved);
	}
	if (filesFound.length === 0)
		throw Error(
			`File "${filename}" not found in any listed directory: ${dirs.join(', ')}`
		);
	return filesFound;
}

// Extract all files of a specified folder
export async function listAllFiles(
	dir: RepositoryType,
	repo?: string
): Promise<string[]> {
	let files = [];
	const path = resolvedPathRepos(dir, repo);
	let ext = '';
	if (dir === 'Karaokes') ext = '.kara.json';
	if (dir === 'Tags') ext = '.tag.json';
	if (dir === 'Hooks') ext = '.hook.yml';
	for (const resolvedPath of path) {
		logger.debug(`ListAllFiles from folder ${resolvedPath}`, { service });
		await asyncCheckOrMkdir(resolvedPath);
		const localFiles = await readDirFilter(resolvedPath, ext || '');
		files = files.concat(
			localFiles.map((f: string) => resolve(resolvedPath, f))
		);
	}
	return files;
}

/** Replacing extension in filename */
export function replaceExt(filename: string, newExt: string): string {
	return filename.replace(/\.[^.]+$/, newExt);
}

export async function readDirFilter(dir: string, ext: string) {
	const dirListing = await fs.readdir(dir);
	return dirListing
		.filter((file: string) => file.endsWith(ext || '') && !file.startsWith('.'))
		.map((file: string) => resolve(dir, file));
}

export function writeStreamToFile(stream: Stream, filePath: string) {
	return new Promise<void>((resolvePromise, reject) => {
		stream.pipe(createWriteStream(filePath));
		stream.on('end', () => resolvePromise());
		stream.on('error', (err: string) => reject(err));
	});
}

export function smartMove(path1: string, path2: string, options?: MoveOptions) {
	if (path1 === path2) return;
	return move(path1, path2, options || {});
}

export async function moveAll(dir1: string, dir2: string, task?: Task) {
	const files = await fs.readdir(dir1);
	for (const file of files) {
		logger.info(`Moving ${file}`, { service });
		if (task)
			task.update({
				subtext: file,
			});
		await smartMove(resolve(dir1, file), resolve(dir2, file), {
			overwrite: true,
		});
		if (task) task.incr();
	}
}

export function relativePath(from: string, to: string): string {
	if (to.startsWith('/')) return to;
	return relative(from, to);
}

/* Recursively browse all files in a folder */
export async function getFilesRecursively(path: string, ext = '') {
	const files = await fs.readdir(path, { withFileTypes: true });
	const gotFiles = [];
	for (const file of files) {
		if (file.name === undefined) continue;
		const filePath = resolve(path, file.name);
		if (file.isFile() && file.name.endsWith(ext)) {
			gotFiles.push(filePath);
		} else if (file.isDirectory()) {
			const childFiles = await getFilesRecursively(filePath, ext);
			gotFiles.push(...childFiles);
		}
	}
	return gotFiles;
}
