import fs from 'fs/promises';
import { resolve } from 'path';

import Sentry from '../../utils/sentry.js';
import { resolvedPath, resolvedPathRepos } from './config.js';
import logger from './logger.js';

const service = 'Fonts';

export async function initFontDir() {
	try {
		const destDir = resolvedPath('Fonts');
		const fontsDirs = resolvedPathRepos('Fonts').reverse();
		// We'll treat them in reverse order to respect repository priority. The lowest directories are copied first so any duplicate font is overwritten by higher-priority repos
		for (const dir of fontsDirs) {
			const files = await fs.readdir(dir);
			for (const file of files) {
				const source = resolve(dir, file);
				logger.info(`Copying font ${file} from ${dir} to ${destDir}...`, { service });
				await fs.copyFile(source, destDir);
			}
		}
	} catch (err) {
		// Failure isn't fatal
		logger.error(`Failed to copy fonts to fontdir : ${err}`, { service, obj: err });
		Sentry.error(err);
	}
}
