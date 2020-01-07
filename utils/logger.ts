import logger from 'winston';
import {asyncCheckOrMkdir, asyncReadFile} from './files';
import {resolve} from 'path';
import {date, time} from './date';
import dailyRotateFile from  'winston-daily-rotate-file';
import { getState } from '../../utils/state';
import chalk from 'chalk';

export default logger;

const moduleColors = {
	BinCheck: chalk.white,
	Blacklist: chalk.red,
	Config: chalk.green,
	DB: chalk.yellow,
	Download: chalk.blue,
	Downloader: chalk.magenta,
	Engine: chalk.cyan,
	Gen: chalk.grey,
	KaraGen: chalk.rgb(10, 20, 100),
	Launcher: chalk.rgb(100, 10, 20),
	Player: chalk.rgb(100, 100, 200),
	Playlist: chalk.rgb(100, 200, 100),
	Poll: chalk.magentaBright,
	Previews: chalk.cyanBright,
	ShortURL: chalk.greenBright,
	State: chalk.redBright,
	Stats: chalk.blueBright,
	Store: chalk.rgb(50, 100, 200),
	Update: chalk.rgb(200, 200, 200),
	User: chalk.whiteBright,
	Webapp: chalk.rgb(50, 150, 150),
	Whitelist: chalk.whiteBright
}

let profiling = false;

export async function readLog(): Promise<string> {
	return await asyncReadFile(resolve(getState().dataPath, `logs/karaokemugen-${date(true)}.log`), 'utf-8')
}

export function enableProfiling() {
	profiling = true;
}

export async function configureLogger(dataPath: string, debug: boolean, rotate?: boolean) {
	const consoleLogLevel = debug ? 'debug' : 'info';
	const logDir = resolve(dataPath, 'logs');
	await asyncCheckOrMkdir(logDir);

	logger.add(
		new logger.transports.Console({
			level: consoleLogLevel,
			format: logger.format.combine(
				logger.format.colorize(),
				logger.format.printf(info => {
					//Finding out module. It's inbetween []
					let module = info.message.split(']')[0].replace('[','');
					let message = info.message.split(/\](.+)/)[1];
					if (message) message = message.trim();
					if (!module) module = 'KM';
					let color = moduleColors[module];
					if (!color) color = chalk.white;

					let duration = '';
					if (info.durationMs) duration = `duration: ${info.durationMs} ms`;
					//Padding if info.level is 4 characters long only
					let level = `${info.level}:`;
					if (info.level === 'info' || info.level === 'warn') level = `${info.level}: `;
					return `${time()} - ${level} ${color(module)}> ${message} ${duration}`;
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
