interface QueuedJob {
  id: string;
  name: string;
  run: () => Promise<void>;
  attempts: number;
  maxRetries: number;
}

class AsyncJobQueue {
  private queue: QueuedJob[] = [];
  private active = 0;
  private completed = 0;
  private failed = 0;
  private readonly concurrency: number;
  private readonly maxQueueSize: number;

  constructor(concurrency = 4, maxQueueSize = 500) {
    this.concurrency = Math.max(1, concurrency);
    this.maxQueueSize = Math.max(20, maxQueueSize);
  }

  enqueue(name: string, run: () => Promise<void>, maxRetries = 2): boolean {
    if (this.queue.length >= this.maxQueueSize) {
      console.warn(`[jobQueue] Backpressure: queue full (${this.maxQueueSize}), dropping non-critical job ${name}`);
      return false;
    }
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    this.queue.push({ id, name, run, attempts: 0, maxRetries });
    this.drain();
    return true;
  }

  private drain(): void {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) break;
      this.active += 1;
      void this.execute(job);
    }
  }

  private async execute(job: QueuedJob): Promise<void> {
    job.attempts += 1;
    try {
      await job.run();
      this.completed += 1;
    } catch (err: any) {
      if (job.attempts <= job.maxRetries) {
        const delayMs = Math.min(5000, 300 * 2 ** job.attempts);
        setTimeout(() => {
          this.queue.push(job);
          this.drain();
        }, delayMs);
      } else {
        this.failed += 1;
        console.error(`[jobQueue] Job "${job.name}" failed after ${job.attempts} attempts:`, err?.message || err);
      }
    } finally {
      this.active -= 1;
      this.drain();
    }
  }

  getStats() {
    return {
      queued: this.queue.length,
      active: this.active,
      completed: this.completed,
      failed: this.failed,
      concurrency: this.concurrency,
      maxQueueSize: this.maxQueueSize,
    };
  }
}

export const backgroundQueue = new AsyncJobQueue(4, 500);
