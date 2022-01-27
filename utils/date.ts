export function now(seconds?: boolean): number {
	if (seconds) return Math.floor(new Date().getTime() / 1000);
	return new Date().getTime();
}

export function date(): string {
	const d = new Date();
	const day = d.getDate();
	const month = d.getMonth() + 1;
	const year = d.getFullYear();

	const dayStr = (day < 10 ? '0' : '') + day;
	const monthStr = (month < 10 ? '0' : '') + month;
	return `${year}-${monthStr}-${dayStr}`;
}

export function time(): string {
	const d = new Date();
	const hour = d.getHours();
	const hourStr = (hour < 10 ? '0' : '') + hour;
	const min = d.getMinutes();
	const minStr = (min < 10 ? '0' : '') + min;
	const sec = d.getSeconds();
	const secStr = (sec < 10 ? '0' : '') + sec;
	return `${hourStr}:${minStr}:${secStr}`;
}

export function timeToSeconds(timeStr: string): number {
	if (!timeStr.match(/\d+:\d{1,2}:\d+\.?\d*/)) {
		throw `The parameter ${time} is in a wrong format '00:00:00.000' .`;
	}

	const a = timeStr.split(':'); // split it at the colons

	if (+a[1] >= 60 || +a[2] >= 60) {
		throw `The parameter ${time} is invalid, please follow the format "Hours:Minutes:Seconds.Milliseconds`;
	}

	a[2] = `${Math.floor(+a[2])}`; // Seconds can have miliseconds
	// minutes are worth 60 seconds. Hours are worth 60 minutes.

	return +a[0] * 60 * 60 + +a[1] * 60 + +a[2];
}

// FormatDateString From Duration in Seconds
export function duration(dur: number): string {
	if (typeof dur !== 'number') return '0 second';
	if (dur === 0) return '0 second';
	if (Math.floor(dur) !== dur || dur <= 0)
		throw `The parameter ${duration} is supposed to be "integer" and be superior to 0`;

	// calculate (and subtract) whole days
	const days = Math.floor(dur / 86400);

	dur -= days * 86400;

	// calculate (and subtract) whole hours
	const hours = Math.floor(dur / 3600) % 24;
	dur -= hours * 3600;

	// calculate (and subtract) whole minutes
	const minutes = Math.floor(dur / 60) % 60;
	dur -= minutes * 60;

	// what's left is seconds
	const seconds = dur % 60; // in theory the modulus is not required
	let returnString = '';
	if (days !== 0) returnString += `${days} day(s) `;
	if (hours !== 0) returnString += `${hours} hour(s) `;
	if (minutes !== 0) returnString += `${minutes} minute(s) `;
	if (seconds !== 0) returnString += `${seconds} second(s) `;
	return returnString;
}

export function Timer(delay: number) {
	let id: any;
	let started: Date;
	let remaining: number = delay;
	let running: boolean;

	this.start = () => {
		running = true;
		started = new Date();
		id = setTimeout(() => {}, remaining);
	};

	this.pause = () => {
		running = false;
		clearTimeout(id);
		remaining -= new Date().getTime() - started.getTime();
	};

	this.getTimeLeft = () => {
		if (running) {
			this.pause();
			this.start();
		}
		return remaining;
	};

	this.getStateRunning = () => {
		return running;
	};

	this.start();
}
