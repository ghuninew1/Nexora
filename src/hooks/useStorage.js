import { useContext } from 'react';
import { StorageContext } from '../context/storage-context';

export function useStorage() {
  const storage = useContext(StorageContext);
  if (!storage) throw new Error('useStorage must be used inside StorageProvider');
  return storage;
}
