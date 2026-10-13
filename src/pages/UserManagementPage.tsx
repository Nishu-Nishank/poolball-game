import { useState, type FormEvent } from 'react';
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import { addAdmin, cancelEmailChange, isValidEmail, listAdmins, removeAdmin, updateAdminEmail, type AdminRow } from '../admin/adminApi';
import { useRemoteData } from '../hooks/useRemoteData';
import { formatDateTime } from '../utils/format';

type Notice = { severity: 'success' | 'error' | 'info'; text: string };

const date = (value: string | null) => (value ? formatDateTime(new Date(value)) : '—');

/** Superadmin only — enforced by the admin_* database functions, not just by this screen. */
export default function UserManagementPage() {
  const { data: rows, error: loadError, reload: load } = useRemoteData(listAdmins, 'Administrators could not be loaded.');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dialog, setDialog] = useState<{ kind: 'add' } | { kind: 'edit' | 'remove'; row: AdminRow } | null>(null);

  /** Runs an action, reports the outcome and reloads the list. Returns true on success. */
  const act = async (action: () => Promise<string>) => {
    try {
      setNotice({ severity: 'success', text: await action() });
      setDialog(null);
      return true;
    } catch (e) {
      setNotice({ severity: 'error', text: e instanceof Error ? e.message : 'The change could not be saved.' });
      return false;
    } finally {
      void load();
    }
  };

  return (
    <>
      <Alert severity="info">
        Administrators sign in with a one-time code sent to their email. Adding an email here does not create an account
        or send an invitation — tell the person to sign in at <strong>/login</strong>; access is linked to them when they
        verify that address. Removing an administrator stops further uploads immediately, even if they are signed in
        right now.
      </Alert>

      <Paper component="section" aria-labelledby="admins-title" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Typography id="admins-title" variant="h2" component="h2">
            Authorized administrators
          </Typography>
          <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setDialog({ kind: 'add' })}>
            Add admin
          </Button>
        </div>

        {loadError ? (
          <Alert severity="error" className="m-4">
            {loadError}
          </Alert>
        ) : !rows ? (
          <div className="p-6 text-center">
            <CircularProgress size={28} />
          </div>
        ) : (
          <TableContainer>
            <Table size="small" aria-label="Administrators">
              <TableHead>
                <TableRow>
                  <TableCell>Email</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Account</TableCell>
                  <TableCell>Last sign-in</TableCell>
                  <TableCell>Added</TableCell>
                  <TableCell>Last changed</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell sx={{ overflowWrap: 'anywhere' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {r.email}
                      </Typography>
                      {r.pending_email && (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <Chip size="small" color="warning" variant="outlined" label={`Changing to ${r.pending_email}`} />
                          <Button
                            size="small"
                            onClick={() => void act(async () => (await cancelEmailChange(r.id), 'Email change cancelled.'))}
                          >
                            Cancel change
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={r.role === 'superadmin' ? 'Superadmin' : 'Admin'}
                        color={r.role === 'superadmin' ? 'primary' : 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      {r.is_linked ? (
                        <Chip size="small" color="success" variant="outlined" label="Active" />
                      ) : (
                        <Tooltip title="Access is linked to the person the first time they sign in with this email.">
                          <Chip size="small" variant="outlined" label="Not signed in yet" />
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{date(r.last_sign_in_at)}</TableCell>
                    <TableCell>
                      <div className="whitespace-nowrap">{date(r.created_at)}</div>
                      {r.created_by_email && (
                        <Typography variant="caption" color="text.secondary">
                          by {r.created_by_email}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="whitespace-nowrap">{date(r.updated_at)}</div>
                      {r.updated_by_email && (
                        <Typography variant="caption" color="text.secondary">
                          by {r.updated_by_email}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {r.role === 'admin' ? (
                        <>
                          <Tooltip title="Edit email">
                            <IconButton aria-label={`Edit ${r.email}`} onClick={() => setDialog({ kind: 'edit', row: r })}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Remove admin">
                            <IconButton aria-label={`Remove ${r.email}`} color="error" onClick={() => setDialog({ kind: 'remove', row: r })}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </>
                      ) : (
                        <Tooltip title="Superadmin accounts are managed in the database (see README) so the last one can never be removed by accident.">
                          <Typography variant="caption" color="text.secondary">
                            Protected
                          </Typography>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {dialog?.kind === 'add' && (
        <EmailDialog
          title="Add admin"
          description="This person will be able to upload and publish tournament results after signing in with this email."
          submitLabel="Add admin"
          onClose={() => setDialog(null)}
          onSubmit={(email) =>
            act(async () => {
              await addAdmin(email);
              return `${email.trim().toLowerCase()} was added. They can now sign in at /login.`;
            })
          }
        />
      )}

      {dialog?.kind === 'edit' && (
        <EmailDialog
          title="Change admin email"
          initial={dialog.row.pending_email ?? dialog.row.email}
          description={
            dialog.row.is_linked
              ? `${dialog.row.email} has already signed in. The new address takes effect only after its owner signs in with it; until then ${dialog.row.email} keeps access, and afterwards loses it.`
              : 'This admin has not signed in yet, so the email is simply corrected.'
          }
          submitLabel="Save"
          onClose={() => setDialog(null)}
          onSubmit={(email) =>
            act(async () => {
              const result = await updateAdminEmail(dialog.row.id, email);
              if (result === 'pending') return `Verification pending: the change takes effect when ${email.trim().toLowerCase()} signs in.`;
              if (result === 'unchanged') return 'No change.';
              return 'Email updated.';
            })
          }
        />
      )}

      <Dialog open={dialog?.kind === 'remove'} onClose={() => setDialog(null)}>
        <DialogTitle>Remove administrator?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {dialog?.kind === 'remove' && (
              <>
                <strong>{dialog.row.email}</strong> will immediately lose permission to upload results — including in any session
                that is currently signed in. Published results are not affected. You can add them again later.
              </>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() =>
              dialog?.kind === 'remove' &&
              void act(async () => {
                await removeAdmin(dialog.row.id);
                return `${dialog.row.email} was removed.`;
              })
            }
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={notice !== null} autoHideDuration={notice?.severity === 'error' ? null : 6000} onClose={() => setNotice(null)}>
        {notice ? (
          <Alert severity={notice.severity} onClose={() => setNotice(null)} variant="filled">
            {notice.text}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
}

function EmailDialog(props: {
  title: string;
  description: string;
  submitLabel: string;
  initial?: string;
  onClose: () => void;
  onSubmit: (email: string) => Promise<boolean>;
}) {
  const [email, setEmail] = useState(props.initial ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) return setError('Enter a valid email address.');
    setBusy(true);
    await props.onSubmit(email);
    setBusy(false);
  };

  return (
    <Dialog open onClose={props.onClose} fullWidth maxWidth="sm">
      <form onSubmit={(e) => void submit(e)} noValidate>
        <DialogTitle>{props.title}</DialogTitle>
        <DialogContent className="flex flex-col gap-3">
          <DialogContentText>{props.description}</DialogContentText>
          <TextField
            label="Email address"
            type="email"
            autoFocus
            fullWidth
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            error={error !== null}
            helperText={error ?? ' '}
            disabled={busy}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={props.onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? <CircularProgress size={20} color="inherit" /> : props.submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
