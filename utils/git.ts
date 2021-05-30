import execa from 'execa';

import {getState} from '../../utils/state';

export async function gitDiff(commit1: string, commit2: string, gitDir: string): Promise<string> {
	// We need to get the commit next to the one we've been supplied, because the diff command also includes the commit we mention in its diff
	// Which is pretty stupid, but git is often like that.
	const nextCommitRes = await execa(getState().binPath.git, ['rev-list', '--reverse', '--ancestry-path', `${commit1}..HEAD`], {
		encoding: 'utf8',
		cwd: gitDir
	});
	const nextCommit = nextCommitRes.stdout.split('\n')[0];
	// If nextCommit is empty, it means we're at HEAD, so no need to return anything else
	if (nextCommit === '') return '';

	const res = await execa(getState().binPath.git, ['diff', `${commit1}^..${commit2}`], {
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