import { createContext, useContext, useSyncExternalStore } from "react";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

const NetworkContext = createContext<boolean>(true);

let currentState = true;
const listeners = new Set<() => void>();

NetInfo.addEventListener((state: NetInfoState) => {
  const online =
    state.isConnected === true && state.isInternetReachable !== false;
  if (online !== currentState) {
    currentState = online;
    listeners.forEach((l) => l());
  }
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return currentState;
}

export function useIsOnline() {
  return useContext(NetworkContext);
}

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return (
    <NetworkContext.Provider value={isOnline}>
      {children}
    </NetworkContext.Provider>
  );
}
