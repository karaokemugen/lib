import { BinaryToTextEncoding, createHash } from 'crypto';
import { fileTypeFromFile } from 'file-type';
import {
	constants as FSConstants,
	createReadStream,
	createWriteStream,
	PathLike,
	promises as fs,
} from 'fs';
import { mkdirp, move, MoveOptions } from 'fs-extra';
import { deburr } from 'lodash';
import { extname, isAbsolute, parse, relative, resolve } from 'path';
import sanitizeFilename from 'sanitize-filename';
import { Stream } from 'stream';
import { detect as detectSub } from 'subsrt-ts';
import XRegExp from 'xregexp';
import { createGzip } from 'zlib';

import { getState } from '../../utils/state.js';
import { SupportedLyricsFormat } from '../types/kara.js';
import { RepositoryType } from '../types/repo.js';
import { resolvedPathRepos } from './config.js';
import { imageFileRegexp, mediaFileRegexp } from './constants.js';
import logger from './logger.js';
import Task from './taskManager.js';

const service = 'Files';

export async function compressGzipFile(filename: string): Promise<string> {
	return new Promise((resolvePromise, reject) => {
		logger.info(`Compressing file ${filename}...`, { service });
		const stream = createReadStream(filename);
		stream
			.pipe(createGzip())
			.pipe(createWriteStream(`${filename}.gz`))
			.on('error', (err: any) => {
				reject(err);
			})
			.on('finish', () => {
				resolvePromise(`${filename}.gz`);
			});
	});
}

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
		ω: 'w',
		'○': 'O',
		'×': 'x',
		Φ: 'O',
		φ: 'o',
		'±': '+',
		'∀': 'A',
		'∬': 'Fortissimo',
		ǒ: 'o',
		ǎ: 'a',
		ǚ: 'u',
		ǔ: 'u',
		ǐ: 'i',
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
		'’': "'",
		'‘': "'",
		ё: 'e',
		// Mathematical Italic Small
		...Object.fromEntries([...Array(26).keys()].map(i => [String.fromCharCode(55349, 56398 + i), String.fromCharCode(97 + i)])),
		// Mathematical Sans-Serif Bold Small
		...Object.fromEntries([...Array(26).keys()].map(i => [String.fromCharCode(55349, 56814 + i), String.fromCharCode(97 + i)]))
	};
	const replaceRegExp = new RegExp(
		`[${Object.keys(replaceMap).join('')}]`,
		'igu'
	);
	// Romanizing japanese characters by their romanization
	// Also making some obvious replacements of things we often find in japanese names.
	file = file
		.replaceAll('ô', 'ou')
		.replaceAll('Ô', 'Ou')
		.replaceAll('û', 'uu')
		.replaceAll("µ's", "Mu's")
		.replaceAll('®', '(R)')
		.replaceAll('Ά', 'A')
		.replaceAll('ρ', 'r')
		.replaceAll('γ', 'g')
		.replaceAll('υ', 'y')
		.replaceAll('ρ', 'r')
		.replaceAll('o', 'o')
		.replaceAll('ϛ', 's')
		.replaceAll('α', 'Alpha')
		.replaceAll('Δ', 'Delta')
		.replaceAll('∆', 'Delta')
		.replaceAll('Ω', 'Omega')
		.replaceAll('Ⅰ', 'I')
		.replaceAll('Ⅱ', 'II')
		.replaceAll('Ⅲ', 'III')
		.replaceAll('Ⅳ', 'IV')
		.replaceAll('Ⅴ', 'V')
		.replaceAll('Ⅵ', 'VI')
		.replaceAll('Ⅶ', 'VII')
		.replaceAll('Ⅷ', 'VIII')
		.replaceAll('Ⅸ', 'IX')
		.replaceAll('Ⅹ', 'X')
		.replaceAll('Ⅺ', 'XI')
		.replaceAll('Ⅻ', 'XII')
		.replaceAll('Ⅼ', 'L')
		.replaceAll('Ⅽ', 'C')
		.replaceAll('Ⅾ', 'D')
		.replaceAll('ↀ', 'CD')
		.replaceAll('Ⅿ', 'M')
		.replaceAll('ↁ', 'DD')
		.replaceAll('ↂ', 'CCDD')
		.replaceAll('ↈ', 'CCCDDD')
		.replaceAll('ↇ', 'DDD')
		.replaceAll('￪', 'Up')
		.replaceAll('↗', 'UpRight')
		.replaceAll('→', 'Right')
		.replaceAll('𝄇', ' ')
		.replaceAll(';', ' ')
		.replaceAll('[', ' ')
		.replaceAll(']', ' ')
		.replace(/[△:/☆★†↑½♪＊*∞♥❤♡⇄→♬♂♀]/g, ' ')
		.replaceAll('…', '...')
		.replaceAll('+', ' Plus ')
		.replaceAll('＋', ' Plus ')
		.replaceAll('??', ' question_mark 2')
		.replaceAll('?', ' question_mark ')
		.replaceAll('¿', '')
		.replaceAll('¡', '')
		.replace(/^\./g, '')
		.replaceAll('♭', ' Flat ')
		.replaceAll('%', ' percent ')
		.replaceAll('℃', '0C')
		.replaceAll('≠', ' Different ')
		.replaceAll('～', '~')
		.replaceAll('−', '-')
		.replace(replaceRegExp, input => {
			return replaceMap[input];
		});
	// Remove all diacritics we might have left
	file = deburr(file);
	// Remove everything except ASCII and language characters
	file = file.replaceAll(XRegExp('[^\u0000-\u007F\\p{L}]', 'g'), '');
	// Also, remove useless spaces.
	file = file.replace(/ [ ]+/g, ' ');
	// One last go using sanitizeFilename just in case.
	file = sanitizeFilename(file) !== '' ? sanitizeFilename(file) : sanitizeFilename(`${file}_`);
	file = file.trim();
	return file;
}

export function detectSubFileFormat(
	sub: string
): SupportedLyricsFormat {
	// This is absolutely quick and dirty and I always fear some file is going to trip it at some point. Bleh.
	// We need a better subtitle detection.
	if (sub.substring(0, 4) === 'MThd') return 'kar';
	if (sub.substring(0, 3) === 'KFN' || sub.includes('[General]'))
		return 'kfn';
	if (sub.includes('#TITLE:')) return 'txt';
	if (sub.includes('HEADERV2')) return 'kbp';
	return detectSub(sub) || 'unknown';
}

export async function detectFileType(file: string): Promise<string> {
	const detected = await fileTypeFromFile(file);
	if (!detected) {
		logger.warn(`Unable to detect filetype of ${file}`, { service });
		return parse(file).ext;
	}
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
		const exists = await fileExists(resolvedDir);
		if (!exists) {
			logger.debug(`Creating folder ${resolvedDir}`, { service });
			await mkdirp(resolvedDir);
		}
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

/** Returns the relative path, or absolute if it's not inside "from" */
export function relativePath(from: string, to: string): string {
	const rel = relative(from, to);
	if (rel && !rel.startsWith('..') && !isAbsolute(rel)) {
		return rel;
	}
	return to;
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

/** Courtesy of @leonekmi */
export function replaceOctalByUnicode(str: string): string {
	let arr: RegExpExecArray | null;
	let replaced = str;
	// eslint-disable-next-line security/detect-unsafe-regex
	const octal_regex = /((?:\\[0-7]{3})+)/g;
	while ((arr = octal_regex.exec(str)) !== null) {
		replaced = replaced.replace(arr[0], octalToUnicode(arr[0]));
	}
	return replaced;
}

/** Courtesy of @minirop */
export function octalToUnicode(str: string): string {
	if (str[0] === '\\') {
		const points = [];
		let pos = 0;
		while (pos < str.length && str[pos] === '\\') {
			let code = '0';

			const first = str[pos + 1];
			if (first === '3') {
				const second = str[pos + 2];
				let x = '';
				let y = '';
				let z = '';
				let w = '';

				if (second === '6') {
					x = str[pos + 3];
					y = str.slice(pos + 6, pos + 8);
					z = str.slice(pos + 10, pos + 12);
					w = str.slice(pos + 14, pos + 16);
					pos += 16;
				} else if (second === '4' || second === '5') {
					x = str[pos + 3];
					if (second === '5') {
						x = `1${x}`;
					}
					y = str.slice(pos + 6, pos + 8);
					z = str.slice(pos + 10, pos + 12);
					pos += 12;
				} else {
					x = str.slice(pos + 2, pos + 4);
					y = str.slice(pos + 6, pos + 8);
					pos += 8;
				}

				code = x + y + z + w;
			} else {
				code = str.slice(pos + 1, pos + 4);
				pos += 4;
			}
			points.push(parseInt(code, 8));
		}
		return String.fromCodePoint(...points);
	}
	return str;
}

export const extnameLowercase = (filename: string) => extname(filename).toLowerCase();
