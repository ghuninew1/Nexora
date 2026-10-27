import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getStorageCapabilities, getStorageUsage, listStorages, StorageApiError } from '../services/storage';
import { StorageContext } from './storage-context';

const EMPTY_USAGE = { status: 'unavailable', usedBytes: null, quotaBytes: null, objectCount: null, measuredAt: null };
const initialState = { status: 'loading', storages: [], activeStorage: null, capabilities: null, usage: EMPTY_USAGE, error: null };

export function StorageProvider({ children }) {
  const auth = useAuth();
  const { status: authStatus, expireSession } = auth;
  const [state, setState] = useState(initialState);
  const controllerRef = useRef(null);
  const sequenceRef = useRef(0);

  const refresh = useCallback(async () => {
    if (authStatus !== 'authenticated') return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const sequence = ++sequenceRef.current;
    const isCurrent = () => !controller.signal.aborted && sequence === sequenceRef.current;
    setState(initialState);

    try {
      const storages = await listStorages({ signal: controller.signal });
      if (!isCurrent()) return;
      const activeStorage = storages.find((storage) => storage.status === 'active') ?? null;
      if (!activeStorage) {
        setState({ status: 'empty', storages, activeStorage: null, capabilities: null, usage: EMPTY_USAGE, error: null });
        return;
      }

      const [capabilityResult, usageResult] = await Promise.allSettled([
        getStorageCapabilities(activeStorage.storageId, { signal: controller.signal }),
        getStorageUsage(activeStorage.storageId, { signal: controller.signal }),
      ]);
      if (!isCurrent()) return;

      const capabilityError = capabilityResult.status === 'rejected' ? capabilityResult.reason : null;
      const usageError = usageResult.status === 'rejected' ? usageResult.reason : null;
      const unauthorizedError = [capabilityError, usageError].find((error) => error instanceof StorageApiError && error.status === 401);
      if (unauthorizedError) {
        expireSession();
        setState({ status: 'unavailable', storages, activeStorage, capabilities: null, usage: EMPTY_USAGE, error: unauthorizedError.message });
        return;
      }
      if (capabilityError) {
        setState({ status: 'unavailable', storages, activeStorage, capabilities: null, usage: EMPTY_USAGE, error: capabilityError.message || 'Storage is temporarily unavailable. Try again later.' });
        return;
      }

      setState({
        status: 'ready',
        storages,
        activeStorage,
        capabilities: capabilityResult.value,
        usage: usageResult.status === 'fulfilled' ? usageResult.value : EMPTY_USAGE,
        error: null,
      });
    } catch (error) {
      if (!isCurrent()) return;
      if (error instanceof StorageApiError && error.status === 401) expireSession();
      setState({ status: 'unavailable', storages: [], activeStorage: null, capabilities: null, usage: EMPTY_USAGE, error: error?.message || 'Storage is temporarily unavailable. Try again later.' });
    }
  }, [authStatus, expireSession]);

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      controllerRef.current?.abort();
      sequenceRef.current += 1;
      return undefined;
    }
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void refresh();
    });
    return () => {
      controller.abort();
      controllerRef.current?.abort();
      sequenceRef.current += 1;
    };
  }, [authStatus, refresh]);

  const visibleState = authStatus === 'authenticated' ? state : initialState;
  const value = useMemo(() => ({ ...visibleState, refresh }), [visibleState, refresh]);
  return <StorageContext.Provider value={value}>{children}</StorageContext.Provider>;
}
