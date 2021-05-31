import execa from 'execa';

import {getState} from '../../utils/state';

export async function gitDiff(commit1: string, commit2: string, gitDir: string): Promise<string> {
	const res = await execa(getState().binPath.git, ['diff', `${commit1}..${commit2}`], {
		encoding: 'utf8',
		cwd: gitDir
	});
	return res.stdout;
}

export async function gitPull(gitDir: string): Promise<string> {
	const res = await execa(getState().binPath.git, ['pull'], {
		encoding: 'utf8',
		cwd: gitDir
	});
	return res.stdout;
}

export async function gitConfig(gitDir: string) {
	await execa(getState().binPath.git, ['config', 'diff.renameLimit', '20000'], {
		encoding: 'utf8',
		cwd: gitDir
	});
}