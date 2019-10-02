import logger from 'winston';
import {asyncCheckOrMkdir, asyncReadFile} from './files';
import {resolve} from 'path';
import {date, time} from './date';
import dailyRotateFile from  'winston-daily-rotate-file';

export default logger;

let profiling = false;
let basePath: string;

export async function readLog(): Promise<string> {
	return await asyncReadFile(resolve(basePath, `logs/karaokemugen-${date(true)}.log`), 'utf-8')
}

export function enableProfiling() {
	profiling = true;
}

export async function configureLogger(appPath: string, debug: boolean, rotate?: boolean) {
	basePath = appPath;
	const consoleLogLevel = debug ? 'debug' : 'info';
	const logDir = resolve(appPath, 'logs');
	await asyncCheckOrMkdir(logDir);

	logger.add(
		new logger.transports.Console({
			level: consoleLogLevel,
			format: logger.format.combine(
				logger.format.colorize(),
				logger.format.printf(info => {
					let duration = '';
					if (info.durationMs) duration = `duration: ${info.durationMs} ms`;
					//Padding if info.level is 4 characters long only
					let level = `${info.level}:`;
					if (info.level === 'info' || info.level === 'warn') level = `${info.level}: `;
					return `${time()} - ${level} ${info.message} ${duration}`;
				})
			)
		})
	);
	const today = date(true);
	if (rotate) {
		logger.add(
			new dailyRotateFile({
				filename: 'karaokemugen-%DATE%.log',
				dirname: logDir,
				zippedArchive: true,
				level: 'debug',
				handleExceptions: true,
				format: logger.format.combine(
					logger.format.printf(info => {
						let duration = '';
						if (info.durationMs) duration = `duration: ${info.durationMs} ms`;
						return `${new Date()} - ${info.level}: ${info.message} ${duration}`;
					})
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
					logger.format.printf(info => {
						let duration = '';
						if (info.durationMs) duration = `duration: ${info.durationMs} ms`;
						return `${time()} - ${info.level}: ${info.message} ${duration}`;
					})
				)
			})
		);
	}
}

export function profile(func: string) {
	if (profiling) logger.profile(`[Profiling] ${func}`);
}
