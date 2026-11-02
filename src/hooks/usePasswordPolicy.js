import { useEffect, useState } from 'react';

export function usePasswordPolicy() {
  const [policy, setPolicy] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/config', { signal: controller.signal, cache: 'no-store' }).then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(({ data }) => {
      if ([8, 10, 12, 14, 16].includes(data.passwordMinLength) && typeof data.strongPasswordRequired === 'boolean') setPolicy({ passwordMinLength: data.passwordMinLength, strongPasswordRequired: data.strongPasswordRequired });
    }).catch(() => {});
    return () => controller.abort();
  }, []);
  return policy;
}
