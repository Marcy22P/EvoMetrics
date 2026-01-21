import React, { useRef, useState } from 'react';
import { LegacyCard, Button, InlineStack, Box } from '@shopify/polaris';
import { PrintIcon, ExternalIcon } from '@shopify/polaris-icons';
import { toast } from '../../utils/toast';
import type { ContrattoData } from '../../types/contratto';
import { formatDateItalian } from '../../utils/contrattoUtils';
import { clientiApi } from '../../services/clientiApi';

interface ContrattoPreviewProps {
  data: ContrattoData;
}

export const ContrattoPreview: React.FC<ContrattoPreviewProps> = ({ data }) => {
  const documentRef = useRef<HTMLDivElement>(null);
  const [isExportingToDrive, setIsExportingToDrive] = useState(false);
  
  const handleExportToDrive = async () => {
    setIsExportingToDrive(true);
    try {
      const result = await clientiApi.exportContrattoToDrive(data.id, data);
      toast.success(result.message || 'Contratto esportato su Drive con successo');
      if (result.file?.url) {
        window.open(result.file.url, '_blank');
      }
    } catch (error: any) {
      toast.error(error.message || 'Errore durante l\'esportazione su Drive');
    } finally {
      setIsExportingToDrive(false);
    }
  };
  
  const handlePrint = () => {
    if (!documentRef.current) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const documentContent = documentRef.current.cloneNode(true) as HTMLElement;
    
    // Rimuovi eventuali elementi non stampabili se presenti
    const toolbar = documentContent.querySelector('.preview-toolbar');
    if (toolbar) toolbar.remove();

    const printStyles = `
      <style>
        @page { size: A4; margin: 20mm; }
        body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.4; color: #000; margin: 0; padding: 0; background: #fff; }
        .contratto-document { width: 100%; background: white; color: #000; }
        .header { text-align: center; margin-top: 60px; margin-bottom: 40px; }
        .header h1 { font-size: 20pt; font-weight: bold; margin: 0 0 15px 0; text-transform: uppercase; }
        .contratto-number { font-size: 16pt; font-weight: bold; margin: 0; }
        .info-section { display: flex; justify-content: space-between; margin-bottom: 40px; padding: 20px; border: 1px solid #ccc; }
        .company-info h2 { font-size: 14pt; font-weight: bold; margin: 0 0 15px 0; }
        .company-info p, .client-info p { font-size: 11pt; margin: 3px 0; }
        .articolo { margin-bottom: 30px; page-break-inside: avoid; }
        .articolo-title { font-size: 14pt; font-weight: bold; margin-bottom: 15px; text-transform: uppercase; border-bottom: 1px solid #000; display: inline-block; }
        .articolo-subtitle { font-size: 12pt; font-weight: bold; margin: 20px 0 12px 0; text-transform: uppercase; }
        .articolo-content { font-size: 11pt; line-height: 1.6; text-align: justify; margin-bottom: 15px; }
        .signature-section { margin-top: 50px; display: flex; justify-content: space-between; page-break-inside: avoid; padding-top: 20px; }
        .signature-box { width: 45%; text-align: center; border-top: 1px solid #000; padding-top: 10px; }
      </style>
    `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head><title>Contratto ${data.numero}</title>${printStyles}</head>
        <body>${documentContent.innerHTML}</body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 250);
  };

  const handleExportPDF = async () => {
    toast.info('Funzionalità PDF in arrivo', 'Usa la funzione Stampa -> Salva come PDF per ora.');
  };

  return (
    <LegacyCard title="Anteprima Contratto" sectioned>
        <Box paddingBlockEnd="400">
            <InlineStack align="end" gap="300">
                <Button icon={PrintIcon} onClick={handlePrint}>Stampa</Button>
                {/* DownloadIcon rimosso perché non disponibile in questa versione di icons */}
                <Button onClick={handleExportPDF}>Esporta PDF</Button>
                <Button 
                  icon={ExternalIcon} 
                  onClick={handleExportToDrive}
                  loading={isExportingToDrive}
                  disabled={isExportingToDrive}
                >
                  {isExportingToDrive ? 'Esportazione...' : 'Esporta su Drive'}
                </Button>
            </InlineStack>
        </Box>

      <div className="preview-container" style={{ background: '#f4f6f8', padding: '20px', display: 'flex', justifyContent: 'center' }}>
        <div ref={documentRef} className="contratto-document">
          <style>{`
            .contratto-document {
              width: 210mm;
              min-height: 297mm;
              padding: 20mm;
              background: white;
              color: #000;
              font-family: 'Times New Roman', serif;
              box-shadow: 0 0 10px rgba(0,0,0,0.1);
              box-sizing: border-box;
            }
            .header { text-align: center; margin-bottom: 40px; }
            .header h1 { font-size: 18pt; font-weight: bold; margin: 0 0 10px 0; text-transform: uppercase; color: #000; }
            .contratto-number { font-size: 14pt; font-weight: bold; margin: 0; color: #000; }
            .info-section { display: flex; justify-content: space-between; margin-bottom: 30px; padding: 15px; border: 1px solid #ddd; }
            .company-info h2 { font-size: 12pt; font-weight: bold; margin: 0 0 10px 0; color: #000; }
            .company-info p, .client-info p { font-size: 10pt; margin: 2px 0; color: #000; }
            .articolo { margin-bottom: 25px; }
            .articolo-title { font-size: 12pt; font-weight: bold; margin-bottom: 10px; text-transform: uppercase; border-bottom: 1px solid #000; display: inline-block; color: #000; }
            .articolo-subtitle { font-size: 11pt; font-weight: bold; margin: 15px 0 10px 0; text-transform: uppercase; color: #000; }
            .articolo-content { font-size: 10pt; line-height: 1.5; text-align: justify; white-space: pre-wrap; color: #000; }
            .signature-section { margin-top: 40px; display: flex; justify-content: space-between; page-break-inside: avoid; }
            .signature-box { width: 40%; text-align: center; border-top: 1px solid #000; padding-top: 10px; color: #000; }
          `}</style>

          {/* CONTENUTO A4 */}
          <div className="header">
            <h1>CONTRATTO DI COLLABORAZIONE PROFESSIONALE</h1>
            <p className="contratto-number">N. {data.numero}</p>
          </div>

          {/* PARTI STIPULANTI */}
          <div className="articolo">
            <div className="articolo-title">TRA</div>
            <div className="articolo-content">
              <strong>Azienda:</strong> {data.datiCommittente.ragioneSociale || '...'}<br/>
              con sede a {data.datiCommittente.citta || '...'} in {data.datiCommittente.via || '...'} {data.datiCommittente.numero || ''} {data.datiCommittente.cap || ''}<br/>
              E-mail: {data.datiCommittente.email || '...'}<br/>
              PEC: {data.datiCommittente.pec || '...'}<br/>
              C.F./P.IVA: {data.datiCommittente.cfPiva || '...'}<br/>
              Nella persona del legale rappresentante <strong>{data.datiCommittente.legaleRappresentante || '...'}</strong>, proprietario dell'impresa {data.datiCommittente.ragioneSociale || '...'}<br/>
              di seguito indicato come <strong>"Committente"</strong>
              <br/><br/>
              <strong>E</strong>
              <br/><br/>
              <strong>Azienda:</strong> Evoluzione Imprese S.r.l.<br/>
              Sede: Via Lamarmora 161, Brescia<br/>
              E-mail: info@evoluzioneimprese.it<br/>
              PEC: evoluzioneimpresesr@legalmail.com<br/>
              P.IVA: IT04636340988<br/>
              Nella persona del legale rappresentante <strong>Zanibelli Filippo</strong>, di seguito indicato come <strong>"Evoluzione Imprese"</strong>
              <br/><br/>
              <strong>SI CONVIENE E SI STIPULA QUANTO SEGUE</strong>
            </div>
          </div>

          {/* ART. 1 - RAPPORTO */}
          <div className="articolo">
            <div className="articolo-title">ART. 1 - RAPPORTO</div>
            <div className="articolo-content">
              Le parti si danno reciprocamente atto che viene tra loro stipulato un contratto di collaborazione di lavoro autonomo consistente nello svolgimento di un'attività temporanea con le modalità ed i termini di seguito convenuti.
            </div>
          </div>

          {data.articolo2Oggetto && (
            <div className="articolo">
              <div className="articolo-title">ART. 2 - OGGETTO</div>
              <div className="articolo-content">{data.articolo2Oggetto}</div>
            </div>
          )}

          {data.articolo2SitoWeb && (
            <div className="articolo">
               <div className="articolo-subtitle">SITO WEB</div>
               <div className="articolo-content">{data.articolo2SitoWeb}</div>
            </div>
          )}
          {data.articolo2Marketing && (
            <div className="articolo">
               <div className="articolo-subtitle">MARKETING & ADV</div>
               <div className="articolo-content">{data.articolo2Marketing}</div>
            </div>
          )}
          {data.articolo2Linkbuilding && (
            <div className="articolo">
               <div className="articolo-subtitle">LINK BUILDING</div>
               <div className="articolo-content">{data.articolo2Linkbuilding}</div>
            </div>
          )}

          {data.articolo3Modalita && (
            <div className="articolo">
              <div className="articolo-title">ART. 3 - MODALITÀ DI SVOLGIMENTO</div>
              <div className="articolo-content">{data.articolo3Modalita}</div>
            </div>
          )}

          {data.articolo4Durata && (
            <div className="articolo">
              <div className="articolo-title">ART. 4 - DURATA</div>
              <div className="articolo-content">{data.articolo4Durata}</div>
            </div>
          )}

          {data.articolo5Compenso && (
            <div className="articolo">
              <div className="articolo-title">ART. 5 - COMPENSO</div>
              <div className="articolo-content">{data.articolo5Compenso}</div>
            </div>
          )}

          {data.articolo6Proprieta && (
            <div className="articolo">
              <div className="articolo-title">ART. 6 - PROPRIETÀ INTELLETTUALE</div>
              <div className="articolo-content">{data.articolo6Proprieta}</div>
            </div>
          )}

          {data.articolo7Responsabilita && (
            <div className="articolo">
              <div className="articolo-title">ART. 7 - RESPONSABILITÀ</div>
              <div className="articolo-content">{data.articolo7Responsabilita}</div>
            </div>
          )}

          {data.articolo8NormeRinvio && (
            <div className="articolo">
              <div className="articolo-title">ART. 8 - NORME DI RINVIO</div>
              <div className="articolo-content">{data.articolo8NormeRinvio}</div>
            </div>
          )}

          {/* ART. 9 - FORO COMPETENTE con clausole e firme */}
          <div className="articolo">
            <div className="articolo-title">ART. 9 - FORO COMPETENTE</div>
            <div className="articolo-content">
              Per le controversie che dovessero insorgere nell'interpretazione, esecuzione e validità del presente, sarà competente in via esclusiva il Foro di Brescia.
              <br/><br/>
              <strong>Data:</strong> {formatDateItalian(new Date())}
            </div>
          </div>
          
          <div className="signature-section">
            <div className="signature-box">
              <p><strong>Il Committente</strong></p>
              <br/><br/><br/>
              <p style={{borderTop: '1px solid #000', paddingTop: '5px'}}>_________________________</p>
            </div>
            <div className="signature-box">
              <p><strong>Evoluzione Imprese</strong></p>
              <br/><br/><br/>
              <p style={{borderTop: '1px solid #000', paddingTop: '5px'}}>_________________________</p>
            </div>
          </div>

          {/* Clausole Art. 1341 e 1342 c.c. */}
          <div className="articolo" style={{marginTop: '40px', pageBreakBefore: 'always'}}>
            <div className="articolo-content" style={{fontSize: '9pt'}}>
              Ai sensi e per gli effetti degli articoli 1341 e 1342 del codice civile si accettano espressamente i punti:<br/>
              3) Modalità di esecuzione della prestazione professionale<br/>
              4) Durata del contratto<br/>
              5) Compenso e modalità di pagamento<br/>
              6) Proprietà e riservatezza dei risultati<br/>
              7) Responsabilità<br/>
              8) Norme di rinvio<br/>
              9) Foro competente<br/><br/>
              La lettera di incarico redatta in duplice originale è stata sottoscritta dal cliente anche per ricevuta.
            </div>
          </div>

          {/* Firme finali per accettazione clausole */}
          <div className="signature-section" style={{marginTop: '30px'}}>
            <div className="signature-box">
              <p><strong>Il Committente</strong></p>
              <br/><br/><br/>
              <p style={{borderTop: '1px solid #000', paddingTop: '5px'}}>_________________________</p>
            </div>
            <div className="signature-box">
              <p><strong>Evoluzione Imprese</strong></p>
              <br/><br/><br/>
              <p style={{borderTop: '1px solid #000', paddingTop: '5px'}}>_________________________</p>
            </div>
          </div>
        </div>
      </div>
    </LegacyCard>
  );
};
