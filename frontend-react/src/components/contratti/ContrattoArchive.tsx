import React, { useState, useCallback, useMemo } from 'react';
import {
  IndexTable,
  LegacyCard,
  useIndexResourceState,
  Text,
  Badge,
  Button,
  Modal,
  Filters,
  EmptyState,
  InlineStack,
  Select
} from '@shopify/polaris';
import { DeleteIcon, EditIcon, ExternalIcon } from '@shopify/polaris-icons';
import type { ContrattoData } from '../../types/contratto';
import { clientiApi } from '../../services/clientiApi';
import { toast } from '../../utils/toast';

interface ContrattoArchiveProps {
  contratti: ContrattoData[];
  isLoading: boolean;
  onSelectContratto: (contratto: ContrattoData) => void;
  onNewContratto: () => void;
  onDeleteContratto: (id: string) => void;
  onStatusChange?: () => void; // reso opzionale o usato nel useEffect
  onUpdateStatus?: (id: string, status: string) => Promise<void>;
}

export const ContrattoArchive: React.FC<ContrattoArchiveProps> = ({ 
  contratti, 
  isLoading, 
  onSelectContratto, 
  onNewContratto,
  onDeleteContratto,
  onUpdateStatus
}) => {
  const [queryValue, setQueryValue] = useState('');
  const [contrattoToDelete, setContrattoToDelete] = useState<ContrattoData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const contrattiDaMostrare = contratti || [];

  const handleQueryValueChange = useCallback((value: string) => setQueryValue(value), []);
  const handleQueryValueRemove = useCallback(() => setQueryValue(''), []);
  const handleClearAll = useCallback(() => {
    handleQueryValueRemove();
  }, [handleQueryValueRemove]);

  const filteredContratti = useMemo(() => {
    if (!queryValue) return contrattiDaMostrare;
    const lowerQuery = queryValue.toLowerCase();
    return contrattiDaMostrare.filter(c => 
        (c.numero?.toLowerCase().includes(lowerQuery)) ||
        (c.datiCommittente?.ragioneSociale?.toLowerCase().includes(lowerQuery)) ||
        (c.status?.toLowerCase().includes(lowerQuery))
    );
  }, [contrattiDaMostrare, queryValue]);

  const resourceName = {
    singular: 'contratto',
    plural: 'contratti',
  };

  const {selectedResources, allResourcesSelected, handleSelectionChange} =
    useIndexResourceState(filteredContratti as any);

  const handleConfirmDelete = async () => {
    if (!contrattoToDelete) return;
    
    setIsDeleting(true);
    try {
      await onDeleteContratto(contrattoToDelete.id);
      setContrattoToDelete(null);
    } catch (error) {
      console.error('Errore eliminazione', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportToDrive = async (contratto: ContrattoData) => {
    setExportingId(contratto.id);
    try {
      const result = await clientiApi.exportContrattoToDrive(contratto.id, contratto);
      toast.success(result.message || 'Contratto esportato su Drive con successo');
      if (result.file?.url) {
        window.open(result.file.url, '_blank');
      }
    } catch (error: any) {
      toast.error(error.message || 'Errore durante l\'esportazione su Drive');
    } finally {
      setExportingId(null);
    }
  };

  const getStatusTone = (status: string) => {
    switch (status) {
      case 'firmato': return 'success';
      case 'inviato': return 'info';
      case 'bozza': return 'attention';
      case 'estinto': 
      case 'rescisso': return 'critical';
      default: return 'new';
    }
  };

  // Funzione per gestire il cambio stato inline
  const handleStatusChangeInternal = async (id: string, newStatus: string) => {
    if (onUpdateStatus) {
       await onUpdateStatus(id, newStatus);
    }
  };

  const rowMarkup = filteredContratti.map(
    (contratto, index) => {
      const {id, numero, datiCommittente, created_at, status} = contratto;
      const cliente = datiCommittente?.ragioneSociale || 'Cliente Sconosciuto';
      const dataCreazione = created_at ? new Date(created_at).toLocaleDateString('it-IT') : '-';

      return (
        <IndexTable.Row
          id={id}
          key={id}
          selected={selectedResources.includes(id)}
          position={index}
          onClick={() => onSelectContratto(contratto)}
        >
          <IndexTable.Cell>
            <Text variant="bodyMd" fontWeight="bold" as="span">{numero || 'Bozza'}</Text>
          </IndexTable.Cell>
          <IndexTable.Cell>{cliente}</IndexTable.Cell>
          <IndexTable.Cell>{dataCreazione}</IndexTable.Cell>
          <IndexTable.Cell>
            <div onClick={(e) => e.stopPropagation()}>
                {onUpdateStatus ? (
                     <div style={{ maxWidth: '130px' }}>
                       <Select
                         label="Stato"
                         labelHidden
                         options={[
                           {label: 'Bozza', value: 'bozza'},
                           {label: 'Inviato', value: 'inviato'},
                           {label: 'Firmato', value: 'firmato'},
                           {label: 'Estinto', value: 'estinto'},
                           {label: 'Rescisso', value: 'rescisso'},
                         ]}
                         value={status}
                         onChange={(val) => handleStatusChangeInternal(id, val)}
                         // variant="borderless" RIMOSSO perché non supportato
                       />
                     </div>
                ) : (
                    <Badge tone={getStatusTone(status)}>{status.toUpperCase()}</Badge>
                )}
            </div>
          </IndexTable.Cell>
          <IndexTable.Cell>
             <InlineStack gap="200">
                <div onClick={(e) => e.stopPropagation()}>
                  <Button icon={EditIcon} onClick={() => onSelectContratto(contratto)} variant="plain" />
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <Button 
                    icon={ExternalIcon} 
                    onClick={() => handleExportToDrive(contratto)} 
                    variant="plain"
                    loading={exportingId === id}
                  />
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <Button icon={DeleteIcon} onClick={() => setContrattoToDelete(contratto)} tone="critical" variant="plain" />
                </div>
             </InlineStack>
          </IndexTable.Cell>
        </IndexTable.Row>
      );
    },
  );

  if (isLoading) {
    return (
        <LegacyCard>
            <div style={{padding: '2rem', textAlign: 'center'}}>
                <Text as="p" variant="bodyMd" tone="subdued">Caricamento contratti in corso...</Text>
            </div>
        </LegacyCard>
    );
  }

  return (
    <LegacyCard>
      <div style={{padding: '16px', borderBottom: '1px solid #dfe3e8'}}>
        <Filters
            queryValue={queryValue}
            filters={[]} 
            appliedFilters={[]}
            onQueryChange={handleQueryValueChange}
            onQueryClear={handleQueryValueRemove}
            onClearAll={handleClearAll}
            queryPlaceholder="Cerca contratto (cliente, numero)..."
        />
      </div>
      
      <IndexTable
        resourceName={resourceName}
        itemCount={filteredContratti.length}
        selectedItemsCount={
          allResourcesSelected ? 'All' : selectedResources.length
        }
        onSelectionChange={handleSelectionChange}
        headings={[
          {title: 'Numero'},
          {title: 'Cliente'},
          {title: 'Data Creazione'},
          {title: 'Stato'},
          {title: 'Azioni', hidden: true}
        ]}
        emptyState={
            <EmptyState
                heading="Nessun contratto trovato"
                action={{content: 'Crea Contratto', onAction: onNewContratto}}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
                <p>Inizia creando un nuovo contratto per i tuoi clienti.</p>
            </EmptyState>
        }
      >
        {rowMarkup}
      </IndexTable>

      <Modal
        open={!!contrattoToDelete}
        onClose={() => setContrattoToDelete(null)}
        title="Elimina Contratto"
        primaryAction={{
            content: 'Elimina',
            onAction: handleConfirmDelete,
            destructive: true,
            loading: isDeleting
        }}
        secondaryActions={[{
            content: 'Annulla',
            onAction: () => setContrattoToDelete(null)
        }]}
      >
        <Modal.Section>
            <Text as="p">
                Sei sicuro di voler eliminare il contratto <strong>{contrattoToDelete?.numero}</strong> per <strong>{contrattoToDelete?.datiCommittente?.ragioneSociale}</strong>?
                L'azione non è reversibile.
            </Text>
        </Modal.Section>
      </Modal>
    </LegacyCard>
  );
};
