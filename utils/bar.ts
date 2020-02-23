import cliProgress from 'cli-progress';
import {emitWS} from '../utils/ws';

interface BarOptions {
	message: string,
	event?: string
}

export default class Bar {

	options: {
		event?: string
	};
	total: number;
	start: number;
	value: number;
	format: string;
	bar: cliProgress.SingleBar;

	constructor(options: BarOptions, total: number) {
		this.options = options;
		this.total = total;
		this.start = 0;
		this.value = 0;
		this.format = `${options.message} {bar} {percentage}%`;
		this.bar = new cliProgress.Bar({
			format: this.format,
			stopOnComplete: true,
			barCompleteChar: '\u2588',
			barIncompleteChar: '\u2591',
			barsize: 30
		});
		this.bar.start(total, this.start);
		if (options.event) emitWS(options.event, {
			value: this.start,
			total: total,
			text: this.format.substr(0, this.format.indexOf('{'))
		});
	}

	emit = (num: number) => {
		if (this.options.event) emitWS(this.options.event, {
			value: num,
			total: this.total
		});
	}

	stop = () => {
		this.bar.stop();
		this.emit(this.total);
	};

	update = (num: number) => {
		this.bar.update(num);
		this.emit(num);
	}

	setTotal = (num: number) => {
		this.bar.setTotal(num);
		this.total = num;
		this.emit(this.value);
	}

	incr = () => {
		this.bar.increment(1);
		this.emit(this.value);
	};
}