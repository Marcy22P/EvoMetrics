import React from 'react';
import { BlockStack, Badge, InlineStack, Box } from '@shopify/polaris';
import { CalendarIcon } from '@shopify/polaris-icons';

interface ClienteHeaderProps {
  nomeAzienda: string;
  dataInizio?: string;
  dataFine?: string;
  statoUmore?: 'triste' | 'neutrale' | 'felice';
}

const ClienteHeader: React.FC<ClienteHeaderProps> = ({ 
  nomeAzienda, 
  dataInizio, 
  dataFine, 
  statoUmore = 'neutrale' 
}) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'triste': return '😞';
      case 'felice': return '😃';
      default: return '😐';
    }
  };

  const getStatusTone = (status: string) => {
    switch (status) {
      case 'triste': return 'critical';
      case 'felice': return 'success';
      default: return 'attention';
    }
  };

  return (
    <BlockStack gap="200">
      <InlineStack align="space-between" blockAlign="center">
        <InlineStack gap="400" blockAlign="center">
          <span className="Polaris-Text--root Polaris-Text--headingXl Polaris-Text--block">{nomeAzienda}</span>
          <Badge tone={getStatusTone(statoUmore)} size="large">
            {`${getStatusIcon(statoUmore)} ${statoUmore.toUpperCase()}`}
          </Badge>
        </InlineStack>
        
        <Box background="bg-surface-secondary" padding="200" borderRadius="200">
          <InlineStack gap="200" blockAlign="center">
            <div style={{ width: '20px' }}>
              <CalendarIcon />
            </div>
            <span className="Polaris-Text--root Polaris-Text--bodySm Polaris-Text--bold">
              {dataInizio ? new Date(dataInizio).toLocaleDateString() : 'N/D'} 
              {' - '} 
              {dataFine ? new Date(dataFine).toLocaleDateString() : 'In corso'}
            </span>
          </InlineStack>
        </Box>
      </InlineStack>
    </BlockStack>
  );
};

export default ClienteHeader;
