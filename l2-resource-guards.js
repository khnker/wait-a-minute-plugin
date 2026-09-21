export class ResourceGuard {
  constructor(options = {}) {
    this.maxDuration = options.maxDuration || 5000;
  }

  async runWithTimeout(task) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.maxDuration);

    try {
      return await Promise.race([
        task(controller.signal),
        new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error("AbortError"))))
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }
}
