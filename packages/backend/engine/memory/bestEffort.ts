export async function runBestEffort(
  run: () => Promise<unknown>,
  onError: (error: unknown) => void,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    onError(error);
  }
}
