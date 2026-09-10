'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { deleteField, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getStorageClient, getFirestoreClient } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileText, X, Loader2, Link2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';

interface InvitationUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  hostId: string;
  currentInvitationUrl?: string;
  currentInvitationName?: string;
  /** Existing external invitation link (Canva, Paperless Post, …) for prefill. */
  currentOnlineInvitationUrl?: string;
  currentOnlineInvitationLabel?: string;
  onUploaded?: (url: string, name: string) => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'application/pdf'];

export function InvitationUploadModal({
  open,
  onOpenChange,
  eventId,
  hostId,
  currentInvitationUrl,
  currentInvitationName,
  currentOnlineInvitationUrl,
  currentOnlineInvitationLabel,
  onUploaded,
}: InvitationUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Two ways to provide an invitation: a designed file, or a link to one the
  // host already made online (Canva, Paperless Post, a wedding page, …).
  const [mode, setMode] = useState<'upload' | 'link'>('upload');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Prefill the link form (and reset mode) each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setLinkUrl(currentOnlineInvitationUrl ?? '');
    setLinkLabel(currentOnlineInvitationLabel ?? '');
    setLinkError(null);
    setMode('upload');
  }, [open, currentOnlineInvitationUrl, currentOnlineInvitationLabel]);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setProgress(0);
    setError(null);
  };

  const handleFile = useCallback((selectedFile: File) => {
    setError(null);
    if (!ACCEPTED_TYPES.includes(selectedFile.type)) {
      setError('Please select an image (PNG, JPG, WEBP) or PDF file.');
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError('File size must be under 10 MB.');
      return;
    }
    setFile(selectedFile);
    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(selectedFile);
    } else {
      setPreview(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile]);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setError(null);

    const storage = getStorageClient();
    const db = getFirestoreClient();
    if (!storage || !db) {
      setError('Storage is not available. Please check your connection.');
      setUploading(false);
      return;
    }

    try {
      const timestamp = Date.now();
      const extension = file.name.split('.').pop();
      const filename = `invitation_${timestamp}.${extension}`;
      const storageRef = ref(storage, `invitations/${eventId}/${filename}`);

      const uploadTask = uploadBytesResumable(storageRef, file, {
        contentType: file.type,
        customMetadata: { hostId, eventId, originalName: file.name },
      });

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          setProgress(pct);
        },
        (err) => {
          setError(`Upload failed: ${err.message}`);
          setUploading(false);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          await updateDoc(doc(db, 'events', eventId), {
            invitationUrl: downloadURL,
            invitationName: file.name,
            invitationUploadedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
          onUploaded?.(downloadURL, file.name);
          onOpenChange(false);
        }
      );
    } catch (err: any) {
      setError(`Upload failed: ${err?.message ?? 'Unknown error'}`);
      setUploading(false);
    }
  };

  /** Persists the external online-invitation link (host-only event fields). */
  const saveLink = async () => {
    const db = getFirestoreClient();
    if (!db) { setLinkError('Connection is not available. Please try again.'); return; }
    const url = linkUrl.trim();
    const label = linkLabel.trim();
    if (!url) { setLinkError('Paste your invitation link first.'); return; }
    if (url.length > 2048) { setLinkError('That link is too long (max 2048 characters).'); return; }
    if (label.length > 80) { setLinkError('The label is too long (max 80 characters).'); return; }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setLinkError('The link must start with http:// or https://');
        return;
      }
    } catch {
      setLinkError('That does not look like a valid link.');
      return;
    }
    setLinkBusy(true);
    setLinkError(null);
    try {
      await updateDoc(doc(db, 'events', eventId), {
        onlineInvitationUrl: url,
        onlineInvitationLabel: label,
        updatedAt: serverTimestamp(),
      });
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
      toast.success('Online invitation link saved.');
      onOpenChange(false);
    } catch (err: any) {
      setLinkError(err?.message ?? 'Could not save the link.');
    } finally {
      setLinkBusy(false);
    }
  };

  /** Clears the stored online invitation link entirely. */
  const removeLink = async () => {
    const db = getFirestoreClient();
    if (!db) return;
    setLinkBusy(true);
    setLinkError(null);
    try {
      await updateDoc(doc(db, 'events', eventId), {
        onlineInvitationUrl: deleteField(),
        onlineInvitationLabel: deleteField(),
        updatedAt: serverTimestamp(),
      });
      setLinkUrl('');
      setLinkLabel('');
      toast.success('Online invitation link removed.');
      onOpenChange(false);
    } catch (err: any) {
      setLinkError(err?.message ?? 'Could not remove the link.');
    } finally {
      setLinkBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" onCloseAutoFocus={reset}>
        <DialogHeader>
          <DialogTitle>Invitation</DialogTitle>
          <DialogDescription>
            {mode === 'upload'
              ? 'Upload your custom invitation design to share with guests. Images up to 10 MB.'
              : 'Already designed your invitation online (Canva, Paperless Post, a wedding page)? Paste the link here.'}
          </DialogDescription>
        </DialogHeader>

        {/* Mode switcher — one invitation concept, two ways to provide it. */}
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant={mode === 'upload' ? 'default' : 'outline'} className="gap-2" onClick={() => setMode('upload')}>
            <Upload className="h-4 w-4" /> Upload file
          </Button>
          <Button type="button" variant={mode === 'link' ? 'default' : 'outline'} className="gap-2" onClick={() => setMode('link')}>
            <Link2 className="h-4 w-4" /> Online link
          </Button>
        </div>

        {mode === 'upload' ? (
        <div className="space-y-4 py-2">
          {currentInvitationUrl && !file && (
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground mb-2">Current invitation:</p>
              <div className="flex items-center gap-2">
                {currentInvitationUrl.match(/\.(png|jpg|jpeg|webp|gif)$/i) ? (
                  <img src={currentInvitationUrl} alt="Current" className="h-16 w-16 rounded object-cover" />
                ) : (
                  <FileText className="h-8 w-8 text-muted-foreground" />
                )}
                <span className="text-sm truncate flex-1">{currentInvitationName || 'Invitation file'}</span>
              </div>
            </div>
          )}

          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors ${
              dragActive ? 'border-primary bg-primary/10' : 'border-border/50 hover:border-primary/50'
            } ${file ? 'hidden' : ''}`}
          >
            <Upload className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium">Drop your invitation here</p>
            <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
            <p className="text-xs text-muted-foreground mt-2">PNG, JPG, WEBP, or PDF &middot; Max 10 MB</p>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>

          <AnimatePresence>
            {file && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="rounded-xl border border-border/50 bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  {preview ? (
                    <img src={preview} alt="Preview" className="h-24 w-24 rounded-lg object-cover border border-border/50" />
                  ) : (
                    <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-muted">
                      <FileText className="h-10 w-10 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    {uploading && (
                      <div className="mt-3">
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <motion.div
                            className="h-full bg-primary"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{progress}% uploaded</p>
                      </div>
                    )}
                  </div>
                  {!uploading && (
                    <button onClick={reset} className="text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={!file || uploading} className="gap-2">
              {uploading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</>
              ) : (
                <><Upload className="h-4 w-4" /> Upload Invitation</>
              )}
            </Button>
          </div>
        </div>
        ) : (
        <div className="space-y-4 py-2">
          {currentOnlineInvitationUrl && (
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground mb-2">Current online invitation:</p>
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <span className="text-sm truncate flex-1">{currentOnlineInvitationLabel || currentOnlineInvitationUrl}</span>
                <a
                  href={currentOnlineInvitationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-shrink-0 items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> Open
                </a>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="online-invitation-url">Invitation link</Label>
            <Input
              id="online-invitation-url"
              type="url"
              inputMode="url"
              placeholder="https://www.canva.com/design/..."
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              disabled={linkBusy}
            />
            <p className="text-xs text-muted-foreground">Stored with your ceremony — share it via Broadcast.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="online-invitation-label">Label (optional)</Label>
            <Input
              id="online-invitation-label"
              placeholder="e.g. Canva Invite"
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              maxLength={80}
              disabled={linkBusy}
            />
          </div>

          {linkError && <p className="text-sm text-destructive">{linkError}</p>}

          <div className="flex justify-between gap-2">
            {currentOnlineInvitationUrl ? (
              <Button variant="ghost" onClick={removeLink} disabled={linkBusy} className="gap-2 text-destructive hover:text-destructive">
                <X className="h-4 w-4" /> Remove
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={linkBusy}>Cancel</Button>
              <Button onClick={saveLink} disabled={linkBusy} className="gap-2">
                {linkBusy ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
                ) : (
                  <><Link2 className="h-4 w-4" /> Save link</>
                )}
              </Button>
            </div>
          </div>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
