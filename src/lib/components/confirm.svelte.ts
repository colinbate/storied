class Confirmable {
	confirming = $state(false);
	ready = $state(false);
	private onconfirm: () => void;
	private pauseMs: number;

	constructor(onconfirm: () => void, pauseMs = 4000) {
		this.onconfirm = onconfirm;
		this.pauseMs = pauseMs;
	}

	onclick = () => {
		if (!this.confirming) {
			this.confirming = true;
			setTimeout(() => (this.ready = true), 350);
			setTimeout(() => {
				this.ready = false;
				this.confirming = false;
			}, this.pauseMs);
		} else if (this.ready) {
			this.confirming = false;
			this.ready = false;
			this.onconfirm();
		}
	};
}

export function createConfirm(onconfirm: () => void, pauseMs = 4000) {
	return new Confirmable(onconfirm, pauseMs);
}
