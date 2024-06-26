import { promises as fs } from 'fs';
import { resolve } from 'path';
import logger from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

import { IPCTransport } from '../../electron/electronLogger.js';
import Sentry, { SentryTransport } from '../../utils/sentry.js';
import { getState } from '../../utils/state.js';
import { LogLine } from '../types/logger.js';
import { resolvedPath } from './config.js';
import { date, time } from './date.js';
import { ErrorKM } from './error.js';
import { asyncCheckOrMkdir, compressGzipFile } from './files.js';
import { WSTransport } from './ws.js';

export default logger;

let profiling = false;
let WSTrans: WSTransport;

const service = 'Logger';

export async function readLog(level = 'debug'): Promise<LogLine[]> {
	try {
		const log = await fs.readFile(
			resolve(resolvedPath('Logs'), `karaokemugen-${date()}.log`),
			'utf-8'
		);
		const levels = getLogLevels(level);
		return log
			.split('\n')
			.filter((value: string) => value) // remove empty lines
			.map((line: string) => JSON.parse(line))
			.filter((value: LogLine) => levels.includes(value.level));
	} catch (err) {
		Sentry.error(err);
		throw new ErrorKM('ERROR_READING_LOGS');
	}
}

export function getLogLevels(level: string) {
	const levels = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'];
	const index = levels.findIndex(val => val === level);
	// This will remove all elements after index
	levels.length = index + 1;
	return levels;
}

export function enableProfiling() {
	profiling = true;
}

export async function configureLogger(
	debug: boolean,
	rotate?: boolean
) {
	const consoleLogLevel = debug ? 'debug' : 'info';
	const logDir = resolvedPath('Logs');
	await asyncCheckOrMkdir(logDir);
	const today = date();
	const consoleFormat = logger.format.combine(
		logger.format.colorize(),
		logger.format.printf(info => {
			let duration = '';
			if (info.durationMs) duration = ` duration: ${info.durationMs} ms`;
			// Padding if info.level is 4 characters long only
			let level = `${info.level}:`;
			if (info.level.length === 14) level = `${info.level}: `;
			let additional = '';
			if (info?.obj instanceof Error) {
				additional = `${info.obj.name}: ${info.obj.message}\n${info.obj.stack}`;
			} else if (typeof info?.obj !== 'undefined') {
				additional = JSON.stringify(info.obj, null, 2);
			}
			return `${time()} - ${level}${info.service ? ` [${info.service}]` : ''} ${
				info.message
			}${duration} ${additional}`;
		})
	);
	if (rotate) {
		logger.add(
			new DailyRotateFile({
				filename: 'karaokemugen-%DATE%.log',
				dirname: logDir,
				zippedArchive: true,
				level: 'debug',
				handleExceptions: true,
				format: logger.format.combine(
					logger.format.timestamp(),
					logger.format.json()
				),
			})
		);
	} else {
		logger.add(
			new logger.transports.File({
				filename: resolve(logDir, `karaokemugen-${today}.log`),
				level: 'debug',
				handleExceptions: true,
				format: logger.format.combine(
					logger.format.timestamp(),
					logger.format.json()
				),
			})
		);
	}
	if (getState().electron) {
		logger.add(
			new IPCTransport({
				level: consoleLogLevel,
				format: logger.format.combine(
					logger.format.timestamp(),
					logger.format.json()
				),
			})
		);
	}
	logger.add(
		new logger.transports.Console({
			level: consoleLogLevel,
			format: consoleFormat,
		})
	);
	logger.add(
		new SentryTransport({
			level: 'debug',
			format: logger.format.combine(
				logger.format.timestamp(),
				logger.format.json()
			),
		})
	);
}

export function profile(func: string) {
	if (profiling) logger.profile(`[Profiling] ${func}`);
}

export function enableWSLogging(level: string) {
	if (WSTrans) logger.remove(WSTrans);
	WSTrans = new WSTransport({
		level,
		format: logger.format.combine(
			logger.format.timestamp(),
			logger.format.json()
		),
	});
	logger.add(WSTrans);
}

export async function archiveOldLogs() {
	logger.info('Compressing old logs...', { service });
	const logDir = resolvedPath('Logs');
	const files = await fs.readdir(logDir, { withFileTypes: true });
	const today = date();
	for (const file of files) {
		if (file.isFile() && file.name.endsWith('.log') && !file.name.includes(today)) {
			await compressGzipFile(resolve(logDir, file.name));
			fs.unlink(resolve(logDir, file.name));
		}
	}
}
