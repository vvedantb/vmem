/**
 * Web Worker for WebLLM inference.
 * Runs model loading and inference off the main thread to prevent UI freezes.
 */
import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};
