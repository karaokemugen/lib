import { readFile } from 'fs/promises';
import { Format } from 'logform';
import {resolve} from 'path';
import logger from 'winston';
import { ConsoleForElectron } from 'winston-console-for-electron';
import dailyRotateFile from  'winston-daily-rotate-file';

import { IPCTransport } from '../../electron/electronLogger';
import { SentryTransport } from '../../utils/sentry';
import { getState } from '../../utils/state';
import { LogLine } from '../types/logger';
import {date, time} from './date';
import {asyncCheckOrMkdir} from './files';
import { WSTransport } from './ws';

export default logger;

let profiling = false;
let WSTrans: WSTransport;

class ErrFormatter implements Format {
	transform(info) {
		if (info?.obj instanceof Error) {
			info.obj = `${info.obj.name}: ${info.obj.message}\n${info.obj.stack}`;
		}
		return info;
	}
}

function errFormater() {
	return new ErrFormatter();
}

export async function readLog(level = 'debug'): Promise<LogLine[]> {
	const log = await readFile(resolve(getState().dataPath, `logs/karaokemugen-${date(true)}.log`), 'utf-8');
	const levels = getLogLevels(level);
	return log.split('\n')
		.filter((value: string) => value) // remove empty lines
		.map((line: string) => JSON.parse(line))
		.filter((value: LogLine) => levels.includes(value.level));
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

export async function configureLogger(dataPath: string, debug: boolean, rotate?: boolean) {
	const consoleLogLevel = debug ? 'debug' : 'info';
	const logDir = resolve(dataPath, 'logs');
	await asyncCheckOrMkdir(logDir);
	const today = date(true);
	const consoleFormat = logger.format.combine(
		logger.format.colorize(),
		logger.format.printf(info => {
			let duration = '';
			if (info.durationMs) duration = ` duration: ${info.durationMs} ms`;
			//Padding if info.level is 4 characters long only
			let level = `${info.level}:`;
			if (info.level.length === 14) level = `${info.level}: `;
			let additional = '';
			if (info?.obj instanceof Error) {
				additional = `${info.obj.name}: ${info.obj.message}\n${info.obj.stack}`;
			} else if (typeof info?.obj !== 'undefined') {
				additional = JSON.stringify(info.obj, null, 2);
			}
			return `${time()} - ${level}${info.service ? ` [${info.service}]`:''} ${info.message}${duration} ${additional}`;
		})
	);
	if (rotate) {
		logger.add(
			new dailyRotateFile({
				filename: 'karaokemugen-%DATE%.log',
				dirname: logDir,
				zippedArchive: true,
				level: 'debug',
				handleExceptions: true,
				format: logger.format.combine(
					logger.format.timestamp(),
					errFormater(),
					logger.format.json(),
				)
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
					errFormater(),
					logger.format.json(),
				)
			})
		);
	}
	if (getState().electron) {
		logger.add(
			new ConsoleForElectron({
				level: consoleLogLevel,
				format: consoleFormat
			})
		);
		logger.add(
			new IPCTransport({
				level: consoleLogLevel,
				format: logger.format.combine(
					logger.format.timestamp(),
					errFormater(),
					logger.format.json(),
				)
			})
		);
	} else {
		logger.add(
			new logger.transports.Console({
				level: consoleLogLevel,
				format: consoleFormat
			})
		);
	}
	logger.add(
		new SentryTransport({
			level: 'debug',
			format: logger.format.combine(
				logger.format.timestamp(),
				errFormater(),
				logger.format.json(),
			)
		})
	);
}

export function profile(func: string) {
	if (profiling) logger.profile(`[Profiling] ${func}`);
}

export function enableWSLogging(level: string) {
	if (WSTrans) logger.remove(WSTrans);
	WSTrans = new WSTransport({
		level: level,
		format: logger.format.combine(
			logger.format.timestamp(),
			logger.format.json(),
		)
	});
	logger.add(WSTrans);
}
