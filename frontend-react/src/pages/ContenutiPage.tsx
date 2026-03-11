import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Page, Layout, Card, Text, Badge, Button, InlineStack, BlockStack, Box,
  TextField, Spinner, Banner, Tabs, ProgressBar, Modal, Divider,
  Avatar, EmptyState, ButtonGroup, Select
} from '@shopify/polaris';
import {
  ArrowLeftIcon, ImportIcon, ExternalIcon
} from '@shopify/polaris-icons';
import { useAuth } from '../hooks/useAuth';
import { useSearchParams } from 'react-router-dom';
import { getServiceUrl } from '../utils/apiConfig';
import { toast } from '../utils/toast';
import {
  createSubtitleJob, getSubtitleJobs, getSubtitleJobById, submitForReview,
  approveJob, rejectJob, updateSubtitleVersion, downloadSubtitles,
  getComments, createComment, deleteComment,
} from '../services/subtitlesApi';
import type { SubtitleJob, SubtitleVersion, ContentComment } from '../services/subtitlesApi';
import SubtitleLineEditor from '../components/subtitles/SubtitleLineEditor';
import type { SubtitleLine } from '../components/subtitles/SubtitleLineEditor';

// ========================
// TYPES
// ========================
interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  thumbnailLink?: string;
  size?: string;
  createdTime?: string;
  parents?: string[];
}

// ========================
// HELPERS
// ========================
const CLIENTI_URL = () => getServiceUrl('clienti');
const getToken = () => localStorage.getItem('auth_token') || '';

const isVideoFile = (f: DriveFile) =>
  f.mimeType?.includes('video') || /\.(mp4|mov|avi|mkv|webm)$/i.test(f.name);
const isImageFile = (f: DriveFile) =>
  f.mimeType?.includes('image') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f.name);
const isFolder = (f: DriveFile) =>
  f.mimeType === 'application/vnd.google-apps.folder';

const formatSize = (bytes?: string) => {
  if (!bytes) return '';
  const b = parseInt(bytes);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (d?: string) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
};

// formatTime is used by SubtitleLineEditor, not needed here

// ========================
// MAIN COMPONENT
// ========================
const ContenutiPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Navigation state
  const [view, setView] = useState<'home' | 'detail'>('home');
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setCurrentFolderId] = useState<string | undefined>();
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string }[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Detail state
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [selectedClienteId, setSelectedClienteId] = useState<string>('');
  const [selectedClienteName, setSelectedClienteName] = useState<string>('');
  const [detailTab, setDetailTab] = useState(0);

  // Subtitle state
  const [subtitleJob, setSubtitleJob] = useState<(SubtitleJob & { versions?: SubtitleVersion[] }) | null>(null);
  const [subtitles, setSubtitles] = useState<SubtitleLine[]>([]);
  const [currentVersion, setCurrentVersion] = useState(0);
  const [generatingSubtitles, setGeneratingSubtitles] = useState(false);
  const [savingSubtitles, setSavingSubtitles] = useState(false);
  const [contentType, setContentType] = useState<'organico' | 'paid_ads'>('organico');

  // Video state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);

  // Comments state
  const [comments, setComments] = useState<ContentComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  // Review state
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');

  // (future: jobsByFile for grid badges)

  // ========================
  // FETCH FILES
  // ========================
  const fetchFiles = useCallback(async (folderId?: string, query?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (folderId) params.append('folder_id', folderId);
      if (query) params.append('q', query);
      const res = await fetch(`${CLIENTI_URL()}/api/drive/files?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Errore caricamento file');
      const data = await res.json();
      setFiles(data.files || []);
    } catch (e) {
      console.error(e);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ========================
  // INIT: Navigate to Clienti folder
  // ========================
  useEffect(() => {
    const initClientiFolder = async () => {
      // Prima carica root per trovare la cartella Clienti
      try {
        const res = await fetch(`${CLIENTI_URL()}/api/drive/files`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await res.json();
        const clientiFolder = (data.files || []).find(
          (f: DriveFile) => f.name === 'Clienti' && isFolder(f)
        );
        if (clientiFolder) {
          setCurrentFolderId(clientiFolder.id);
          setBreadcrumbs([{ id: clientiFolder.id, name: 'Clienti' }]);
          fetchFiles(clientiFolder.id);
        } else {
          fetchFiles();
        }
      } catch {
        fetchFiles();
      }
    };

    // Check deep link
    const fileParam = searchParams.get('file');
    if (fileParam) {
      openFileDetail(fileParam);
    } else {
      initClientiFolder();
    }
  }, []);

  // ========================
  // FOLDER NAVIGATION
  // ========================
  const handleFolderClick = (folder: DriveFile) => {
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }]);
    setCurrentFolderId(folder.id);
    fetchFiles(folder.id);

    // Deduce cliente from breadcrumbs
    deduceCliente(folder.name);
  };

  const handleBack = () => {
    const newBc = [...breadcrumbs];
    newBc.pop();
    setBreadcrumbs(newBc);
    const parentId = newBc.length > 0 ? newBc[newBc.length - 1].id : undefined;
    setCurrentFolderId(parentId);
    fetchFiles(parentId);
  };

  const deduceCliente = async (folderName: string) => {
    try {
      const res = await fetch(`${CLIENTI_URL()}/api/clienti`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return;
      const clienti = await res.json();
      const match = (Array.isArray(clienti) ? clienti : []).find(
        (c: any) => c.nome_azienda === folderName
      );
      if (match) {
        setSelectedClienteId(match.id);
        setSelectedClienteName(match.nome_azienda);
      }
    } catch { /* ignore */ }
  };

  // ========================
  // OPEN FILE DETAIL
  // ========================
  const openFileDetail = async (fileIdOrFile: string | DriveFile) => {
    let file: DriveFile;
    if (typeof fileIdOrFile === 'string') {
      // Fetch metadata
      try {
        const res = await fetch(`${CLIENTI_URL()}/api/drive/files?folder_id=`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await res.json();
        file = (data.files || []).find((f: DriveFile) => f.id === fileIdOrFile) || { id: fileIdOrFile, name: 'File', mimeType: '' };
      } catch {
        file = { id: fileIdOrFile, name: 'File', mimeType: '' };
      }
    } else {
      file = fileIdOrFile;
    }

    setSelectedFile(file);
    setView('detail');
    setDetailTab(0);
    setSearchParams({ file: file.id });

    // Load subtitle job for this file
    loadSubtitleJob(file.id);
    // Load comments
    loadComments(file.id);
  };

  const closeDetail = () => {
    setView('home');
    setSelectedFile(null);
    setSubtitleJob(null);
    setSubtitles([]);
    setComments([]);
    setSearchParams({});
  };

  // ========================
  // SUBTITLE JOB
  // ========================
  const loadSubtitleJob = async (driveFileId: string) => {
    try {
      const jobs = await getSubtitleJobs({ cliente_id: selectedClienteId || undefined });
      const matching = jobs.find((j: any) => j.input_drive_file_id === driveFileId);
      if (matching) {
        const full = await getSubtitleJobById(matching.id);
        setSubtitleJob(full);
        // Load segments from latest version
        if (full.versions && full.versions.length > 0) {
          const sorted = [...full.versions].sort((a: any, b: any) => b.version - a.version);
          const latest = sorted[0];
            const segs = typeof latest.content === 'string' ? JSON.parse(latest.content) : (latest.content || []);
          setSubtitles(segs.map((s: any) => ({
            start: s.start_time ?? s.start ?? 0,
            end: s.end_time ?? s.end ?? 0,
            text: s.text || '',
            uncertain: (s.confidence ?? 1) < 0.7,
          })));
          setCurrentVersion(latest.version);
        }
      } else {
        setSubtitleJob(null);
        setSubtitles([]);
      }
    } catch (e) {
      console.error('Errore caricamento job sottotitoli:', e);
    }
  };

  const handleGenerateSubtitles = async () => {
    if (!selectedFile || !selectedClienteId) {
      toast.error('Seleziona un file dentro una cartella cliente');
      return;
    }
    setGeneratingSubtitles(true);
    try {
      const job = await createSubtitleJob({
        cliente_id: selectedClienteId,
        drive_file_id: selectedFile.id,
        drive_file_name: selectedFile.name,
        content_type: contentType,
      });
      setSubtitleJob(job as any);

      // Il backend ritorna il job esistente se gia' presente (idempotente)
      if (['generated', 'in_review', 'approved'].includes(job.status)) {
        toast.success('Sottotitoli gia\' disponibili');
        // Carica segmenti dalla versione
        const versions = (job as any).versions;
        if (versions && versions.length > 0) {
          const sorted = [...versions].sort((a: any, b: any) => b.version - a.version);
          const latest = sorted[0];
          const segs = typeof latest.content === 'string' ? JSON.parse(latest.content) : (latest.content || []);
          setSubtitles(segs.map((s: any) => ({
            start: s.start_time ?? s.start ?? 0,
            end: s.end_time ?? s.end ?? 0,
            text: s.text || '',
            uncertain: (s.confidence ?? 1) < 0.7,
          })));
          setCurrentVersion(latest.version);
        }
      } else {
        toast.success('Generazione sottotitoli avviata!');
        pollJobStatus(job.id);
      }
    } catch (e: any) {
      toast.error(e.message || 'Errore avvio generazione');
    } finally {
      setGeneratingSubtitles(false);
    }
  };

  const pollJobStatus = (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const job = await getSubtitleJobById(jobId);
        setSubtitleJob(job);
        if (!['queued', 'processing'].includes(job.status)) {
          clearInterval(interval);
          if (job.versions && job.versions.length > 0) {
            const sorted = [...job.versions].sort((a: any, b: any) => b.version - a.version);
            const latest = sorted[0];
            const segs = typeof latest.content === 'string' ? JSON.parse(latest.content) : (latest.content || []);
            setSubtitles(segs.map((s: any) => ({
              start: s.start_time ?? s.start ?? 0,
              end: s.end_time ?? s.end ?? 0,
              text: s.text || '',
              uncertain: (s.confidence ?? 1) < 0.7,
            })));
            setCurrentVersion(latest.version);
          }
        }
      } catch { /* ignore */ }
    }, 4000);
    // Cleanup after 10 minutes max
    setTimeout(() => clearInterval(interval), 600000);
  };

  const handleSaveSubtitles = async () => {
    if (!subtitleJob) return;
    setSavingSubtitles(true);
    try {
      await updateSubtitleVersion(subtitleJob.id, currentVersion, subtitles);
      toast.success('Sottotitoli salvati');
    } catch (e: any) {
      toast.error('Errore salvataggio');
    } finally {
      setSavingSubtitles(false);
    }
  };

  const handleSubtitleChange = (index: number, newText: string) => {
    setSubtitles(prev => prev.map((s, i) => i === index ? { ...s, text: newText, uncertain: false } : s));
  };

  const handleDownload = async (format: 'srt' | 'lrc' | 'ass') => {
    if (!subtitleJob) return;
    try { await downloadSubtitles(subtitleJob.id, format); }
    catch { toast.error('Errore download'); }
  };

  // ========================
  // REVIEW ACTIONS
  // ========================
  const handleSubmitReview = async () => {
    if (!subtitleJob) return;
    try {
      await submitForReview(subtitleJob.id);
      toast.success('Inviato per revisione!');
      loadSubtitleJob(selectedFile!.id);
    } catch { toast.error('Errore invio revisione'); }
  };

  const handleApprove = async () => {
    if (!subtitleJob || !confirm('Approvare i sottotitoli?')) return;
    try {
      await handleSaveSubtitles();
      await approveJob(subtitleJob.id);
      toast.success('Approvato!');
      loadSubtitleJob(selectedFile!.id);
    } catch { toast.error('Errore approvazione'); }
  };

  const handleReject = async () => {
    if (!subtitleJob) return;
    try {
      await rejectJob(subtitleJob.id, rejectNotes);
      toast.success('Respinto');
      setRejectModalOpen(false);
      setRejectNotes('');
      loadSubtitleJob(selectedFile!.id);
    } catch { toast.error('Errore durante il rifiuto'); }
  };

  // ========================
  // COMMENTS
  // ========================
  const loadComments = async (fileId: string) => {
    try {
      const data = await getComments(fileId);
      setComments(data);
    } catch { /* ignore */ }
  };

  const handlePostComment = async () => {
    if (!newComment.trim() || !selectedFile) return;
    try {
      await createComment({
        drive_file_id: selectedFile.id,
        cliente_id: selectedClienteId,
        content: newComment.trim(),
      });
      setNewComment('');
      loadComments(selectedFile.id);
    } catch { toast.error('Errore invio commento'); }
  };

  const handlePostReply = async (parentId: string) => {
    if (!replyText.trim() || !selectedFile) return;
    try {
      await createComment({
        drive_file_id: selectedFile.id,
        cliente_id: selectedClienteId,
        content: replyText.trim(),
        parent_id: parentId,
      });
      setReplyText('');
      setReplyingTo(null);
      loadComments(selectedFile.id);
    } catch { toast.error('Errore invio risposta'); }
  };

  const handleDeleteComment = async (id: string) => {
    if (!confirm('Eliminare commento?')) return;
    try {
      await deleteComment(id);
      loadComments(selectedFile!.id);
    } catch { toast.error('Errore eliminazione'); }
  };

  // ========================
  // VIDEO
  // ========================
  const handleTimeUpdate = () => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  };

  const seekTo = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      videoRef.current.play();
    }
  };

  const activeSegmentIdx = subtitles.findIndex(
    s => currentTime >= s.start && currentTime <= s.end
  );

  const videoStreamUrl = selectedFile
    ? `${CLIENTI_URL()}/api/drive/stream/${selectedFile.id}?token=${getToken()}`
    : null;

  // ========================
  // STATUS BADGE
  // ========================
  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'generated': return <Badge tone="success">Generato</Badge>;
      case 'processing': return <Badge tone="attention">In lavorazione</Badge>;
      case 'queued': return <Badge tone="info">In coda</Badge>;
      case 'error': return <Badge tone="critical">Errore</Badge>;
      case 'in_review': return <Badge tone="warning">In Revisione</Badge>;
      case 'approved': return <Badge tone="success">Approvato</Badge>;
      case 'rejected': return <Badge tone="critical">Respinto</Badge>;
      default: return null;
    }
  };

  // ========================
  // RENDER: HOME VIEW
  // ========================
  if (view === 'home') {
    const folders = files.filter(isFolder);
    const mediaFiles = files.filter(f => !isFolder(f));
    const filteredFiles = searchTerm
      ? [...folders, ...mediaFiles].filter(f => f.name.toLowerCase().includes(searchTerm.toLowerCase()))
      : [...folders, ...mediaFiles];

    return (
      <Page title="Contenuti" fullWidth>
        <Layout>
          <Layout.Section>
            <Card padding="0">
              {/* Toolbar */}
              <Box padding="400" borderBlockEndWidth="025" borderColor="border">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="300" blockAlign="center">
                    {breadcrumbs.length > 1 && (
                      <Button icon={ArrowLeftIcon} onClick={handleBack}>Indietro</Button>
                    )}
                    <Text as="h2" variant="headingMd">
                      {breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].name : 'Contenuti'}
                    </Text>
                    {selectedClienteName && <Badge>{selectedClienteName}</Badge>}
                  </InlineStack>
                  <div style={{ width: '300px' }}>
                    <TextField
                      label=""
                      labelHidden
                      placeholder="Cerca file..."
                      value={searchTerm}
                      onChange={setSearchTerm}
                      autoComplete="off"
                      clearButton
                      onClearButtonClick={() => setSearchTerm('')}
                    />
                  </div>
                </InlineStack>
              </Box>

              {/* File Grid */}
              {loading ? (
                <Box padding="800"><InlineStack align="center"><Spinner size="large" /></InlineStack></Box>
              ) : filteredFiles.length === 0 ? (
                <Box padding="800">
                  <EmptyState heading="Nessun contenuto" image="">
                    <p>Non ci sono file in questa cartella.</p>
                  </EmptyState>
                </Box>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: '16px',
                  padding: '16px',
                }}>
                  {filteredFiles.map(file => (
                    <div
                      key={file.id}
                      onClick={() => isFolder(file) ? handleFolderClick(file) : openFileDetail(file)}
                      style={{
                        border: '1px solid #e1e3e5',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        transition: 'box-shadow 0.2s, transform 0.1s',
                        background: '#fff',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
                    >
                      {/* Thumbnail */}
                      <div style={{
                        height: '140px',
                        background: isFolder(file) ? '#f0f4ff' : isVideoFile(file) ? '#1a1a2e' : isImageFile(file) ? '#f9f9f9' : '#f6f6f7',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                      }}>
                        {isFolder(file) ? (
                          <svg width="48" height="48" viewBox="0 0 24 24" fill="#5C6AC4"><path d="M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z" /></svg>
                        ) : isImageFile(file) && file.thumbnailLink ? (
                          <img src={file.thumbnailLink} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : isVideoFile(file) ? (
                          <svg width="48" height="48" viewBox="0 0 24 24" fill="#fff"><path d="M8,5.14V19.14L19,12.14L8,5.14Z" /></svg>
                        ) : (
                          <svg width="40" height="40" viewBox="0 0 24 24" fill="#8c9196"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" /></svg>
                        )}
                        {isVideoFile(file) && (
                          <div style={{ position: 'absolute', top: 8, right: 8 }}>
                            <Badge tone="info">Video</Badge>
                          </div>
                        )}
                      </div>
                      {/* Info */}
                      <div style={{ padding: '10px 12px' }}>
                        <Text as="p" variant="bodySm" fontWeight="semibold" truncate>{file.name}</Text>
                        <InlineStack gap="200" blockAlign="center">
                          {file.size && <Text as="span" variant="bodySm" tone="subdued">{formatSize(file.size)}</Text>}
                          {file.createdTime && <Text as="span" variant="bodySm" tone="subdued">{formatDate(file.createdTime)}</Text>}
                        </InlineStack>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  // ========================
  // RENDER: DETAIL VIEW
  // ========================
  const detailTabs = [
    { id: 'subtitles', content: 'Sottotitoli' },
    { id: 'review', content: 'Revisione' },
    { id: 'comments', content: `Commenti (${comments.length})` },
    { id: 'info', content: 'Info' },
  ];

  return (
    <Page
      title={selectedFile?.name || 'Dettaglio'}
      backAction={{ content: 'Torna ai Contenuti', onAction: closeDetail }}
      titleMetadata={subtitleJob ? getStatusBadge(subtitleJob.status) : undefined}
      fullWidth
    >
      <Layout>
        {/* LEFT: Media Preview */}
        <Layout.Section variant="oneThird">
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                {selectedFile && isVideoFile(selectedFile) && videoStreamUrl ? (
                  <video
                    ref={videoRef}
                    src={videoStreamUrl}
                    controls
                    style={{ width: '100%', borderRadius: '8px', background: '#000' }}
                    onTimeUpdate={handleTimeUpdate}
                  />
                ) : selectedFile && isImageFile(selectedFile) ? (
                  <img
                    src={`${CLIENTI_URL()}/api/drive/download/${selectedFile.id}?token=${getToken()}`}
                    alt={selectedFile.name}
                    style={{ width: '100%', borderRadius: '8px' }}
                  />
                ) : (
                  <Box padding="800" background="bg-surface-secondary" borderRadius="300">
                    <InlineStack align="center">
                      <BlockStack gap="200" inlineAlign="center">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="#8c9196"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" /></svg>
                        <Text as="p" tone="subdued">{selectedFile?.name}</Text>
                      </BlockStack>
                    </InlineStack>
                  </Box>
                )}

                {/* Quick info */}
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    {selectedClienteName && `Cliente: ${selectedClienteName}`}
                  </Text>
                  {selectedFile?.size && (
                    <Text as="p" variant="bodySm" tone="subdued">{formatSize(selectedFile.size)}</Text>
                  )}
                </BlockStack>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* RIGHT: Tabs */}
        <Layout.Section>
          <Card padding="0">
            <Tabs tabs={detailTabs} selected={detailTab} onSelect={setDetailTab}>
              <Box padding="400">

                {/* ====== TAB: SOTTOTITOLI ====== */}
                {detailTab === 0 && (
                  <BlockStack gap="400">
                    {!subtitleJob && !generatingSubtitles && (
                      <BlockStack gap="300">
                        <Banner>
                          <p>Nessun sottotitolo generato per questo file. Avvia la generazione automatica.</p>
                        </Banner>
                        <InlineStack gap="300" blockAlign="end">
                          <Select
                            label="Tipo contenuto"
                            options={[
                              { label: 'Organico', value: 'organico' },
                              { label: 'Paid Ads', value: 'paid_ads' },
                            ]}
                            value={contentType}
                            onChange={(v) => setContentType(v as 'organico' | 'paid_ads')}
                          />
                          <Button variant="primary" onClick={handleGenerateSubtitles} disabled={!selectedClienteId}>
                            Genera Sottotitoli
                          </Button>
                        </InlineStack>
                      </BlockStack>
                    )}

                    {subtitleJob && ['queued', 'processing'].includes(subtitleJob.status) && (
                      <BlockStack gap="200">
                        <ProgressBar progress={subtitleJob.progress || 0} size="small" />
                        <Text as="p" tone="subdued">{`Generazione in corso... ${subtitleJob.progress || 0}%`}</Text>
                      </BlockStack>
                    )}

                    {subtitleJob && subtitleJob.status === 'error' && (
                      <Banner tone="critical">
                        <p>{subtitleJob.error_message || 'Errore durante la generazione.'}</p>
                      </Banner>
                    )}

                    {subtitles.length > 0 && (
                      <>
                        <InlineStack align="space-between" blockAlign="center">
                          <Text as="h3" variant="headingSm">{`${subtitles.length} segmenti (v${currentVersion})`}</Text>
                          <InlineStack gap="200">
                            <Button onClick={handleSaveSubtitles} loading={savingSubtitles}>Salva</Button>
                            <ButtonGroup>
                              <Button icon={ImportIcon} onClick={() => handleDownload('srt')} size="slim">SRT</Button>
                              <Button icon={ImportIcon} onClick={() => handleDownload('lrc')} size="slim">LRC</Button>
                              <Button icon={ImportIcon} onClick={() => handleDownload('ass')} size="slim">ASS</Button>
                            </ButtonGroup>
                          </InlineStack>
                        </InlineStack>
                        <Divider />
                        <div style={{ maxHeight: 'calc(100vh - 350px)', overflowY: 'auto' }}>
                          {subtitles.map((sub, idx) => (
                            <SubtitleLineEditor
                              key={idx}
                              index={idx}
                              line={sub}
                              isActive={idx === activeSegmentIdx}
                              onChange={handleSubtitleChange}
                              onFocus={seekTo}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </BlockStack>
                )}

                {/* ====== TAB: REVISIONE ====== */}
                {detailTab === 1 && (
                  <BlockStack gap="400">
                    {!subtitleJob ? (
                      <Banner>
                        <p>Genera prima i sottotitoli per gestire la revisione.</p>
                      </Banner>
                    ) : (
                      <>
                        <InlineStack gap="300" blockAlign="center">
                          <Text as="h3" variant="headingSm">Stato:</Text>
                          {getStatusBadge(subtitleJob.status)}
                          {subtitleJob.content_type && (
                            <Badge tone={subtitleJob.content_type === 'organico' ? 'info' : 'attention'}>
                              {subtitleJob.content_type === 'organico' ? 'Organico' : 'Paid Ads'}
                            </Badge>
                          )}
                        </InlineStack>

                        <Divider />

                        {/* Actions based on status and role */}
                        <BlockStack gap="300">
                          {subtitleJob.status === 'generated' && (
                            <Button variant="primary" onClick={handleSubmitReview}>
                              Invia a Revisione
                            </Button>
                          )}

                          {subtitleJob.status === 'in_review' && (
                            <InlineStack gap="300">
                              <Button variant="primary" onClick={handleApprove}>Approva</Button>
                              <Button tone="critical" onClick={() => setRejectModalOpen(true)}>Respingi</Button>
                            </InlineStack>
                          )}

                          {subtitleJob.status === 'approved' && (
                            <Banner tone="success">
                              <p>Sottotitoli approvati. Prossimo step: {subtitleJob.content_type === 'organico' ? 'Programmazione Pubblicazione' : 'Cambio Creative'}</p>
                            </Banner>
                          )}

                          {subtitleJob.status === 'rejected' && (
                            <>
                              <Banner tone="warning">
                                <p>Sottotitoli respinti. {subtitleJob.error_message && `Motivo: ${subtitleJob.error_message}`}</p>
                              </Banner>
                              <Button variant="primary" onClick={handleSubmitReview}>Re-invia a Revisione</Button>
                            </>
                          )}
                        </BlockStack>

                        <Divider />

                        {/* Timeline */}
                        <Text as="h3" variant="headingSm">Storico</Text>
                        <BlockStack gap="200">
                          <Text as="p" variant="bodySm" tone="subdued">{`Creato: ${formatDate(subtitleJob.created_at)}`}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">{`Aggiornato: ${formatDate(subtitleJob.updated_at)}`}</Text>
                          {subtitleJob.metadata?.best_strategy && (
                            <Text as="p" variant="bodySm" tone="subdued">{`Strategia: ${subtitleJob.metadata.best_strategy} (score: ${subtitleJob.metadata.best_score})`}</Text>
                          )}
                        </BlockStack>
                      </>
                    )}
                  </BlockStack>
                )}

                {/* ====== TAB: COMMENTI ====== */}
                {detailTab === 2 && (
                  <BlockStack gap="400">
                    {/* New comment input */}
                    <InlineStack gap="300" blockAlign="end">
                      <div style={{ flex: 1 }}>
                        <TextField
                          label=""
                          labelHidden
                          placeholder="Scrivi un commento..."
                          value={newComment}
                          onChange={setNewComment}
                          autoComplete="off"
                          multiline={2}
                        />
                      </div>
                      <Button variant="primary" onClick={handlePostComment} disabled={!newComment.trim()}>
                        Invia
                      </Button>
                    </InlineStack>

                    <Divider />

                    {comments.length === 0 ? (
                      <Text as="p" tone="subdued">Nessun commento ancora. Sii il primo!</Text>
                    ) : (
                      <BlockStack gap="400">
                        {comments.map(comment => (
                          <div key={comment.id} style={{ borderLeft: '3px solid #e1e3e5', paddingLeft: '12px' }}>
                            <InlineStack gap="200" blockAlign="center">
                              <Avatar size="sm" name={comment.user_name || 'U'} initials={(comment.user_name || 'U').substring(0, 2).toUpperCase()} />
                              <Text as="span" variant="bodySm" fontWeight="semibold">{comment.user_name || 'Utente'}</Text>
                              <Text as="span" variant="bodySm" tone="subdued">{formatDate(comment.created_at)}</Text>
                            </InlineStack>
                            <Box paddingInlineStart="800" paddingBlockStart="100">
                              <Text as="p" variant="bodyMd">{comment.content}</Text>
                              <InlineStack gap="200">
                                <Button size="slim" variant="plain" onClick={() => { setReplyingTo(comment.id); setReplyText(''); }}>Rispondi</Button>
                                {(comment.user_id === String(user?.id) || user?.role === 'admin' || user?.role === 'superadmin') && (
                                  <Button size="slim" variant="plain" tone="critical" onClick={() => handleDeleteComment(comment.id)}>Elimina</Button>
                                )}
                              </InlineStack>

                              {/* Replies */}
                              {comment.replies && comment.replies.length > 0 && (
                                <Box paddingBlockStart="200">
                                  <BlockStack gap="200">
                                    {comment.replies.map(reply => (
                                      <div key={reply.id} style={{ borderLeft: '2px solid #d2d5d8', paddingLeft: '10px', marginLeft: '8px' }}>
                                        <InlineStack gap="200" blockAlign="center">
                                          <Text as="span" variant="bodySm" fontWeight="semibold">{reply.user_name || 'Utente'}</Text>
                                          <Text as="span" variant="bodySm" tone="subdued">{formatDate(reply.created_at)}</Text>
                                        </InlineStack>
                                        <Text as="p" variant="bodySm">{reply.content}</Text>
                                      </div>
                                    ))}
                                  </BlockStack>
                                </Box>
                              )}

                              {/* Reply input */}
                              {replyingTo === comment.id && (
                                <Box paddingBlockStart="200">
                                  <InlineStack gap="200" blockAlign="end">
                                    <div style={{ flex: 1 }}>
                                      <TextField
                                        label=""
                                        labelHidden
                                        placeholder="Scrivi una risposta..."
                                        value={replyText}
                                        onChange={setReplyText}
                                        autoComplete="off"
                                      />
                                    </div>
                                    <Button size="slim" onClick={() => handlePostReply(comment.id)}>Rispondi</Button>
                                    <Button size="slim" variant="plain" onClick={() => setReplyingTo(null)}>Annulla</Button>
                                  </InlineStack>
                                </Box>
                              )}
                            </Box>
                          </div>
                        ))}
                      </BlockStack>
                    )}
                  </BlockStack>
                )}

                {/* ====== TAB: INFO ====== */}
                {detailTab === 3 && selectedFile && (
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingSm">Metadati File</Text>
                    <BlockStack gap="100">
                      <Text as="p"><strong>Nome:</strong> {selectedFile.name}</Text>
                      <Text as="p"><strong>Tipo:</strong> {selectedFile.mimeType}</Text>
                      <Text as="p"><strong>Dimensione:</strong> {formatSize(selectedFile.size)}</Text>
                      <Text as="p"><strong>Creato:</strong> {formatDate(selectedFile.createdTime)}</Text>
                      {selectedClienteName && <Text as="p"><strong>Cliente:</strong> {selectedClienteName}</Text>}
                    </BlockStack>
                    {selectedFile.webViewLink && (
                      <>
                        <Divider />
                        <Button icon={ExternalIcon} url={selectedFile.webViewLink} external>
                          Apri su Google Drive
                        </Button>
                      </>
                    )}
                    {subtitleJob?.versions && subtitleJob.versions.length > 0 && (
                      <>
                        <Divider />
                        <Text as="h3" variant="headingSm">Versioni Sottotitoli</Text>
                        <BlockStack gap="100">
                          {subtitleJob.versions.map((v: any) => (
                            <Text key={v.id} as="p" variant="bodySm">
                              {`v${v.version} - ${formatDate(v.created_at)} ${v.notes ? `(${v.notes})` : ''}`}
                            </Text>
                          ))}
                        </BlockStack>
                      </>
                    )}
                  </BlockStack>
                )}
              </Box>
            </Tabs>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Reject Modal */}
      <Modal
        open={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title="Respingi Sottotitoli"
        primaryAction={{ content: 'Respingi', onAction: handleReject, destructive: true }}
        secondaryActions={[{ content: 'Annulla', onAction: () => setRejectModalOpen(false) }]}
      >
        <Modal.Section>
          <TextField
            label="Note di rifiuto"
            value={rejectNotes}
            onChange={setRejectNotes}
            multiline={4}
            autoComplete="off"
            placeholder="Indica cosa c'e' da correggere..."
          />
        </Modal.Section>
      </Modal>
    </Page>
  );
};

export default ContenutiPage;
