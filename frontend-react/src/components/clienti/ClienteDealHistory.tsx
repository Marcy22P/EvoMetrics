import React from 'react';
import { LegacyCard, IndexTable, Text, Badge, Box, InlineStack, BlockStack, ProgressBar, Divider, Banner, Icon } from '@shopify/polaris';
import { ClockIcon, CheckCircleIcon } from '@shopify/polaris-icons';
import { format, isPast, differenceInDays, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';

interface Deal {
  id: string;
  data: string;
  tipo: 'Contratto' | 'Preventivo';
  numero: string;
  valore: number;
  dataScadenza?: string; // Data scadenza contratto
  incassatoContratto?: number; // Incassato per questo specifico contratto
}

interface ClienteDealHistoryProps {
  deals: Deal[];
  incassato?: number; // Totale già incassato (da pagamenti)
}

const ClienteDealHistory: React.FC<ClienteDealHistoryProps> = ({ deals, incassato = 0 }) => {
  const resourceName = {
    singular: 'contratto',
    plural: 'contratti',
  };

  // Calcola LTV totale
  const ltvTotale = deals.reduce((acc, d) => acc + (Number(d.valore) || 0), 0);
  const percentualeIncassato = ltvTotale > 0 ? Math.min((incassato / ltvTotale) * 100, 100) : 0;
  const daIncassare = ltvTotale - incassato;

  // Controlla contratti scaduti
  const contrattiScaduti = deals.filter(d => {
    if (!d.dataScadenza) return false;
    try {
      const scadenza = parseISO(d.dataScadenza);
      return isPast(scadenza);
    } catch {
      return false;
    }
  });

  // Prossima scadenza (contratti non scaduti)
  const prossimaScadenza = deals
    .filter(d => d.dataScadenza && !isPast(parseISO(d.dataScadenza)))
    .sort((a, b) => new Date(a.dataScadenza!).getTime() - new Date(b.dataScadenza!).getTime())[0];

  const getScadenzaBadge = (dataScadenza?: string) => {
    if (!dataScadenza) return null;
    
    try {
      const scadenza = parseISO(dataScadenza);
      const oggi = new Date();
      const giorniMancanti = differenceInDays(scadenza, oggi);
      
      if (isPast(scadenza)) {
        return (
          <Badge tone="critical">
            {`SCADUTO ${format(scadenza, 'dd/MM/yy', { locale: it })}`}
          </Badge>
        );
      } else if (giorniMancanti <= 30) {
        return (
          <Badge tone="warning">
            {`Scade ${format(scadenza, 'dd/MM/yy', { locale: it })}`}
          </Badge>
        );
      } else {
        return (
          <Badge tone="info">
            {format(scadenza, 'dd/MM/yy', { locale: it })}
          </Badge>
        );
      }
    } catch {
      return null;
    }
  };

  const rowMarkup = deals.map(
    ({ id, data, numero, valore, dataScadenza, incassatoContratto }, index) => {
      const isScaduto = dataScadenza && isPast(parseISO(dataScadenza));
      
      return (
        <IndexTable.Row 
          id={id} 
          key={id} 
          position={index}
          tone={isScaduto ? 'critical' : undefined}
        >
          <IndexTable.Cell>
            <Text variant="bodyMd" fontWeight="bold" as="span">
              {data ? format(parseISO(data), 'MMM yyyy', { locale: it }) : '-'}
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <InlineStack gap="100" blockAlign="center">
              <Text as="span">#{numero || '-'}</Text>
            </InlineStack>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text as="span" alignment="end" numeric>
              € {(Number(valore) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            {incassatoContratto !== undefined ? (
              <Text as="span" tone="success" numeric>
                € {incassatoContratto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
              </Text>
            ) : '-'}
          </IndexTable.Cell>
          <IndexTable.Cell>
            {getScadenzaBadge(dataScadenza)}
          </IndexTable.Cell>
        </IndexTable.Row>
      );
    },
  );

  return (
    <LegacyCard title="Client LTV" sectioned>
      <BlockStack gap="400">
        {/* Alert contratti scaduti */}
        {contrattiScaduti.length > 0 && (
          <Banner tone="critical" title="Contratti Scaduti">
            {contrattiScaduti.length === 1 
              ? `Il contratto #${contrattiScaduti[0].numero} è scaduto.` 
              : `${contrattiScaduti.length} contratti sono scaduti.`}
            {' '}Verifica e rinnova.
          </Banner>
        )}

        {/* Riepilogo LTV */}
        <Box background="bg-surface-secondary" padding="400" borderRadius="200">
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="start">
              {/* LTV Totale */}
              <BlockStack gap="100">
                <Text as="span" variant="bodySm" tone="subdued">LTV Totale</Text>
                <Text as="span" variant="headingLg" fontWeight="bold">
                  € {ltvTotale.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                </Text>
              </BlockStack>
              
              {/* Incassato */}
              <BlockStack gap="100" align="center">
                <Text as="span" variant="bodySm" tone="subdued">Incassato</Text>
                <InlineStack gap="100" blockAlign="center">
                  <div style={{ minWidth: '16px', color: 'var(--p-color-text-success)' }}>
                    <Icon source={CheckCircleIcon} tone="success" />
                  </div>
                  <Text as="span" variant="headingMd" fontWeight="semibold" tone="success">
                    € {incassato.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                  </Text>
                </InlineStack>
              </BlockStack>
              
              {/* Da Incassare */}
              <BlockStack gap="100" align="end">
                <Text as="span" variant="bodySm" tone="subdued">Da Incassare</Text>
                <InlineStack gap="100" blockAlign="center">
                  <div style={{ minWidth: '16px' }}>
                    <Icon source={ClockIcon} tone="subdued" />
                  </div>
                  <Text as="span" variant="headingMd" fontWeight="semibold" tone={daIncassare > 0 ? 'caution' : 'success'}>
                    € {daIncassare.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                  </Text>
                </InlineStack>
              </BlockStack>
            </InlineStack>
            
            {/* Progress bar */}
            {ltvTotale > 0 && (
              <Box paddingBlockStart="100">
                <ProgressBar progress={percentualeIncassato} tone="success" size="small" />
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm" tone="subdued">
                    {percentualeIncassato.toFixed(0)}% incassato
                  </Text>
                  {prossimaScadenza && (
                    <Text as="span" variant="bodySm" tone="subdued">
                      Prossima scadenza: {format(parseISO(prossimaScadenza.dataScadenza!), 'dd/MM/yyyy', { locale: it })}
                    </Text>
                  )}
                </InlineStack>
              </Box>
            )}
          </BlockStack>
        </Box>
        
        <Divider />
        
        {/* Tabella contratti */}
        {deals.length > 0 ? (
          <IndexTable
            resourceName={resourceName}
            itemCount={deals.length}
            headings={[
              { title: 'Data' },
              { title: 'Contratto' },
              { title: 'Valore' },
              { title: 'Incassato' },
              { title: 'Scadenza' },
            ]}
            selectable={false}
          >
            {rowMarkup}
          </IndexTable>
        ) : (
          <Box padding="400">
            <Text as="p" tone="subdued" alignment="center">
              Nessun contratto collegato. Usa "Cerca nel DB" per collegare contratti.
            </Text>
          </Box>
        )}
      </BlockStack>
    </LegacyCard>
  );
};

export default ClienteDealHistory;
