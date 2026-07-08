/**
 * pMap Utility
 *
 * Runs an array of items through an async mapper function with a concurrency limit.
 * Similar to p-map but implemented simply to avoid external dependency issues.
 *
 * @param items The array of items to process
 * @param mapper The async function to run on each item
 * @param options Configuration options (concurrency)
 * @returns Promise resolving to an array of results in the same order as items
 */
export async function pMap<T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
  options: { concurrency: number },
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const iterator = items.entries();

  const workers = Array(Math.min(items.length, options.concurrency))
    .fill(null)
    .map(async () => {
      for (const [index, item] of iterator) {
        try {
          results[index] = await mapper(item, index);
        } catch (error) {
          throw error;
        }
      }
    });

  await Promise.all(workers);
  return results;
}
