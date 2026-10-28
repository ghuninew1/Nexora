import { useContext } from 'react';
import { SharesContext } from '../context/shares-context';
export function useShares() { return useContext(SharesContext); }
