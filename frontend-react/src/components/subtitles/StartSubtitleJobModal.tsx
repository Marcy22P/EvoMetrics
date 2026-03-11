import React, { useState } from 'react';
import { Modal, BlockStack, RadioButton, Banner } from '@shopify/polaris';
import { createSubtitleJob } from '../../services/subtitlesApi';
import { toast } from '../../utils/toast';
import { useNavigate } from 'react-router-dom';

interface Props {
  open: boolean;
  onClose: () => void;
  driveFile: { id: string; name: string };
  clienteId: string; // OBBLIGATORIO - dedotto dal contesto Drive
}

const StartSubtitleJobModal: React.FC<Props> = ({ open, onClose, driveFile, clienteId }) => {
  const [contentType, setContentType] = useState<"organico" | "paid_ads">("organico");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  const handleGenerate = async () => {
    if (!clienteId) {
        setError("Cliente non identificato. Naviga dentro la cartella del cliente.");
        return;
    }

    setLoading(true);
    setError(null);
    try {
      const job = await createSubtitleJob({
        cliente_id: clienteId,
        drive_file_id: driveFile.id,
        drive_file_name: driveFile.name,
        content_type: contentType,
      });

      toast.success('Job sottotitoli avviato con successo!');
      onClose();
      
      if (job && job.id) {
          navigate(`/subtitles/jobs/${job.id}`);
      }
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Errore durante l\'avvio del job.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Genera Sottotitoli"
      primaryAction={{
        content: 'Genera',
        onAction: handleGenerate,
        loading: loading,
        disabled: loading || !clienteId
      }}
      secondaryActions={[{
        content: 'Annulla',
        onAction: onClose,
        disabled: loading
      }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
            {error && (
                <Banner tone="critical" onDismiss={() => setError(null)}>
                    <p>{error}</p>
                </Banner>
            )}
          <p>
            Stai per generare i sottotitoli per il file: <strong>{driveFile.name}</strong>
          </p>

          <BlockStack gap="200">
            <RadioButton
              label="Contenuto Organico"
              helpText="Video standard per feed e storie"
              checked={contentType === 'organico'}
              id="organico"
              name="contentType"
              onChange={() => setContentType('organico')}
            />
            <RadioButton
              label="Paid Ads"
              helpText="Video promozionali per campagne pubblicitarie"
              checked={contentType === 'paid_ads'}
              id="paid_ads"
              name="contentType"
              onChange={() => setContentType('paid_ads')}
            />
          </BlockStack>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
};

export default StartSubtitleJobModal;
