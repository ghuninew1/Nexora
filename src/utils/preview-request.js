export class PreviewRequestCoordinator {
  constructor() {
    this.sequence = 0;
    this.controller = null;
  }

  begin() {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const sequence = ++this.sequence;
    return { sequence, signal: controller.signal };
  }

  isCurrent(request) {
    return Boolean(request && !request.signal.aborted && request.sequence === this.sequence);
  }

  cancel() {
    this.sequence += 1;
    this.controller?.abort();
    this.controller = null;
  }
}
