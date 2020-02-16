import logger from 'winston';
import {asyncCheckOrMkdir, asyncReadFile} from './files';
import {resolve} from 'path';
import {date, time} from './date';
import dailyRotateFile from  'winston-daily-rotate-file';
import { getState, setState } from '../../utils/state';
import { ConsoleForElectron } from 'winston-console-for-electron';
import randomstring from 'randomstring';
import { IPCTransport } from '../../utils/electron_logger';
import { WSTransport } from './ws';

export default logger;

let profiling = false;

export async function readLog(): Promise<string> {
	return await asyncReadFile(resolve(getState().dataPath, `logs/karaokemugen-${date(true)}.log`), 'utf-8');
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
			if (info.durationMs) duration = `duration: ${info.durationMs} ms`;
			//Padding if info.level is 4 characters long only
			let level = `${info.level}:`;
			if (info.level === 'info' || info.level === 'warn') level = `${info.level}: `;
			return `${time()} - ${level} ${info.message} ${duration}`;
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
				level: getState().opt.debug ? 'debug' : 'info',
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
}

export function profile(func: string) {
	if (profiling) logger.profile(`[Profiling] ${func}`);
}

export function enableWSLogging() {
	const namespace = randomstring.generate(16);
	setState({wsLogNamespace: namespace});
	logger.add(
		new WSTransport({
			level: getState().opt.debug ? 'debug' : 'info',
			namespace: namespace
		})
	);
}