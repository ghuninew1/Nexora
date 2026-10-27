import { useEffect, useState } from 'react';
import { Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { cx } from '../utils/cx';
import fullLogo from '../assets/logo_full.avif';

export default function Login() {
  const { login, retrySession, status } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Sign in — Nexora';
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError('');
    try {
      await login(email, password);
      setPassword('');
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Sign-in is temporarily unavailable. Try again later.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={cx('relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground sm:px-6')}>
      <div aria-hidden="true" className={cx('pointer-events-none absolute inset-0 -z-10 overflow-hidden')}>
        <div className={cx('absolute -left-32 top-1/4 size-96 rounded-full bg-cyan-500/8 blur-3xl')} />
        <div className={cx('absolute -right-32 bottom-1/4 size-96 rounded-full bg-indigo-500/8 blur-3xl')} />
      </div>

      <div className={cx('w-full max-w-md')}>
        <header className={cx('mb-7 flex flex-col items-center text-center')}>
          <img src={fullLogo} alt="Nexora" className={cx('h-10 w-auto max-w-full object-contain')} />
          <h1 className={cx('mt-6 text-xl font-semibold tracking-tight')}>Private Cloud Workspace</h1>
          <p className={cx('mt-2 text-sm text-muted-foreground')}>Sign in to access your workspace.</p>
        </header>

        <section className={cx('glass-surface p-5 sm:p-7')} aria-labelledby="login-heading">
          <h2 id="login-heading" className={cx('sr-only')}>Sign in</h2>

          {status === 'error' && (
            <div className={cx('mb-5 flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/50 p-3 text-sm')} role="status">
              <p className={cx('leading-5 text-muted-foreground')}>We couldn’t verify an existing session. You can still try signing in.</p>
              <Button type="button" variant="ghost" size="sm" className={cx('shrink-0')} onClick={retrySession}>Retry</Button>
            </div>
          )}

          <form onSubmit={handleSubmit} className={cx('space-y-5')}>
            <div className={cx('space-y-2')}>
              <label htmlFor="login-email" className={cx('text-sm font-medium')}>Email</label>
              <Input
                id="login-email"
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                disabled={isSubmitting}
                aria-describedby={error ? 'login-error' : undefined}
                className={cx('min-h-11 px-3')}
              />
            </div>

            <div className={cx('space-y-2')}>
              <label htmlFor="login-password" className={cx('text-sm font-medium')}>Password</label>
              <div className={cx('relative')}>
                <Input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  disabled={isSubmitting}
                  aria-describedby={error ? 'login-error' : undefined}
                  className={cx('min-h-11 px-3 pr-12')}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className={cx('absolute right-1 top-1/2 -translate-y-1/2')}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  disabled={isSubmitting}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </Button>
              </div>
            </div>

            {error && <p id="login-error" className={cx('text-sm text-destructive')} role="alert" aria-live="polite">{error}</p>}

            <Button type="submit" className={cx('w-full')} disabled={isSubmitting} aria-busy={isSubmitting}>
              {isSubmitting ? (
                <><LoaderCircle className={cx('size-4 animate-spin motion-reduce:animate-none')} aria-hidden="true" /> Signing in…</>
              ) : 'Sign in'}
            </Button>
          </form>
        </section>

        <p className={cx('mt-6 text-center text-xs leading-5 text-muted-foreground')}>
          Secure private access · Accounts are provided by your workspace administrator.
        </p>
      </div>
    </main>
  );
}
