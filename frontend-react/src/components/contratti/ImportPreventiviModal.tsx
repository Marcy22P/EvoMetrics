import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  ResourceList,
  ResourceItem,
  Text,
  Badge,
  Box,
  LegacyCard,
  EmptyState,
  Spinner
} from '@shopify/polaris';
import type { PreventivoData } from '../../types/preventivo';
import type { ContrattoData } from '../../types/contratto';
import { convertPreventivoToContratto } from '../../utils/preventivoToContrattoMapper';
import { preventiviApi } from '../../services/preventiviApi';
import { contrattiApi } from '../../services/contrattiApi';

interface ImportPreventiviModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContrattoCreated: (contratto: ContrattoData) => void;
}

export const ImportPreventiviModal: React.FC<ImportPreventiviModalProps> = ({
  isOpen,
  onClose,
  onContrattoCreated
}) => {
  const [preventivi, setPreventivi] = useState<PreventivoData[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadPreventivi();
      setSelectedItems([]);
    }
  }, [isOpen]);

  const loadPreventivi = async () => {
    try {
      setLoading(true);
      const response = await preventiviApi.getAllPreventivi();
      // Ordina per data decrescente
      const sorted = (response || []).sort((a, b) => 
        new Date(b.data).getTime() - new Date(a.data).getTime()
      );
      setPreventivi(sorted);
    } catch (err) {
      console.error('Errore nel caricamento preventivi:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectionChange = useCallback((selectedIds: string[]) => {
    // Permetti solo una selezione alla volta per ora
    setSelectedItems(selectedIds.slice(-1));
  }, []);

  const handleCreateContratto = async () => {
    if (selectedItems.length === 0) return;
    
    const selectedId = selectedItems[0];
    const selectedPreventivo = preventivi.find(p => p.id === selectedId) || preventivi.find(p => p.numero === selectedId);

    if (!selectedPreventivo) return;

    const previewContratto = convertPreventivoToContratto(selectedPreventivo);

    try {
      setCreating(true);
      const contrattoCompleto: ContrattoData = {
        id: `contratto-${Date.now()}`,
        numero: `CTR-${Date.now()}`,
        datiCommittente: previewContratto.datiCommittente || {
          ragioneSociale: '',
          email: '',
          citta: '',
          via: '',
          numero: '',
          cap: '',
          pec: '',
          cfPiva: '',
          legaleRappresentante: ''
        },
        tipologiaServizio: previewContratto.tipologiaServizio || 'marketing_adv',
        servizi: previewContratto.servizi || [],
        durata: previewContratto.durata || {
          tipo: '12_mesi_con_rinnovo',
          dataDecorrenza: new Date().toISOString().split('T')[0],
          dataScadenza: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        },
        compenso: previewContratto.compenso || {
          marketing: {
            importoMensile: 0,
            giornoPagamento: 1
          }
        },
        note: previewContratto.note || `Contratto generato da preventivo ${selectedPreventivo.numero}`,
        status: 'bozza' as 'bozza' | 'inviato' | 'firmato' | 'estinto' | 'rescisso',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const response = await contrattiApi.createContratto(contrattoCompleto);
      const createdContratto = {
        ...contrattoCompleto,
        id: response.id,
        numero: response.numero
      };
      onContrattoCreated(createdContratto);
      onClose();
    } catch (err) {
      console.error('Errore nella creazione del contratto:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Importa Preventivo come Contratto"
      primaryAction={{
        content: creating ? 'Creazione in corso...' : 'Importa Selezionato',
        onAction: handleCreateContratto,
        disabled: selectedItems.length === 0 || creating,
        loading: creating
      }}
      secondaryActions={[
        {
          content: 'Annulla',
          onAction: onClose,
        },
      ]}
    >
      <Modal.Section>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <Spinner size="large" />
          </div>
        ) : preventivi.length === 0 ? (
          <EmptyState
            heading="Nessun preventivo trovato"
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>Crea prima un preventivo per poterlo importare come contratto.</p>
          </EmptyState>
        ) : (
          <LegacyCard>
            <ResourceList
              resourceName={{ singular: 'preventivo', plural: 'preventivi' }}
              items={preventivi}
              selectedItems={selectedItems}
              onSelectionChange={handleSelectionChange}
              selectable
              renderItem={(item) => {
                const { id, numero, cliente, data, totale, oggetto } = item;
                const itemId = id || numero || `prev-${Math.random()}`; 
                
                return (
                  <ResourceItem
                    id={itemId}
                    url="#"
                    accessibilityLabel={`Visualizza dettagli per ${numero}`}
                    onClick={() => {}} 
                  >
                    <Box padding="200">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <Text variant="bodyMd" fontWeight="bold" as="h3">
                            {numero} - {cliente}
                          </Text>
                          <Text variant="bodySm" as="p" tone="subdued">
                            {oggetto}
                          </Text>
                          <div style={{ marginTop: '4px' }}>
                            <Badge tone="info">
                              {new Date(data).toLocaleDateString('it-IT')}
                            </Badge>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <Text variant="bodyMd" fontWeight="bold" as="span">
                            €{totale?.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                          </Text>
                        </div>
                      </div>
                    </Box>
                  </ResourceItem>
                );
              }}
            />
          </LegacyCard>
        )}
      </Modal.Section>
    </Modal>
  );
};
