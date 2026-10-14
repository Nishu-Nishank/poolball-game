import { useRef, useState } from 'react';
import {
  Alert,
  AlertTitle,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import { IconButton, Tooltip } from '@mui/material';
import { useAuth } from '../auth/AuthContext';
import {
  activateUpload,
  deleteUpload,
  getUploadHistory,
  MAX_UPLOAD_MB,
  sendUpload,
  type UploadHistoryRow,
  type UploadResponse,
} from '../admin/adminApi';
import type { ImportIssue } from '../services/importValidation';
import { useRemoteData } from '../hooks/useRemoteData';
import { formatDateTime, plural } from '../utils/format';
import { linkProps } from '../router';

const ACCEPT = '.csv,.xlsx,.xls';
const STATUS: Record<UploadHistoryRow['status'], { label: string; color: 'success' | 'warning' | 'error' | 'default' }> = {
  published: { label: 'Published', color: 'success' },
  rejected: { label: 'Rejected', color: 'warning' },
  failed: { label: 'Failed', color: 'error' },
  processing: { label: 'Processing', color: 'default' },
};

const issueText = (i: ImportIssue) =>
  [i.source && `Row ${i.source.row}`, i.matchId && `match ${i.matchId}`].filter(Boolean).join(', ') + (i.source || i.matchId ? ': ' : '') + i.message;

export default function AdminUploadPage() {
  const auth = useAuth();
  const isSuperadmin = auth.role === 'superadmin';
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: history, error: historyError, reload: loadHistory } = useRemoteData(getUploadHistory, 'Upload history could not be loaded.');
  const [files, setFiles] = useState<File[]>([]);
  const file = files.length > 0 ? { name: files.map((f) => f.name).join(' + '), size: files.reduce((n, f) => n + f.size, 0) } : null;
  const [preview, setPreview] = useState<UploadResponse | null>(null);
  const [busy, setBusy] = useState<'preview' | 'publish' | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<{ severity: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [details, setDetails] = useState<UploadHistoryRow | null>(null);
  const [toDelete, setToDelete] = useState<UploadHistoryRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toActivate, setToActivate] = useState<UploadHistoryRow | null>(null);
  const [activating, setActivating] = useState(false);

  const confirmActivate = async () => {
    if (!toActivate) return;
    setActivating(true);
    try {
      await activateUpload(toActivate.id);
      setMessage({ severity: 'success', text: `${toActivate.file_name} is now live on the public dashboard.` });
      setToActivate(null);
    } catch (e) {
      setMessage({ severity: 'error', text: e instanceof Error ? e.message : 'The upload could not be made live.' });
    } finally {
      setActivating(false);
      void loadHistory();
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteUpload(toDelete.id);
      setMessage({ severity: 'success', text: `${toDelete.file_name} was deleted, including its stored file.` });
      setToDelete(null);
    } catch (e) {
      setMessage({ severity: 'error', text: e instanceof Error ? e.message : 'The upload could not be deleted.' });
    } finally {
      setDeleting(false);
      void loadHistory();
    }
  };

  const reset = () => {
    setFiles([]);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const choose = async (list: FileList | null) => {
    setMessage(null);
    setPreview(null);
    const selected = Array.from(list ?? []);
    if (selected.length === 0) return;
    // Quick checks for fast feedback; the server repeats all of them.
    const bad = selected.find((f) => !/\.(csv|xlsx|xls)$/i.test(f.name));
    if (bad) {
      setMessage({ severity: 'error', text: `${bad.name}: choose .csv, .xlsx or .xls files only.` });
      return;
    }
    if (selected.reduce((n, f) => n + f.size, 0) > MAX_UPLOAD_MB * 1024 * 1024) {
      setMessage({ severity: 'error', text: `The files are larger than ${MAX_UPLOAD_MB} MB together.` });
      return;
    }
    setFiles(selected);
    setBusy('preview');
    try {
      const { status, body } = await sendUpload(selected, 'preview');
      if (status === 200) setPreview(body);
      else {
        setMessage({ severity: 'error', text: body.error ?? `The file could not be checked (HTTP ${status}).` });
        if (status === 401 || status === 403) void auth.refreshAccess();
      }
    } catch (e) {
      setMessage({ severity: 'error', text: e instanceof Error ? e.message : 'The file could not be checked.' });
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    if (!file) return;
    setConfirmOpen(false);
    setBusy('publish');
    setMessage(null);
    try {
      const { status, body } = await sendUpload(files, 'publish');
      if (status === 200 && body.publishedAt) {
        setMessage({
          severity: 'success',
          text: `${file.name} was published on ${formatDateTime(new Date(body.publishedAt))}. The public dashboard now shows these results.`,
        });
        reset();
      } else if (status === 422) {
        setPreview((p) => ({ ...p, ...body }));
        setMessage({ severity: 'warning', text: 'Not published: the file did not pass validation. The current results remain live.' });
      } else {
        setMessage({ severity: 'error', text: body.error ?? `Publishing failed (HTTP ${status}). The current results remain live.` });
        if (status === 401 || status === 403) void auth.refreshAccess();
      }
    } catch (e) {
      setMessage({ severity: 'error', text: e instanceof Error ? e.message : 'Publishing failed. The current results remain live.' });
    } finally {
      setBusy(null);
      void loadHistory();
    }
  };

  const live = history?.find((h) => h.is_active) ?? null;
  const lastSuccess = history?.find((h) => h.status === 'published') ?? null;
  const latest = history?.[0] ?? null;

  return (
    <>
      {/* Status */}
      <section aria-label="Upload status" className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatusCard title="Live on the dashboard">
          {live ? (
            <>
              <Typography sx={{ fontWeight: 700 }}>{live.file_name}</Typography>
              <Typography variant="body2" color="text.secondary">
                Published {formatDateTime(live.completed_at ? new Date(live.completed_at) : null)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {plural(live.team_count ?? 0, 'team')} · {plural(live.match_count ?? 0, 'match', 'matches')}
              </Typography>
            </>
          ) : (
            <Typography color="text.secondary">{history ? 'Nothing published yet' : '…'}</Typography>
          )}
        </StatusCard>
        <StatusCard title="Last successful upload">
          {lastSuccess ? (
            <>
              <Typography sx={{ fontWeight: 700 }}>{formatDateTime(lastSuccess.completed_at ? new Date(lastSuccess.completed_at) : null)}</Typography>
              <Typography variant="body2" color="text.secondary">{lastSuccess.file_name}</Typography>
            </>
          ) : (
            <Typography color="text.secondary">{history ? 'None yet' : '…'}</Typography>
          )}
        </StatusCard>
        <StatusCard title="Latest upload">
          {latest ? (
            <>
              <div className="flex items-center gap-2">
                <Typography sx={{ fontWeight: 700 }} noWrap>
                  {latest.file_name}
                </Typography>
                <Chip size="small" label={STATUS[latest.status].label} color={STATUS[latest.status].color} />
              </div>
              <Typography variant="body2" color="text.secondary">
                {formatDateTime(new Date(latest.uploaded_at))}
              </Typography>
            </>
          ) : (
            <Typography color="text.secondary">{history ? 'None yet' : '…'}</Typography>
          )}
        </StatusCard>
      </section>

      {/* Upload */}
      <Paper component="section" aria-labelledby="upload-title" className="p-4 sm:p-5">
        <Typography id="upload-title" variant="h2" component="h2" className="!mb-1">
          Upload results
        </Typography>
        <Typography variant="body2" color="text.secondary" className="!mb-1">
          Upload only the stage that changed — the file name says which part of the live results it replaces; everything
          else is kept:
        </Typography>
        <ul className="mt-0 mb-3 list-disc pl-5 text-sm text-slate-600">
          <li>
            name contains <strong>group</strong> → teams and group-stage results (e.g. <code>4IBC_group_stage.csv</code>)
          </li>
          <li>
            <strong>qf</strong> or <strong>quarter</strong> → quarter finals · <strong>sf</strong> or <strong>semi</strong> → semi
            finals · <strong>final</strong> → the Final (and any other rounds in the file)
          </li>
          <li>
            a name without a keyword (or the full <code>.xlsx</code> workbook) replaces everything — select the group file
            and the finals file together in that case
          </li>
        </ul>
        <Typography variant="body2" color="text.secondary" className="!mb-4">
          .xlsx, .xls or .csv, up to {MAX_UPLOAD_MB} MB in total. Every upload is checked first and only published after you
          confirm; if anything is wrong, the current results stay live.
        </Typography>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="contained"
            startIcon={busy === 'preview' ? <CircularProgress size={18} color="inherit" /> : <UploadFileIcon />}
            onClick={() => inputRef.current?.click()}
            disabled={busy !== null}
          >
            {file ? 'Choose other files' : 'Choose file(s)'}
          </Button>
          <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => void choose(e.target.files)} />
          {file && (
            <Typography variant="body2">
              <strong>{file.name}</strong> · {(file.size / 1024).toFixed(0)} KB
            </Typography>
          )}
          {busy === 'preview' && <Typography variant="body2">Checking the file…</Typography>}
        </div>

        {message && (
          <Alert severity={message.severity} className="!mt-4" onClose={() => setMessage(null)}>
            {message.text}
            {message.severity === 'success' && (
              <>
                {' '}
                <a {...linkProps('dashboard')} className="font-semibold underline">
                  View dashboard
                </a>
              </>
            )}
          </Alert>
        )}

        {preview && file && <PreviewPanel preview={preview} />}

        {preview && file && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="contained"
              color="success"
              disabled={!preview.ok || busy !== null}
              onClick={() => setConfirmOpen(true)}
              startIcon={busy === 'publish' ? <CircularProgress size={18} color="inherit" /> : <CheckCircleIcon />}
            >
              Publish results
            </Button>
            <Button onClick={reset} disabled={busy !== null}>
              Cancel
            </Button>
            {!preview.ok && (
              <Typography variant="body2" color="error" className="self-center">
                Fix the errors in the file and upload it again.
              </Typography>
            )}
          </div>
        )}
      </Paper>

      {/* History */}
      <Paper component="section" aria-labelledby="history-title" className="overflow-hidden">
        <Typography id="history-title" variant="h2" component="h2" className="px-4 py-3">
          Upload history
        </Typography>
        {historyError ? (
          <Alert severity="error" className="m-4">
            {historyError}
          </Alert>
        ) : !history ? (
          <div className="p-6 text-center">
            <CircularProgress size={28} />
          </div>
        ) : history.length === 0 ? (
          <Typography color="text.secondary" className="px-4 pb-5">
            No uploads yet.
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small" aria-label="Upload history">
              <TableHead>
                <TableRow>
                  <TableCell>Uploaded</TableCell>
                  <TableCell>File</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="center">Teams</TableCell>
                  <TableCell align="center">Matches</TableCell>
                  {isSuperadmin && <TableCell>Uploaded by</TableCell>}
                  <TableCell>Details</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(new Date(h.uploaded_at))}</TableCell>
                    <TableCell sx={{ maxWidth: 260, overflowWrap: 'anywhere' }}>{h.file_name}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Chip size="small" label={STATUS[h.status].label} color={STATUS[h.status].color} />
                        {h.is_active && <Chip size="small" label="Live" color="primary" />}
                      </div>
                    </TableCell>
                    <TableCell align="center">{h.team_count ?? '—'}</TableCell>
                    <TableCell align="center">{h.match_count ?? '—'}</TableCell>
                    {isSuperadmin && <TableCell>{h.uploaded_by_email ?? '—'}</TableCell>}
                    <TableCell>
                      {h.error_summary?.length ? (
                        <Button size="small" onClick={() => setDetails(h)}>
                          {plural(h.error_summary.length, 'error')}
                        </Button>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {h.status === 'published' && !h.is_active && (
                        <Button size="small" variant="outlined" onClick={() => setToActivate(h)} sx={{ mr: 0.5 }}>
                          Make live
                        </Button>
                      )}
                      {(() => {
                        const reason = h.is_active
                          ? 'The live dataset cannot be deleted'
                          : !isSuperadmin && !h.is_mine
                            ? 'Only your own uploads can be deleted'
                            : null;
                        return (
                          <Tooltip title={reason ?? 'Delete this upload and its file'}>
                            <span>
                              <IconButton
                                size="small"
                                color="error"
                                disabled={reason !== null}
                                aria-label={`Delete ${h.file_name}`}
                                onClick={() => setToDelete(h)}
                              >
                                <DeleteOutlinedIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Publish these results?</DialogTitle>
        <DialogContent>
          <Typography>
            <strong>{file?.name}</strong>{' '}
            {preview?.partial
              ? `will replace ${preview.updated?.join(', ') || 'the named stage'} in the live results; everything else stays as it is`
              : 'will replace the results currently shown on the public dashboard'}
            {preview?.summary && ` (${plural(preview.summary.teams, 'team')}, ${plural(preview.summary.completed, 'completed match', 'completed matches')})`}.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" color="success" onClick={() => void publish()}>
            Publish
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={toActivate !== null} onClose={() => !activating && setToActivate(null)}>
        <DialogTitle>Make this upload live?</DialogTitle>
        <DialogContent>
          <Typography>
            The public dashboard will switch to <strong>{toActivate?.file_name}</strong> (published{' '}
            {toActivate && formatDateTime(toActivate.completed_at ? new Date(toActivate.completed_at) : null)}
            {toActivate?.team_count != null && `, ${plural(toActivate.team_count, 'team')}`}
            {toActivate?.match_count != null && `, ${plural(toActivate.match_count, 'match', 'matches')}`}) within a minute.
            “Last updated” will show that upload’s original publication time. You can switch back the same way.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setToActivate(null)} disabled={activating}>
            Cancel
          </Button>
          <Button variant="contained" color="success" onClick={() => void confirmActivate()} disabled={activating}>
            {activating ? <CircularProgress size={20} color="inherit" /> : 'Make live'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={toDelete !== null} onClose={() => !deleting && setToDelete(null)}>
        <DialogTitle>Delete this upload?</DialogTitle>
        <DialogContent>
          <Typography>
            <strong>{toDelete?.file_name}</strong> ({toDelete && formatDateTime(new Date(toDelete.uploaded_at))}) will be removed
            from the history together with its stored file and parsed data. This cannot be undone. The dashboard is not
            affected.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setToDelete(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={() => void confirmDelete()} disabled={deleting}>
            {deleting ? <CircularProgress size={20} color="inherit" /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={details !== null} onClose={() => setDetails(null)} maxWidth="md" fullWidth>
        <DialogTitle>Validation errors — {details?.file_name}</DialogTitle>
        <DialogContent>
          <ul className="m-0 list-disc space-y-1 pl-5 text-sm">
            {details?.error_summary?.map((i, n) => <li key={n}>{issueText(i)}</li>)}
          </ul>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetails(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function StatusCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper className="flex min-w-0 flex-col gap-0.5 p-4">
      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }} className="!mb-1">
        {title}
      </Typography>
      {children}
    </Paper>
  );
}

const STATE_CHIP: Record<string, { label: string; color: 'success' | 'default' | 'error' | 'warning' }> = {
  counted: { label: 'Complete', color: 'success' },
  pending: { label: 'To play', color: 'default' },
  flagged: { label: 'Error', color: 'error' },
  duplicate: { label: 'Duplicate', color: 'warning' },
};

function PreviewPanel({ preview }: { preview: UploadResponse }) {
  const [tab, setTab] = useState<'matches' | 'teams'>('matches');
  const s = preview.summary;
  const errors = preview.errors ?? [];
  const warnings = preview.warnings ?? [];

  return (
    <div className="mt-4 flex flex-col gap-3">
      {s && (
        <div className="flex flex-wrap gap-2" aria-label="Import summary">
          <Chip label={plural(s.teams, 'team')} />
          <Chip label={`${s.completed} completed`} color="success" variant="outlined" />
          <Chip label={`${s.pending} to play`} variant="outlined" />
          {s.groups.length > 0 && <Chip label={`Groups ${s.groups.join(', ')}`} variant="outlined" />}
          <Chip
            label={s.knockout > 0 ? `${plural(s.knockout, 'knockout match', 'knockout matches')}` : 'No finals sheet'}
            variant="outlined"
            color={s.knockout > 0 ? 'primary' : 'default'}
          />
          {s.matchSheet && <Chip label={`Sheet: ${s.matchSheet}`} variant="outlined" />}
        </div>
      )}

      {preview.partial && (
        <Alert severity="info">
          <strong>Partial update:</strong> this upload replaces {preview.updated?.join(', ') || 'the named stage'}; teams,
          results and rounds not in these files are kept from the live dataset. The preview shows the combined result.
        </Alert>
      )}
      {preview.ok ? (
        <Alert severity="success">The file passed validation. Review the preview, then publish.</Alert>
      ) : (
        <Alert severity="error">
          <AlertTitle>
            {plural(preview.errorCount ?? errors.length, 'error')} — this file cannot be published
          </AlertTitle>
          <ul className="m-0 max-h-56 list-disc space-y-0.5 overflow-auto pl-5">
            {errors.map((i, n) => (
              <li key={n}>{issueText(i)}</li>
            ))}
          </ul>
        </Alert>
      )}
      {warnings.length > 0 && (
        <Alert severity="warning">
          <ul className="m-0 list-disc pl-5">
            {warnings.map((i, n) => (
              <li key={n}>{issueText(i)}</li>
            ))}
          </ul>
        </Alert>
      )}

      {(preview.matches?.length ?? 0) > 0 && (
        <Paper variant="outlined" className="overflow-hidden">
          <Tabs value={tab} onChange={(_, v) => setTab(v)} aria-label="Preview">
            <Tab value="matches" label={`Matches (${preview.matches?.length ?? 0})`} />
            <Tab value="teams" label={`Teams (${preview.teams?.length ?? 0})`} />
          </Tabs>
          <TableContainer sx={{ maxHeight: 420 }}>
            {tab === 'matches' ? (
              <Table size="small" stickyHeader aria-label="Match preview">
                <TableHead>
                  <TableRow>
                    <TableCell>Row</TableCell>
                    <TableCell>Match</TableCell>
                    <TableCell>Group</TableCell>
                    <TableCell>Teams</TableCell>
                    <TableCell>Winner</TableCell>
                    <TableCell align="center">Loser balls</TableCell>
                    <TableCell align="center">Pts</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.matches?.map((m) => (
                    <TableRow key={`${m.row}`} sx={m.state === 'flagged' || m.state === 'duplicate' ? { bgcolor: '#fef2f2' } : undefined}>
                      <TableCell>{m.row}</TableCell>
                      <TableCell>{m.id ?? '—'}</TableCell>
                      <TableCell>{m.group ?? '—'}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {m.teamA} vs {m.teamB}
                      </TableCell>
                      <TableCell>{m.winner ?? '—'}</TableCell>
                      <TableCell align="center">{m.ballsLost ?? '—'}</TableCell>
                      <TableCell align="center">{m.state === 'counted' ? `+${m.points}` : '—'}</TableCell>
                      <TableCell>
                        <Chip size="small" label={STATE_CHIP[m.state].label} color={STATE_CHIP[m.state].color} />
                        {m.reasons.length > 0 && (
                          <Typography variant="caption" color="error" component="div">
                            {m.reasons.join(' ')}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Table size="small" stickyHeader aria-label="Team preview">
                <TableHead>
                  <TableRow>
                    <TableCell>Team</TableCell>
                    <TableCell>Group</TableCell>
                    <TableCell>Members</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.teams?.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell sx={{ fontWeight: 600 }}>{t.label}</TableCell>
                      <TableCell>{t.group ?? '—'}</TableCell>
                      <TableCell>{t.members.join(', ') || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TableContainer>
        </Paper>
      )}
    </div>
  );
}
