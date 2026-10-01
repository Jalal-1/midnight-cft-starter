import { useContext } from 'react';
import { CftContext, type CftContextValue } from './CftProvider';

export function useCft(): CftContextValue {
  const ctx = useContext(CftContext);
  if (!ctx) throw new Error('useCft must be used inside <CftProvider>');
  return ctx;
}
