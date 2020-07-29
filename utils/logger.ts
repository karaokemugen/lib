import {resolve} from 'path';
import randomstring from 'randomstring';
import logger from 'winston';
import { ConsoleForElectron } from 'winston-console-for-electron';
import dailyRotateFile from  'winston-daily-rotate-file';

import { IPCTransport } from '../../electron/electronLogger';
import { SentryTransport } from '../../utils/sentry';
import { getState, setState } from '../../utils/state';
import {date, time} from './date';
import {asyncCheckOrMkdir, asyncReadFile} from './files';
import { WSTransport } from './ws';

export default logger;

let profiling = false;
let WSTrans: WSTransport;

export async function readLog(level = 'debug'): Promise<any[]> {
	const log = await asyncReadFile(resolve(getState().dataPath, `logs/karaokemugen-${date(true)}.log`), 'utf-8');
	const levels = getLogLevels(level);
	return log.split('\n')
		.filter(value => value) // remove empty lines
		.map((line: string) => JSON.parse(line))
		.filter(value => levels.includes(value.level));
}

export function getLogLevels(level: string) {
	const levels = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'];
	const index = levels.findIndex(val => val === level);
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
	const namespace = randomstring.generate(16);
	setState({wsLogNamespace: namespace});
	const consoleFormat = logger.format.combine(
		logger.format.colorize(),
		logger.format.printf(info => {
			let duration = '';
			if (info.durationMs) duration = `duration: ${info.durationMs} ms`;
			//Padding if info.level is 4 characters long only
			let level = `${info.level}:`;
			if (info.level.length === 14) level = `${info.level}: `;
			const message = info?.obj
				? `${info.obj.message}\n${info.obj.stack}`
				: '';
			return `${time()} - ${level}${info.service ? ` [${info.service}]`:''} ${info.message} ${duration} ${message}`;
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
		namespace: getState().wsLogNamespace,
		format: logger.format.combine(
			logger.format.timestamp(),
			logger.format.json(),
		)
	});
	logger.add(WSTrans);
}
