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
  InlineStack
} from '@shopify/polaris';
import { DeleteIcon, EditIcon } from '@shopify/polaris-icons';
import type { PreventivoData } from '../../types/preventivo';

// Tipo per preventivi salvati
type PreventivoSalvato = PreventivoData & { 
  id: string; 
  createdAt: string; 
  updatedAt: string; 
  source: 'manual' | 'n8n' 
};

interface PreventivoArchiveProps {
  onSelectPreventivo: (preventivo: PreventivoData) => void;
  onNewPreventivo: () => void;
  onDeletePreventivo?: (id: string) => Promise<void>;
  preventivi?: PreventivoSalvato[];
}

export const PreventivoArchive: React.FC<PreventivoArchiveProps> = ({ 
  onSelectPreventivo, 
  onNewPreventivo,
  onDeletePreventivo,
  preventivi = []
}) => {
  const [queryValue, setQueryValue] = useState('');
  const [preventivoToDelete, setPreventivoToDelete] = useState<PreventivoSalvato | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const preventiviDaMostrare = preventivi || [];

  const handleQueryValueChange = useCallback((value: string) => setQueryValue(value), []);
  const handleQueryValueRemove = useCallback(() => setQueryValue(''), []);
  const handleClearAll = useCallback(() => {
    handleQueryValueRemove();
  }, [handleQueryValueRemove]);

  const filteredPreventivi = useMemo(() => {
    if (!queryValue) return preventiviDaMostrare;
    const lowerQuery = queryValue.toLowerCase();
    return preventiviDaMostrare.filter(p => 
        (p.numero?.toLowerCase().includes(lowerQuery)) ||
        (p.cliente?.toLowerCase().includes(lowerQuery)) ||
        (p.oggetto?.toLowerCase().includes(lowerQuery))
    );
  }, [preventiviDaMostrare, queryValue]);

  const resourceName = {
    singular: 'preventivo',
    plural: 'preventivi',
  };

  const {selectedResources, allResourcesSelected, handleSelectionChange} =
    useIndexResourceState(filteredPreventivi as any);

  const calcolaTotale = (preventivo: PreventivoData) => {
    if (preventivo.totale) return preventivo.totale;
    let subtotale = 0;
    if (preventivo.prezzi) {
        Object.values(preventivo.prezzi).forEach(prezzo => {
        const valore = parseFloat(prezzo.toString()) || 0;
        subtotale += valore;
        });
    }
    const iva = subtotale * 0.22;
    return subtotale + iva;
  };

  const handleConfirmDelete = async () => {
    if (!preventivoToDelete || !onDeletePreventivo) return;
    
    setIsDeleting(true);
    try {
      await onDeletePreventivo(preventivoToDelete.id);
      setPreventivoToDelete(null);
    } catch (error) {
      console.error('Errore eliminazione', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const rowMarkup = filteredPreventivi.map(
    (preventivo, index) => {
      const {id, numero, cliente, oggetto, validita, source} = preventivo;
      const totale = calcolaTotale(preventivo);

      return (
        <IndexTable.Row
          id={id}
          key={id}
          selected={selectedResources.includes(id)}
          position={index}
          onClick={() => onSelectPreventivo(preventivo)}
        >
          <IndexTable.Cell>
            <Text variant="bodyMd" fontWeight="bold" as="span">{numero || 'Bozza'}</Text>
          </IndexTable.Cell>
          <IndexTable.Cell>{cliente}</IndexTable.Cell>
          <IndexTable.Cell>{oggetto}</IndexTable.Cell>
          <IndexTable.Cell>
            <Text as="span" numeric>€ {totale.toFixed(2)}</Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
             {new Date(validita).toLocaleDateString('it-IT')}
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Badge tone={source === 'n8n' ? 'attention' : 'info'}>
                {source === 'n8n' ? 'N8N' : 'Manuale'}
            </Badge>
          </IndexTable.Cell>
          <IndexTable.Cell>
             <InlineStack gap="200">
                <div onClick={(e) => e.stopPropagation()}>
                  <Button icon={EditIcon} onClick={() => onSelectPreventivo(preventivo)} variant="plain" />
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <Button icon={DeleteIcon} onClick={() => setPreventivoToDelete(preventivo)} tone="critical" variant="plain" />
                </div>
             </InlineStack>
          </IndexTable.Cell>
        </IndexTable.Row>
      );
    },
  );

  return (
    <LegacyCard>
      <div style={{padding: '16px', borderBottom: '1px solid #dfe3e8'}}>
        <Filters
            queryValue={queryValue}
            filters={[]} // TODO: Add source filter
            appliedFilters={[]}
            onQueryChange={handleQueryValueChange}
            onQueryClear={handleQueryValueRemove}
            onClearAll={handleClearAll}
            queryPlaceholder="Cerca preventivo..."
        />
      </div>
      
      <IndexTable
        resourceName={resourceName}
        itemCount={filteredPreventivi.length}
        selectedItemsCount={
          allResourcesSelected ? 'All' : selectedResources.length
        }
        onSelectionChange={handleSelectionChange}
        headings={[
          {title: 'Numero'},
          {title: 'Cliente'},
          {title: 'Oggetto'},
          {title: 'Totale'},
          {title: 'Validità'},
          {title: 'Fonte'},
          {title: 'Azioni', hidden: true}
        ]}
        emptyState={
            <EmptyState
                heading="Nessun preventivo trovato"
                action={{content: 'Crea Preventivo', onAction: onNewPreventivo}}
                image="" // TODO: Add image
            >
                <p>Inizia creando un nuovo preventivo per i tuoi clienti.</p>
            </EmptyState>
        }
      >
        {rowMarkup}
      </IndexTable>

      <Modal
        open={!!preventivoToDelete}
        onClose={() => setPreventivoToDelete(null)}
        title="Elimina Preventivo"
        primaryAction={{
            content: 'Elimina',
            onAction: handleConfirmDelete,
            destructive: true,
            loading: isDeleting
        }}
        secondaryActions={[{
            content: 'Annulla',
            onAction: () => setPreventivoToDelete(null)
        }]}
      >
        <Modal.Section>
            <Text as="p">
                Sei sicuro di voler eliminare il preventivo <strong>{preventivoToDelete?.numero}</strong> per <strong>{preventivoToDelete?.cliente}</strong>?
                L'azione non è reversibile.
            </Text>
        </Modal.Section>
      </Modal>
    </LegacyCard>
  );
};
