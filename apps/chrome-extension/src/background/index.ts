import { registerContextMenu } from "./context-menu";
import { registerMessageHandler } from "./message-handler";

chrome.runtime.onInstalled.addListener(() => {
  registerContextMenu();
});

registerMessageHandler();
