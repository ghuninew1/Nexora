import { LoaderCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../ui/button';
import { cx } from '../../utils/cx';

export function AuthLoading() {
  return (
    <main className={cx('flex min-h-dvh items-center justify-center bg-background px-5 text-foreground')} aria-busy="true">
      <div role="status" className={cx('flex items-center gap-3 text-sm text-muted-foreground')}>
        <LoaderCircle className={cx('size-5 animate-spin motion-reduce:animate-none')} aria-hidden="true" />
        <span>Checking your session…</span>
      </div>
    </main>
  );
}

export function AuthUnavailable() {
  const { retrySession } = useAuth();
  return (
    <main className={cx('flex min-h-dvh items-center justify-center bg-background px-5 py-10 text-foreground')}>
      <section className={cx('glass-surface w-full max-w-md p-6 text-center sm:p-8')}>
        <h1 className={cx('text-lg font-semibold')}>Can’t verify your session</h1>
        <p className={cx('mt-2 text-sm leading-6 text-muted-foreground')}>
          Nexora couldn’t reach the sign-in service. Try again when your connection is available.
        </p>
        <div className={cx('mt-6 flex flex-col justify-center gap-3 sm:flex-row')}>
          <Button type="button" onClick={retrySession}>Try again</Button>
          <Button render={<Link to="/login" />} nativeButton={false} variant="outline">Go to sign in</Button>
        </div>
      </section>
    </main>
  );
}
