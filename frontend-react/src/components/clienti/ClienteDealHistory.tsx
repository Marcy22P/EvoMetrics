import React from 'react';
import { LegacyCard, IndexTable, Text, Badge, Box } from '@shopify/polaris';

interface Deal {
  id: string;
  data: string;
  tipo: 'Contratto' | 'Preventivo';
  numero: string;
  valore: number;
}

interface ClienteDealHistoryProps {
  deals: Deal[];
}

const ClienteDealHistory: React.FC<ClienteDealHistoryProps> = ({ deals }) => {
  const resourceName = {
    singular: 'deal',
    plural: 'deals',
  };

  const rowMarkup = deals.map(
    ({ id, data, tipo, numero, valore }, index) => (
      <IndexTable.Row id={id} key={id} position={index}>
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            {new Date(data).toLocaleDateString('it-IT', { year: 'numeric', month: 'long' })}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
            <Badge tone={tipo === 'Contratto' ? 'success' : 'info'}>{tipo}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>{numero}</IndexTable.Cell>
        <IndexTable.Cell>
            <Text as="span" alignment="end" numeric>
                € {valore.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
            </Text>
        </IndexTable.Cell>
      </IndexTable.Row>
    ),
  );

  return (
    <LegacyCard title="Storico Valore Deal (Client LTV)" sectioned>
        {deals.length > 0 ? (
            <IndexTable
                resourceName={resourceName}
                itemCount={deals.length}
                headings={[
                { title: 'Data' },
                { title: 'Tipo' },
                { title: 'Riferimento' },
                { title: 'Valore (€)' },
                ]}
                selectable={false}
            >
                {rowMarkup}
            </IndexTable>
        ) : (
            <Box padding="400">
                <Text as="p" tone="subdued" alignment="center">Nessun deal registrato (preventivi o contratti collegati).</Text>
            </Box>
        )}
    </LegacyCard>
  );
};

export default ClienteDealHistory;

