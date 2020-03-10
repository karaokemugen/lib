import cliProgress from 'cli-progress';

interface BarOptions {
	message: string,
}

export default class Bar {

	options: {
		message: string
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
	}

	stop = () => {
		this.bar.stop();
	};

	update = (num: number) => {
		this.bar.update(num);
	}

	setTotal = (num: number) => {
		this.bar.setTotal(num);
		this.total = num;
	}

	incr = () => {
		this.bar.increment(1);
	};
}