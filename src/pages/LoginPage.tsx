import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, CircularProgress, Link, Paper, TextField, Typography } from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import { useAuth } from '../auth/AuthContext';
import { isValidEmail } from '../admin/adminApi';
import { linkProps, navigate } from '../router';

/** Passwordless sign-in: the user receives a one-time code by email (Supabase Auth OTP). */
export default function LoginPage() {
  const auth = useAuth();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in as an administrator (or arriving from a magic link): continue to the admin area.
  useEffect(() => {
    if (!auth.loading && auth.session && auth.role) navigate('admin', { replace: true });
  }, [auth.loading, auth.session, auth.role]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const sendCode = (e?: FormEvent) => {
    e?.preventDefault();
    if (!isValidEmail(email)) return setError('Enter a valid email address.');
    void run(async () => {
      await auth.sendCode(email);
      setStep('code');
    });
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6,10}$/.test(code.trim())) return setError('Enter the code from the email (digits only).');
    void run(async () => {
      const role = await auth.verifyCode(email, code);
      if (role) navigate('admin', { replace: true });
    });
  };

  const signedInWithoutAccess = !auth.loading && auth.session && !auth.role;

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <Paper className="w-full max-w-md p-6 sm:p-8">
        <div className="mb-5 flex items-center gap-3">
          <EmojiEventsIcon sx={{ color: '#d4a017', fontSize: 32 }} aria-hidden />
          <div>
            <Typography variant="h1" component="h1">
              Administrator sign in
            </Typography>
            <Typography variant="body2" color="text.secondary">
              4flow India 8-Ball Championship 2026
            </Typography>
          </div>
        </div>

        {!auth.configured ? (
          <Alert severity="info">
            <strong>Sign-in is not set up yet.</strong> Administrator sign-in needs a Supabase project: add{' '}
            <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to <code>.env</code> (see the
            README, “Deployment”) and restart the app. The public dashboard works without it.
          </Alert>
        ) : signedInWithoutAccess ? (
          <div className="flex flex-col gap-3">
            <Alert severity="warning">
              {auth.email} is signed in but is not an authorized administrator. Ask the superadmin to add this email
              address. Viewing the tournament does not require an account.
            </Alert>
            <Button variant="outlined" onClick={() => void auth.signOut()}>
              Sign out and use another email
            </Button>
          </div>
        ) : step === 'email' ? (
          <form onSubmit={sendCode} className="flex flex-col gap-4" noValidate>
            <Typography variant="body2" color="text.secondary">
              Enter your email address. We will send you a one-time sign-in link — no password needed.
            </Typography>
            <TextField
              label="Email address"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
            {error && <Alert severity="error">{error}</Alert>}
            <Button type="submit" variant="contained" size="large" disabled={busy}>
              {busy ? <CircularProgress size={24} color="inherit" /> : 'Send sign-in email'}
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-4" noValidate>
            <Alert severity="info">
              If <strong>{email}</strong> can sign in, an email is on its way — it can take a minute; check your spam folder
              too. <strong>Click the sign-in link in the email on this device</strong>, or, if the email contains a code, enter
              it below.
            </Alert>
            <TextField
              label="Sign-in code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              disabled={busy}
              slotProps={{ htmlInput: { maxLength: 10, 'aria-label': 'Sign-in code' } }}
            />
            {error && <Alert severity="error">{error}</Alert>}
            <Button type="submit" variant="contained" size="large" disabled={busy}>
              {busy ? <CircularProgress size={24} color="inherit" /> : 'Sign in'}
            </Button>
            <div className="flex justify-between gap-2">
              <Button size="small" onClick={() => sendCode()} disabled={busy}>
                Send a new email
              </Button>
              <Button
                size="small"
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setError(null);
                }}
                disabled={busy}
              >
                Use a different email
              </Button>
            </div>
          </form>
        )}

        <Typography variant="body2" className="!mt-6 text-center">
          <Link {...linkProps('dashboard')}>Back to the tournament dashboard</Link>
        </Typography>
      </Paper>
    </div>
  );
}
