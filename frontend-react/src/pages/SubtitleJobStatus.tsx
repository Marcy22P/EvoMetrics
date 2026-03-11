import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Page, Layout, Card, BlockStack, Text, Badge, ProgressBar, Banner, Button, InlineStack, Box, Spinner, ButtonGroup, Divider } from '@shopify/polaris';
import { getSubtitleJobById, submitForReview, downloadSubtitles } from '../services/subtitlesApi';
import type { SubtitleJob } from '../services/subtitlesApi';
import { ImportIcon } from '@shopify/polaris-icons';
import { toast } from '../utils/toast';
import { getServiceUrl } from '../utils/apiConfig';

const SubtitleJobStatus: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<(SubtitleJob & { versions?: any[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Video player
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const fetchJob = async () => {
    try {
      if (!id) return;
      const jobData = await getSubtitleJobById(id);
      setJob(jobData);

      // Video URL
      const token = localStorage.getItem('auth_token');
      const CLIENTI_SERVICE_URL = getServiceUrl('clienti');
      setVideoUrl(`${CLIENTI_SERVICE_URL}/api/drive/download/${jobData.input_drive_file_id}?token=${token}`);

      setLoading(false);
    } catch (e: any) {
      console.error(e);
      setError("Impossibile caricare il job.");
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJob();
  }, [id]);

  // Polling per status attivi
  useEffect(() => {
    if (!job || !['queued', 'processing'].includes(job.status)) return;
    const interval = setInterval(fetchJob, 5000);
    return () => clearInterval(interval);
  }, [id, job?.status]);

  const handleSubmitReview = async () => {
    if (!id) return;
    setSubmitting(true);
    try {
      await submitForReview(id);
      toast.success("Inviato per revisione!");
      fetchJob();
    } catch (e: any) {
      console.error(e);
      toast.error("Errore invio revisione");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async (format: "srt" | "lrc" | "ass") => {
    if (!id) return;
    try {
      await downloadSubtitles(id, format);
    } catch (e) {
      console.error(e);
      toast.error("Errore download");
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const seekTo = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      videoRef.current.play();
    }
  };

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  if (loading) return <Page><Box padding="800"><InlineStack align="center"><Spinner size="large" /></InlineStack></Box></Page>;
  if (error || !job) return <Page><Banner tone="critical"><p>{error || "Job non trovato"}</p></Banner></Page>;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'generated': return <Badge tone="success">Generato</Badge>;
      case 'processing': return <Badge tone="attention">In lavorazione</Badge>;
      case 'queued': return <Badge tone="info">In coda</Badge>;
      case 'error': return <Badge tone="critical">Errore</Badge>;
      case 'in_review': return <Badge tone="warning">In Revisione</Badge>;
      case 'approved': return <Badge tone="success">Approvato</Badge>;
      case 'rejected': return <Badge tone="critical">Respinto</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  // Estrai segmenti dall'ultima versione (con rating migliore)
  const latestVersion = job.versions && job.versions.length > 0
    ? job.versions.sort((a: any, b: any) => b.version - a.version)[0]
    : null;
  const segments = latestVersion?.segments || latestVersion?.content || [];
  // Normalizza: potrebbe essere JSON string
  const parsedSegments = typeof segments === 'string' ? JSON.parse(segments) : segments;

  // Trova il segmento attivo
  const activeSegmentIdx = parsedSegments.findIndex(
    (s: any) => currentTime >= (s.start_time || s.start) && currentTime <= (s.end_time || s.end)
  );

  return (
    <Page
      title={`Sottotitoli: ${job.input_drive_file_name || 'Video'}`}
      backAction={{ content: 'Torna', onAction: () => navigate(-1) }}
      titleMetadata={getStatusBadge(job.status)}
      primaryAction={
        job.status === 'generated'
          ? { content: 'Invia a Revisione', onAction: handleSubmitReview, loading: submitting }
          : ['in_review', 'approved'].includes(job.status)
            ? { content: 'Apri Revisione', onAction: () => navigate(`/subtitles/review/${id}`) }
            : undefined
      }
      fullWidth
    >
      <Layout>
        {/* COLONNA SINISTRA: Video + Dettagli */}
        <Layout.Section variant="oneThird">
          {/* Video Player */}
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Anteprima Video</Text>
                {videoUrl && (
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    style={{ width: '100%', borderRadius: '8px' }}
                    onTimeUpdate={handleTimeUpdate}
                  />
                )}
              </BlockStack>
            </Box>
          </Card>

          {/* Stato e Dettagli */}
          <Card>
            <Box padding="400">
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Dettagli Job</Text>

                {['queued', 'processing'].includes(job.status) && (
                  <BlockStack gap="200">
                    <ProgressBar progress={job.progress} size="small" />
                    <Text as="p" tone="subdued">Elaborazione in corso... {job.progress}%</Text>
                  </BlockStack>
                )}

                {job.status === 'error' && (
                  <Banner tone="critical">
                    <p>{job.error_message || "Si è verificato un errore."}</p>
                  </Banner>
                )}

                <BlockStack gap="100">
                  <Text as="p"><strong>Tipo:</strong> {job.content_type === 'organico' ? 'Organico' : 'Paid Ads'}</Text>
                  <Text as="p"><strong>Creato:</strong> {new Date(job.created_at).toLocaleString('it-IT')}</Text>
                  <Text as="p"><strong>Stato:</strong> {job.status}</Text>
                  {job.metadata?.best_strategy && (
                    <Text as="p"><strong>Strategia migliore:</strong> {job.metadata.best_strategy} (score: {job.metadata.best_score})</Text>
                  )}
                  {job.metadata?.segments_count && (
                    <Text as="p"><strong>Segmenti:</strong> {job.metadata.segments_count}</Text>
                  )}
                </BlockStack>

                {['generated', 'in_review', 'approved'].includes(job.status) && (
                  <>
                    <Divider />
                    <Text as="h3" variant="headingSm">Download Sottotitoli</Text>
                    <ButtonGroup>
                      <Button icon={ImportIcon} onClick={() => handleDownload('srt')}>SRT</Button>
                      <Button icon={ImportIcon} onClick={() => handleDownload('lrc')}>LRC</Button>
                      <Button icon={ImportIcon} onClick={() => handleDownload('ass')}>ASS (CapCut)</Button>
                    </ButtonGroup>
                  </>
                )}

                {job.status === 'approved' && (
                  <>
                    <Divider />
                    <Banner tone="success">
                      <p><strong>Approvato!</strong> Prossimo step: {job.content_type === 'organico' ? 'Programmazione Pubblicazione' : 'Cambio Creative'}</p>
                    </Banner>
                  </>
                )}
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* COLONNA DESTRA: Anteprima Sottotitoli */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    Anteprima Sottotitoli {latestVersion ? `(v${latestVersion.version})` : ''}
                  </Text>
                  {parsedSegments.length > 0 && (
                    <Badge>{`${parsedSegments.length} segmenti`}</Badge>
                  )}
                </InlineStack>

                {parsedSegments.length === 0 && ['queued', 'processing'].includes(job.status) && (
                  <Box padding="800">
                    <InlineStack align="center">
                      <BlockStack gap="300" inlineAlign="center">
                        <Spinner size="large" />
                        <Text as="p" tone="subdued">I sottotitoli sono in fase di generazione...</Text>
                      </BlockStack>
                    </InlineStack>
                  </Box>
                )}

                {parsedSegments.length === 0 && job.status === 'error' && (
                  <Banner tone="critical">
                    <p>La generazione dei sottotitoli ha avuto un errore. Controlla i dettagli a sinistra.</p>
                  </Banner>
                )}

                {parsedSegments.length > 0 && (
                  <div style={{ maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
                    {parsedSegments.map((seg: any, idx: number) => {
                      const start = seg.start_time ?? seg.start ?? 0;
                      const end = seg.end_time ?? seg.end ?? 0;
                      const text = seg.text || '';
                      const confidence = seg.confidence ?? 1;
                      const isUncertain = confidence < 0.7;
                      const isActive = idx === activeSegmentIdx;

                      return (
                        <div
                          key={idx}
                          onClick={() => seekTo(start)}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                            padding: '10px 12px',
                            cursor: 'pointer',
                            backgroundColor: isActive ? '#f1f8f5' : isUncertain ? '#fef3e6' : 'transparent',
                            borderLeft: isActive ? '4px solid #008060' : isUncertain ? '4px solid #f59e0b' : '4px solid transparent',
                            borderBottom: '1px solid #e1e3e5',
                            transition: 'background-color 0.2s',
                          }}
                        >
                          <div style={{ flexShrink: 0, width: '80px', fontSize: '0.8rem', color: '#6d7175', fontFamily: 'monospace' }}>
                            <div>{formatTime(start)}</div>
                            <div>{formatTime(end)}</div>
                          </div>
                          <div style={{ flex: 1 }}>
                            <Text as="p" variant="bodyMd">{text}</Text>
                            {isUncertain && (
                              <div style={{ marginTop: '4px' }}>
                                <Badge tone="warning">{`Confidence bassa: ${(confidence * 100).toFixed(0)}%`}</Badge>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default SubtitleJobStatus;
