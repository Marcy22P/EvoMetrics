import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Page, Layout, Card, BlockStack, InlineStack, Box, Spinner, Banner, TextField, Modal, Text as PolarisText } from '@shopify/polaris';
import { getSubtitleJobById, approveJob, rejectJob, updateSubtitleVersion } from '../services/subtitlesApi';
import type { SubtitleJob } from '../services/subtitlesApi';
import { getServiceUrl } from '../utils/apiConfig';
import { toast } from '../utils/toast';
import SubtitleLineEditor from '../components/subtitles/SubtitleLineEditor';
import type { SubtitleLine } from '../components/subtitles/SubtitleLineEditor';

const SubtitleReviewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [job, setJob] = useState<SubtitleJob | null>(null);
  const [subtitles, setSubtitles] = useState<SubtitleLine[]>([]);
  const [currentVersion, setCurrentVersion] = useState<number>(0);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Video State
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // Reject Modal
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");

  const fetchJob = async () => {
    try {
      if (!id) return;
      const jobData = await getSubtitleJobById(id);
      setJob(jobData);
      
      // Load latest version content
      if (jobData.versions && jobData.versions.length > 0) {
          // Sort by version desc
          const sorted = jobData.versions.sort((a, b) => b.version - a.version);
          const latest = sorted[0];
          setSubtitles(latest.content);
          setCurrentVersion(latest.version);
      }

      // Prepare video URL
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

  // Sync Video Time
  const handleTimeUpdate = () => {
      if (videoRef.current) {
          setCurrentTime(videoRef.current.currentTime);
      }
  };

  const handleSeek = (time: number) => {
      if (videoRef.current) {
          videoRef.current.currentTime = time;
          videoRef.current.play();
      }
  };

  const handleSubtitleChange = (index: number, newText: string) => {
      const newSubs = [...subtitles];
      newSubs[index] = { ...newSubs[index], text: newText, uncertain: false }; // Mark as certain on edit
      setSubtitles(newSubs);
  };

  const handleSave = async () => {
      if (!id) return;
      setSaving(true);
      try {
          // Increment version logic handled by backend usually, or we pass current+1? 
          // API doc says: updateSubtitleVersion(job_id, version, content).
          // Assuming backend handles creating new version if needed or overwriting current draft.
          // Let's assume we update the current version if it's draft/in_review.
          await updateSubtitleVersion(id, currentVersion, subtitles);
          toast.success("Salvataggio effettuato");
      } catch (e) {
          console.error(e);
          toast.error("Errore salvataggio");
      } finally {
          setSaving(false);
      }
  };

  const handleApprove = async () => {
      if (!id) return;
      // First save
      await handleSave();
      
      if (!confirm("Sei sicuro di voler approvare questi sottotitoli?")) return;

      try {
          await approveJob(id);
          toast.success("Job approvato!");
          navigate(`/subtitles/jobs/${id}`);
      } catch (e) {
          console.error(e);
          toast.error("Errore approvazione");
      }
  };

  const handleReject = async () => {
      if (!id) return;
      try {
          await rejectJob(id, rejectNotes);
          toast.success("Job respinto");
          setRejectModalOpen(false);
          navigate(`/subtitles/jobs/${id}`);
      } catch (e) {
          console.error(e);
          toast.error("Errore durante il rifiuto");
      }
  };

  if (loading) return <Page><Box padding="800"><InlineStack align="center"><Spinner size="large" /></InlineStack></Box></Page>;
  if (error || !job) return <Page><Banner tone="critical"><p>{error || "Job non trovato"}</p></Banner></Page>;

  // Find active subtitle index
  const activeIndex = subtitles.findIndex(s => currentTime >= s.start && currentTime <= s.end);

  return (
    <Page 
        title={`Revisione: ${job.input_drive_file_name}`} 
        backAction={{ content: 'Torna', onAction: () => navigate(-1) }}
        primaryAction={{ content: 'Approva', onAction: handleApprove }}
        secondaryActions={[
            { content: 'Salva', onAction: handleSave, loading: saving },
            { content: 'Respingi', onAction: () => setRejectModalOpen(true) }
        ]}
        fullWidth
    >
      <Layout>
        <Layout.Section variant="oneThird">
          <Card>
             <Box padding="400">
                 <BlockStack gap="400">
                    <PolarisText as="h2" variant="headingMd">Anteprima Video</PolarisText>
                    {videoUrl && (
                        <video 
                            ref={videoRef}
                            src={videoUrl} 
                            controls 
                            style={{ width: '100%', borderRadius: '8px' }}
                            onTimeUpdate={handleTimeUpdate}
                        />
                    )}
                    <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                        <PolarisText as="p" variant="bodySm">Clicca sui timecode a destra per saltare al punto esatto nel video.</PolarisText>
                    </Box>
                 </BlockStack>
             </Box>
          </Card>
        </Layout.Section>
        
        <Layout.Section>
          <Card>
            <Box padding="400">
              <div style={{ minHeight: '500px', maxHeight: 'calc(100vh - 200px)', overflowY: 'scroll' }}>
               <BlockStack gap="0">
                   {subtitles.map((sub, idx) => (
                       <SubtitleLineEditor 
                           key={idx}
                           index={idx}
                           line={sub}
                           isActive={idx === activeIndex}
                           onChange={handleSubtitleChange}
                           onFocus={handleSeek}
                       />
                   ))}
               </BlockStack>
              </div>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title="Respingi Revisione"
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
                placeholder="Indica cosa c'è da correggere..."
              />
          </Modal.Section>
      </Modal>
    </Page>
  );
};

export default SubtitleReviewPage;
