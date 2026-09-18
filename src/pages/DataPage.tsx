import { useLiveQuery } from 'dexie-react-hooks'
import { CloudUpload, Download, FileSpreadsheet, FileUp, HardDrive, Share2, ShieldCheck, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { PageHeader, Panel, Section } from '@/components/common'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { db } from '@/db'
import { type BackupFile, countBackupRecords, exportBackup, mergeBackup, parseBackup, restoreBackup, transactionsCsv } from '@/db/backup'
import { removeImportBatch } from '@/db/importCommit'
import { updateSettings } from '@/db/repo'
import { useSettings } from '@/hooks/useData'
import { useSyncStore } from '@/sync/controller'
import { formatShortDate, formatTime } from '@/lib/dates'
import { canShareFiles, downloadBlob, shareBlob, todayStamp } from '@/lib/download'

type Confirm =
  | { kind: 'restore'; file: BackupFile; name: string }
  | { kind: 'undo-import'; batchId: string; label: string }
  | { kind: 'erase' }

export function DataPage() {
  const settings = useSettings()
  const syncUser = useSyncStore((s) => s.user)
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [usage, setUsage] = useState<string | null>(null)
  const batches = useLiveQuery(() => db.importBatches.orderBy('createdAt').reverse().toArray(), [], [])
  const counts = useLiveQuery(async () => ({ txns: await db.transactions.count(), people: await db.people.count() }), [], { txns: 0, people: 0 })
  const shareable = canShareFiles()

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted)
    void navigator.storage?.estimate?.().then((e) => {
      if (e.usage != null) setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB used`)
    })
  }, [])

  async function backup(mode: 'download' | 'share') {
    const file = await exportBackup()
    const blob = new Blob([JSON.stringify(file)], { type: 'application/json' })
    const name = `evenly-backup-${todayStamp()}.json`
    if (mode === 'share') {
      if (!(await shareBlob(blob, name))) return
    } else downloadBlob(blob, name)
    await updateSettings({ lastBackupAt: Date.now() })
    toast.success('Backup saved')
  }

  async function exportCsv() {
    const csv = await transactionsCsv()
    downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `evenly-expenses-${todayStamp()}.csv`)
  }

  async function onRestoreFile(f: File | undefined) {
    if (!f) return
    try {
      const parsed = parseBackup(await f.text())
      setConfirm({ kind: 'restore', file: parsed, name: f.name })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function runMerge() {
    if (confirm?.kind !== 'restore') return
    const n = await mergeBackup(confirm.file)
    toast.success(`Added ${n} ${n === 1 ? 'record' : 'records'} from ${confirm.name}`)
    setConfirm(null)
  }

  async function runConfirm() {
    if (!confirm) return
    if (confirm.kind === 'restore') {
      await restoreBackup(confirm.file)
      toast.success('Backup restored')
    } else if (confirm.kind === 'undo-import') {
      await removeImportBatch(confirm.batchId)
      toast.success('Import removed')
    } else {
      await db.delete()
      window.location.assign('/')
      return
    }
    setConfirm(null)
  }

  return (
    <>
      <PageHeader title="Backup & export" backTo="/more" />
      <div className="space-y-6 px-4 pt-2 lg:max-w-3xl">
        <Panel className="flex items-start gap-3">
          <HardDrive className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
          <div className="space-y-1 text-sm">
            <p className="font-medium">{syncUser ? `Saved on this phone and synced to ${syncUser.email}` : 'Your data lives only on this phone'}</p>
            <p className="text-muted-foreground">
              {counts.txns} expenses · {counts.people} people{usage ? ` · ${usage}` : ''}. Save a backup to Google Drive or Files regularly.
            </p>
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <ShieldCheck className="size-4" aria-hidden />
              {persisted == null ? 'Checking storage protection…' : persisted ? 'Protected from automatic clean-up' : 'Browser may clear data if space runs low. Install the app for better protection.'}
            </p>
            <p className="text-muted-foreground">
              Last backup: {settings.lastBackupAt ? `${formatShortDate(settings.lastBackupAt)}, ${formatTime(settings.lastBackupAt)}` : 'never'}
            </p>
          </div>
        </Panel>

        <Section title="Backup">
          <div className="grid gap-2">
            {shareable ? (
              <Button className="h-12 justify-start" onClick={() => void backup('share')}>
                <Share2 aria-hidden /> Save backup to Drive, WhatsApp…
              </Button>
            ) : null}
            <Button variant={shareable ? 'secondary' : 'default'} className="h-12 justify-start" onClick={() => void backup('download')}>
              <CloudUpload aria-hidden /> Download backup file
            </Button>
            <Button variant="secondary" className="h-12 justify-start" onClick={() => fileRef.current?.click()}>
              <FileUp aria-hidden /> Load a backup or data file
            </Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void onRestoreFile(e.target.files?.[0])} />
          </div>
        </Section>

        <Section title="Export">
          <div className="grid gap-2">
            <Button variant="secondary" className="h-12 justify-start" onClick={() => void exportCsv()}>
              <Download aria-hidden /> Export expenses as CSV
            </Button>
            <Button asChild variant="secondary" className="h-12 justify-start">
              <Link to="/import">
                <FileSpreadsheet aria-hidden /> Import from Excel
              </Link>
            </Button>
          </div>
        </Section>

        {batches.length ? (
          <Section title="Imports">
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
              {batches.map((b) => (
                <li key={b.id} className="flex min-h-16 items-center gap-3 px-4 py-3">
                  <FileSpreadsheet className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{b.fileName}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatShortDate(b.createdAt)} · {b.transactionCount} expenses · {b.ledgerCount} entries
                    </p>
                  </div>
                  <Button variant="ghost" className="h-11" onClick={() => setConfirm({ kind: 'undo-import', batchId: b.id, label: b.fileName })}>
                    <Undo2 aria-hidden /> Undo
                  </Button>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <Section title="Danger zone">
          <Button variant="ghost" className="h-12 w-full justify-start text-negative hover:text-negative" onClick={() => setConfirm({ kind: 'erase' })}>
            <Trash2 aria-hidden /> Erase all data on this phone
          </Button>
        </Section>
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === 'restore' ? 'Load this file?' : confirm?.kind === 'undo-import' ? 'Remove this import?' : 'Erase everything?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === 'restore'
                ? `"${confirm.name}" has ${countBackupRecords(confirm.file)} records. Add them to what's already here, or replace everything with the file's contents.`
                : confirm?.kind === 'undo-import'
                  ? `All expenses and entries imported from "${confirm.label}" will be deleted.`
                  : syncUser
                    ? `All data on this phone will be deleted. Your cloud copy in ${syncUser.email} is kept and downloads again while you're signed in. To remove it too, use Account & sync → Delete my cloud data.`
                    : 'All expenses, budgets, people and settings on this phone will be permanently deleted. Download a backup first if you might need it.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction className="h-11 bg-destructive text-white hover:bg-destructive/90" onClick={() => void runConfirm()}>
              {confirm?.kind === 'restore' ? 'Replace everything' : confirm?.kind === 'undo-import' ? 'Remove' : 'Erase'}
            </AlertDialogAction>
            {confirm?.kind === 'restore' ? (
              <AlertDialogAction className="h-11" onClick={() => void runMerge()}>
                Add to my data
              </AlertDialogAction>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
