// Shared concurrency queue to serialize child process scraper executions and prevent VPS overload
let executionQueue: Promise<any> = Promise.resolve();

export async function enqueueExecution<T>(fn: () => Promise<T>): Promise<T> {
  const next = () => fn();
  const resultPromise = executionQueue.then(next, next);
  executionQueue = resultPromise.catch(() => {}); // Prevent crashes from breaking the chain
  return resultPromise;
}
