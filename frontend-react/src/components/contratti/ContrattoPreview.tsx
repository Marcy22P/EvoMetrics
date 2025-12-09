import React, { useRef } from 'react';
import { PrintIcon, DownloadIcon } from '../Icons/AssessmentIcons';
import { toast } from '../../utils/toast';
import type { ContrattoData } from '../../types/contratto';
import { formatDateItalian } from '../../utils/contrattoUtils';

interface ContrattoPreviewProps {
  data: ContrattoData;
}

export const ContrattoPreview: React.FC<ContrattoPreviewProps> = ({ data }) => {
  const documentRef = useRef<HTMLDivElement>(null);
  
    // Costanti per la gestione delle pagine ottimizzate
    const pageBottomMargin = 60; // Spazio ridotto per footer e firme
    const lineHeight = 4.2; // Altezza per riga ridotta per più contenuto
    const titleSpacing = 12; // Spazio dopo i titoli ridotto
    const paragraphSpacing = 2; // Spazio tra paragrafi ridotto

  const handlePrint = () => {
    if (!documentRef.current) return;

    // Crea una nuova finestra per la stampa
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Clona il contenuto del documento
    const documentContent = documentRef.current.cloneNode(true) as HTMLElement;
    
    // Rimuovi la toolbar se presente
    const toolbar = documentContent.querySelector('.preview-toolbar');
    if (toolbar) {
      toolbar.remove();
    }

    // Aggiungi gli stili per la stampa
    const printStyles = `
      <style>
        @page {
          size: A4;
          margin: 20mm;
        }
        body {
          font-family: 'Times New Roman', serif;
          font-size: 12pt;
          line-height: 1.4;
          color: #000;
          margin: 0;
          padding: 0;
          background: #f5f5f5;
        }
        .contratto-document {
          width: 100%;
          background: white;
          color: #000;
          min-height: 100vh;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        }
        .header {
          text-align: center;
          margin-top: 60px;
          margin-bottom: 40px;
          background: white;
          z-index: 10;
          padding: 30px 0;
          width: 100%;
        }
        .header h1 {
          font-size: 20pt;
          font-weight: bold;
          margin: 0 0 15px 0;
          color: #2c3e50;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .contratto-number {
          font-size: 16pt;
          font-weight: bold;
          margin: 0;
          color: #34495e;
        }
        .main-content {
          padding: 0 20px;
          max-width: 800px;
          margin: 0 auto;
        }
        .info-section {
          display: flex;
          justify-content: space-between;
          margin-bottom: 40px;
          padding: 20px;
          background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
          border: 2px solid #dee2e6;
          border-radius: 8px;
        }
        .company-info h2 {
          font-size: 14pt;
          font-weight: bold;
          color: #2c3e50;
          margin: 0 0 15px 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .company-info p {
          font-size: 11pt;
          margin: 3px 0;
          color: #495057;
          font-weight: 500;
        }
        .client-info p {
          font-size: 11pt;
          margin: 3px 0;
          color: #495057;
          font-weight: 500;
          text-align: right;
        }
        .section {
          margin-bottom: 25px;
        }
        .section-title {
          font-size: 14pt;
          font-weight: bold;
          color: #2c3e50;
          margin: 25px 0 15px 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .section-content {
          font-size: 11pt;
          color: #2c3e50;
          line-height: 1.5;
          white-space: pre-line;
          text-align: justify;
        }
        .articolo {
          margin-bottom: 30px;
          page-break-inside: avoid;
          padding: 20px;
          background: #fafbfc;
          border-left: 4px solid #3498db;
          border-radius: 0 8px 8px 0;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .articolo-title {
          font-size: 14pt;
          font-weight: bold;
          color: #2c3e50;
          margin-bottom: 15px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 2px solid #3498db;
          padding-bottom: 8px;
          display: inline-block;
        }
        .articolo-subtitle {
          font-size: 12pt;
          font-weight: bold;
          color: #34495e;
          margin: 20px 0 12px 0;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .articolo-content {
          font-size: 11pt;
          color: #2c3e50;
          line-height: 1.6;
          text-align: justify;
          margin-bottom: 15px;
          text-indent: 20px;
        }
        .articolo-list {
          margin: 15px 0;
          padding-left: 25px;
        }
        .articolo-list li {
          margin-bottom: 8px;
          font-size: 11pt;
          line-height: 1.5;
          color: #2c3e50;
        }
        .signature-section {
          margin-top: 50px;
          display: flex;
          justify-content: space-between;
          page-break-inside: avoid;
          padding: 20px 0;
          border-top: 2px solid #dee2e6;
        }
        .signature-box {
          width: 45%;
          text-align: center;
          border-top: 2px solid #2c3e50;
          padding-top: 15px;
          margin-top: 20px;
        }
        .signature-box p {
          font-size: 11pt;
          margin: 8px 0;
          font-weight: bold;
          color: #2c3e50;
        }
      </style>
    `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Contratto ${data.numero}</title>
          ${printStyles}
        </head>
        <body>
          ${documentContent.outerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  const handleExportPDF = async () => {
    try {
      // Importa jsPDF dinamicamente
      const { default: jsPDF } = await import('jspdf');
      
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      
      // Colori - Solo nero per i testi
      const primaryColor = [0, 0, 0]; // #000000
      const textColor = [0, 0, 0]; // #000000
      
      // HEADER
        const headerHeight = 40;
      
      // Titolo
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('CONTRATTO DI COLLABORAZIONE PROFESSIONALE', pageWidth / 2, 35, { align: 'center' });
      
      doc.setFontSize(16);
      doc.setFont('helvetica', 'normal');
      doc.text(`N. ${data.numero}`, pageWidth / 2, 45, { align: 'center' });

      // CONTENUTO PRINCIPALE
      let yPosition = headerHeight + 15;
      
      // Due colonne: Azienda a sinistra, Cliente a destra (margini ottimizzati)
      const contentWidth = pageWidth - (margin * 2) + 10; // Larghezza aumentata di 10mm
      const leftColumnX = margin - 5; // Margine sinistro ridotto di 5mm
      const rightColumnX = pageWidth - margin - 75; // Margine destro ottimizzato

      // Funzioni helper avanzate per la gestione ottimizzata delle pagine
      const checkAndAddPage = (doc: any, currentY: number, requiredSpace: number = 20): number => {
        if (currentY + requiredSpace > pageHeight - pageBottomMargin) {
          doc.addPage();
          return 30; // Ritorna alla posizione iniziale della nuova pagina
        }
        return currentY;
      };

      // Funzione avanzata per aggiungere testo con gestione intelligente delle pagine
      const addTextWithSmartPageBreak = (doc: any, text: string, x: number, y: number, options: any = {}): number => {
        const lines = doc.splitTextToSize(text, contentWidth);
        const requiredSpace = lines.length * lineHeight + 10;
        
        // Se il testo è troppo lungo per la pagina corrente, dividilo
        if (y + requiredSpace > pageHeight - pageBottomMargin) {
          // Calcola quante righe possono stare nella pagina corrente
          const availableSpace = pageHeight - pageBottomMargin - y;
          const maxLinesInCurrentPage = Math.floor(availableSpace / lineHeight) - 2; // -2 per margine
          
          if (maxLinesInCurrentPage > 0) {
            // Aggiungi le righe che possono stare nella pagina corrente
            const linesForCurrentPage = lines.slice(0, maxLinesInCurrentPage);
            doc.text(linesForCurrentPage, x, y, options);
            
            // Crea nuova pagina e aggiungi le righe rimanenti
            doc.addPage();
            const remainingLines = lines.slice(maxLinesInCurrentPage);
            doc.text(remainingLines, x, 30, options);
            
            return 30 + (remainingLines.length * lineHeight) + 10;
          } else {
            // Se non c'è spazio nemmeno per una riga, crea nuova pagina
            doc.addPage();
            doc.text(lines, x, 30, options);
            return 30 + (lines.length * lineHeight) + 10;
          }
        } else {
          // C'è spazio sufficiente, aggiungi tutto il testo
          doc.text(lines, x, y, options);
          return y + (lines.length * lineHeight) + 10;
        }
      };

      // Funzione per aggiungere titolo con gestione ottimizzata
      const addTitleWithPageBreak = (doc: any, title: string, x: number, y: number, fontSize: number = 13): number => {
        let currentY = checkAndAddPage(doc, y, 25);
        
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', 'bold');
        doc.text(title, x, currentY);
        
        return currentY + titleSpacing;
      };

      // Funzione per aggiungere testo con divisione intelligente delle didascalie
      const addTextWithCaptionSplit = (doc: any, text: string, x: number, y: number, options: any = {}): number => {
        // Dividi il testo in paragrafi per una migliore gestione
        const paragraphs = text.split('\n\n');
        let currentY = y;
        
        for (let i = 0; i < paragraphs.length; i++) {
          const paragraph = paragraphs[i].trim();
          if (!paragraph) continue;
          
          // Se è un paragrafo lungo, gestiscilo con la funzione smart
          if (paragraph.length > 150) {
            currentY = addTextWithSmartPageBreak(doc, paragraph, x, currentY, options);
          } else {
            // Per paragrafi corti, usa la gestione normale ottimizzata
            const lines = doc.splitTextToSize(paragraph, contentWidth);
            const requiredSpace = lines.length * lineHeight + paragraphSpacing;
            
            currentY = checkAndAddPage(doc, currentY, requiredSpace);
            doc.text(lines, x, currentY, options);
            currentY += lines.length * lineHeight + paragraphSpacing;
          }
          
          // Aggiungi spazio ridotto tra i paragrafi
          if (i < paragraphs.length - 1) {
            currentY += paragraphSpacing;
          }
        }
        
        return currentY;
      };
      
      // Informazioni azienda (a sinistra)
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('EVOLUZIONE IMPRESE S.R.L.', leftColumnX, yPosition);
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text('P.IVA: 04636340988', leftColumnX, yPosition + 6);
      doc.text('SDI: JI3TXCE', leftColumnX, yPosition + 12);
      doc.text('Email: info@evoluzioneimprese.com', leftColumnX, yPosition + 18);
      
      // Informazioni cliente (a destra)
      doc.text(`DATA: ${formatDateItalian(new Date())}`, rightColumnX, yPosition);
      doc.text(`CLIENTE: ${data.datiCommittente.ragioneSociale || 'Non specificato'}`, rightColumnX, yPosition + 6);
      
      yPosition += 30;
      
      // Sezione Parti Contrattuali
      yPosition = addTitleWithPageBreak(doc, 'TRA', leftColumnX, yPosition);
      
      const partiText = `Azienda: ${data.datiCommittente.ragioneSociale || 'Non specificato'}\n` +
        `con sede a ${data.datiCommittente.citta || 'Non specificato'} in ${data.datiCommittente.via || 'Non specificato'}, n. ${data.datiCommittente.numero || '___'} - CAP ${data.datiCommittente.cap || '______'}\n` +
        `E-mail: ${data.datiCommittente.email || 'Non specificato'}\n` +
        `PEC: ${data.datiCommittente.pec || 'Non specificato'}\n` +
        `C.F./P.IVA: ${data.datiCommittente.cfPiva || 'Non specificato'}\n` +
        `Nella persona del legale rappresentante ${data.datiCommittente.legaleRappresentante || 'Non specificato'}, proprietario dell'impresa di seguito indicato come "Committente"\n\n` +
        `E\n\n` +
        `Azienda: Evoluzione Imprese S.r.l.\n` +
        `Sede: Via Lamarmora 161, Brescia\n` +
        `E-mail: info@evoluzioneimprese.com\n` +
        `PEC: evoluzioneimpresesrl@legalmail.com\n` +
        `P.IVA IT04636340988\n` +
        `Nella persona del legale rappresentante Zanibelli Filippo, di seguito indicato come "Evoluzione Imprese".\n\n` +
        `SI CONVIENE E SI STIPULA QUANTO SEGUE`;
      
      yPosition = addTextWithCaptionSplit(doc, partiText, leftColumnX, yPosition);

      // ART. 1 - RAPPORTO
      yPosition = addTitleWithPageBreak(doc, 'ART. 1 - RAPPORTO', leftColumnX, yPosition);
      
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      
      const rapportoText = `Le parti si danno reciprocamente atto che viene tra loro stipulato un contratto di collaborazione di lavoro autonomo consistente nello svolgimento di un'attività temporanea con le modalità ed i termini di seguito convenuti.`;
      
      yPosition = addTextWithCaptionSplit(doc, rapportoText, leftColumnX, yPosition);

      // ART. 2 - OGGETTO DELLA PRESTAZIONE
      if (data.articolo2Oggetto) {
        yPosition = addTitleWithPageBreak(doc, 'ART. 2 - OGGETTO DELLA PRESTAZIONE', leftColumnX, yPosition);
        
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        
        yPosition = addTextWithCaptionSplit(doc, data.articolo2Oggetto, leftColumnX, yPosition);
      }

      // ART. 2.1 - Sito Web
      if (data.articolo2SitoWeb) {
        yPosition = addTitleWithPageBreak(doc, '2.1 Sito Web', leftColumnX, yPosition, 12);
        
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        
        yPosition = addTextWithCaptionSplit(doc, data.articolo2SitoWeb, leftColumnX, yPosition);
      }

      // ART. 2.2 - Marketing
      if (data.articolo2Marketing) {
        yPosition = addTitleWithPageBreak(doc, '2.2 Marketing', leftColumnX, yPosition, 12);
        
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        
        yPosition = addTextWithCaptionSplit(doc, data.articolo2Marketing, leftColumnX, yPosition);
      }

      // ART. 2.3 - Link Building
      if (data.articolo2Linkbuilding) {
        yPosition = addTitleWithPageBreak(doc, '2.3 Link Building', leftColumnX, yPosition, 12);
        
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        
        yPosition = addTextWithCaptionSplit(doc, data.articolo2Linkbuilding, leftColumnX, yPosition);
      }

      // ART. 3 - MODALITÀ DI ESECUZIONE DELLA PRESTAZIONE PROFESSIONALE
      if (data.articolo3Modalita) {
        yPosition = addTitleWithPageBreak(doc, 'ART. 3 - MODALITÀ DI ESECUZIONE DELLA PRESTAZIONE PROFESSIONALE', leftColumnX, yPosition);
        
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        
        yPosition = addTextWithCaptionSplit(doc, data.articolo3Modalita, leftColumnX, yPosition);
      }

      // ART. 4 - DURATA DEL CONTRATTO
      if (data.articolo4Durata) {
        yPosition = addTitleWithPageBreak(doc, 'ART. 4 - DURATA DEL CONTRATTO', leftColumnX, yPosition);
        
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        
        yPosition = addTextWithCaptionSplit(doc, data.articolo4Durata, leftColumnX, yPosition);
      }

      // ART. 5 - COMPENSO E MODALITÀ DI PAGAMENTO
      if (data.articolo5Compenso) {
        yPosition = addTitleWithPageBreak(doc, 'ART. 5 - COMPENSO E MODALITÀ DI PAGAMENTO', leftColumnX, yPosition);
        
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        
        yPosition = addTextWithCaptionSplit(doc, data.articolo5Compenso, leftColumnX, yPosition);
      }

      // ART. 6 - PROPRIETÀ E RISERVATEZZA DEI RISULTATI
      yPosition = addTitleWithPageBreak(doc, 'ART. 6 - PROPRIETÀ E RISERVATEZZA DEI RISULTATI', leftColumnX, yPosition);
      
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      
      const articolo6Text = data.articolo6Proprieta || `I contenuti prodotti sono di esclusiva proprietà del Committente. Pertanto Evoluzione Imprese non potrà pubblicarli su altri siti, blog o social network se non dietro espressa preventiva autorizzazione scritta del Committente.
Evoluzione Imprese potrà mostrare i contenuti e i risultati frutto dell'attività prestata in favore del Committente in occasione di presentazioni, corsi formativi, incontri con potenziali clienti propri, previa espressa e preventiva autorizzazione scritta da parte del Committente.
Resta inteso che tutti i dati e le informazioni di carattere tecnico-amministrativo di cui Evoluzione Imprese entrerà in possesso nello svolgimento dell'incarico professionale di cui trattasi dovranno considerarsi riservati.`;
      
      yPosition = addTextWithCaptionSplit(doc, articolo6Text, leftColumnX, yPosition);

      // ART. 7 - RESPONSABILITÀ
      yPosition = addTitleWithPageBreak(doc, 'ART. 7 - RESPONSABILITÀ', leftColumnX, yPosition);
      
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      
      const articolo7Text = data.articolo7Responsabilita || `Il Committente esonera Evoluzione Imprese da ogni responsabilità per danni indiretti o conseguenti derivanti dall'utilizzo dei contenuti pubblicati, salvo il caso di dolo o colpa grave.`;
      
      yPosition = addTextWithCaptionSplit(doc, articolo7Text, leftColumnX, yPosition);

      // ART. 8 - NORME DI RINVIO
      yPosition = addTitleWithPageBreak(doc, 'ART. 8 - NORME DI RINVIO', leftColumnX, yPosition);
      
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      
      const articolo8Text = data.articolo8NormeRinvio || `Per tutto quanto non espressamente disciplinato nel presente contratto, le Parti fanno riferimento alle disposizioni del Codice Civile in materia di contratto d'opera professionale e, in particolare, agli articoli 2222 e seguenti.
In caso di inadempimento di una delle Parti, si applicano le norme generali sulla risoluzione dei contratti previste dal Codice Civile, fatto salvo il diritto al risarcimento del danno eventualmente subito.`;
      
      yPosition = addTextWithCaptionSplit(doc, articolo8Text, leftColumnX, yPosition);

      // ART. 9 - FORO COMPETENTE
      yPosition = addTitleWithPageBreak(doc, 'ART. 9 - FORO COMPETENTE', leftColumnX, yPosition);
      
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      
      const articolo9Text = data.articolo9ForoCompetente || `Per le controversie che dovessero insorgere nell'interpretazione, esecuzione e validità del presente, sarà competente in via esclusiva il Foro di Brescia.`;
      
      yPosition = addTextWithCaptionSplit(doc, articolo9Text, leftColumnX, yPosition);

      // Note
      if (data.note) {
        yPosition = addTitleWithPageBreak(doc, 'NOTE', leftColumnX, yPosition);
        
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        
        yPosition = addTextWithCaptionSplit(doc, data.note, leftColumnX, yPosition);
      }

      // Data e Firme
      yPosition = checkAndAddPage(doc, yPosition, 80);
      
      yPosition += 20;
      
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Data: __/__/_____', pageWidth / 2, yPosition, { align: 'center' });
      
      yPosition += 30;
      
      // Firma Committente
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text('Il Committente', leftColumnX, yPosition);
      doc.text('____________________________', leftColumnX, yPosition + 15);
      
      // Firma Fornitore
      doc.text('Evoluzione Imprese', rightColumnX, yPosition);
      doc.text('____________________________', rightColumnX, yPosition + 15);
      
      yPosition += 50;
      
      // Accettazione Clausole
      const accettazioneText = `Ai sensi e per gli effetti degli articoli 1341 e 1342 del codice civile si accettano espressamente i punti:\n\n1) Rapporto\n2) Oggetto della prestazione\n3) Modalità di esecuzione della prestazione professionale\n4) Durata del contratto\n5) Compenso e modalità di pagamento\n6) Proprietà e riservatezza dei risultati\n7) Responsabilità\n8) Norme di rinvio\n9) Foro competente\n\nLa lettera di incarico redatta in duplice originale è stata sottoscritta dal cliente anche per ricevuta.`;
      
      yPosition = addTextWithCaptionSplit(doc, accettazioneText, leftColumnX, yPosition);
      
      yPosition += 20;
      
      // Firme Finali
      doc.text('Il Committente', leftColumnX, yPosition);
      doc.text('____________________________', leftColumnX, yPosition + 15);
      
      doc.text('Evoluzione Imprese', rightColumnX, yPosition);
      doc.text('____________________________', rightColumnX, yPosition + 15);

      // FOOTER
      const footerY = pageHeight - 15;
      doc.setTextColor(102, 102, 102);  // Grigio scuro
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('Evoluzione Imprese S.R.L. - P.IVA: 04636340988 - info@evoluzioneimprese.com', pageWidth / 2, footerY, { align: 'center' });

      // Salva il PDF
      const fileName = `Contratto_${data.numero}_${data.datiCommittente.ragioneSociale?.replace(/[^a-zA-Z0-9]/g, '_') || 'Cliente'}.pdf`;
      doc.save(fileName);

      toast.success('✅ PDF vettoriale generato con successo!', fileName);
      
    } catch (error) {
      console.error('Errore durante la generazione del PDF vettoriale:', error);
      const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
      toast.error('❌ Errore nella generazione PDF vettoriale', errorMessage);
    }
  };

  return (
    <div className="contratto-preview">
      {/* Toolbar */}
      <div className="preview-toolbar">
        <button onClick={handlePrint} className="toolbar-button">
          <PrintIcon />
          Stampa
        </button>
        <button onClick={handleExportPDF} className="toolbar-button">
          <DownloadIcon />
          Esporta PDF
        </button>
      </div>

      {/* Documento A4 - Struttura identica all'export vettoriale */}
      <div ref={documentRef} className="contratto-document">
        <style>{`
          .contratto-document {
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            background: white;
            color: #333333;
            font-family: 'Arial', sans-serif;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
            position: relative;
          }

          @media print {
            .contratto-document {
              box-shadow: none;
              margin: 0;
              width: 100%;
              min-height: 100vh;
            }
            
            body { 
              background: white !important; 
            }
          }

          .preview-toolbar {
            margin-bottom: 20px;
            text-align: center;
          }

          .toolbar-button {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 20px;
            margin: 0 10px;
            background: #000000;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.3s ease;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          }

          .toolbar-button:hover {
            background: #333333;
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
          }

          .toolbar-button:active {
            transform: translateY(0);
          }

          .toolbar-button svg {
            width: 18px;
            height: 18px;
            fill: currentColor;
          }

          /* HEADER */
          .header {
            text-align: center;
            margin-top: 60px;
            margin-bottom: 40px;
            position: relative;
            background: white;
            z-index: 10;
            padding: 30px 0;
            width: 100%;
          }

          .header h1 {
            font-size: 20pt;
            font-weight: bold;
            margin: 0 0 15px 0;
            color: #2c3e50;
            text-transform: uppercase;
            letter-spacing: 1px;
          }

          .contratto-number {
            font-size: 16pt;
            font-weight: bold;
            margin: 0;
            color: #34495e;
          }

          /* CONTENUTO PRINCIPALE */
          .main-content {
            padding: 20px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            max-width: 800px;
            margin: 0 auto;
          }

          .info-section {
            display: flex;
            justify-content: space-between;
            margin-bottom: 40px;
            padding: 20px;
            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
            border: 2px solid #dee2e6;
            border-radius: 8px;
          }

          .company-info h2 {
            font-size: 14pt;
            font-weight: bold;
            color: #2c3e50;
            margin: 0 0 15px 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .company-info p {
            font-size: 11pt;
            margin: 3px 0;
            color: #495057;
            font-weight: 500;
          }

          .client-info p {
            font-size: 11pt;
            margin: 3px 0;
            color: #495057;
            font-weight: 500;
            text-align: right;
          }

          /* SEZIONI */
          .section {
            margin-bottom: 25px;
          }

          .section-title {
            font-size: 14pt;
            font-weight: bold;
            color: #2c3e50;
            margin: 25px 0 15px 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .section-content {
            font-size: 11pt;
            color: #2c3e50;
            line-height: 1.5;
            white-space: pre-line;
            text-align: justify;
          }

          /* ARTICOLI */
          .articolo {
            margin-bottom: 30px;
            page-break-inside: avoid;
            padding: 20px;
            background: #fafbfc;
            border-left: 4px solid #3498db;
            border-radius: 0 8px 8px 0;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }

          .articolo-title {
            font-size: 14pt;
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 15px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 2px solid #3498db;
            padding-bottom: 8px;
            display: inline-block;
          }

          .articolo-subtitle {
            font-size: 12pt;
            font-weight: bold;
            color: #34495e;
            margin: 20px 0 12px 0;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }

          .articolo-content {
            font-size: 11pt;
            color: #2c3e50;
            line-height: 1.6;
            text-align: justify;
            margin-bottom: 15px;
            text-indent: 20px;
          }

          .articolo-list {
            margin: 15px 0;
            padding-left: 25px;
          }

          .articolo-list li {
            margin-bottom: 8px;
            font-size: 11pt;
            line-height: 1.5;
            color: #2c3e50;
          }

          /* FIRME */
          .signature-section {
            margin-top: 50px;
            display: flex;
            justify-content: space-between;
            page-break-inside: avoid;
            padding: 20px 0;
            border-top: 2px solid #dee2e6;
          }

          .signature-box {
            width: 45%;
            text-align: center;
            border-top: 2px solid #2c3e50;
            padding-top: 15px;
            margin-top: 20px;
          }

          .signature-box p {
            font-size: 11pt;
            margin: 8px 0;
            font-weight: bold;
            color: #2c3e50;
          }
        `}</style>

        {/* CONTENUTO PRINCIPALE */}
        <div className="main-content">
          {/* TITOLO */}
          <div className="header">
            <h1>CONTRATTO DI COLLABORAZIONE PROFESSIONALE</h1>
            <p className="contratto-number">N. {data.numero}</p>
          </div>

          {/* Informazioni Parti */}
          <div className="info-section">
            <div className="company-info">
              <h2>EVOLUZIONE IMPRESE S.R.L.</h2>
              <p>P.IVA: 04636340988</p>
              <p>SDI: JI3TXCE</p>
              <p>Email: info@evoluzioneimprese.com</p>
            </div>
            <div className="client-info">
              <p><strong>DATA:</strong> {formatDateItalian(new Date())}</p>
              <p><strong>CLIENTE:</strong> {data.datiCommittente.ragioneSociale || 'Non specificato'}</p>
            </div>
          </div>

          {/* Sezione Parti Contrattuali */}
          <div className="articolo">
            <div className="articolo-title">TRA</div>
            <div className="articolo-content">
              Azienda: {data.datiCommittente.ragioneSociale || 'Non specificato'}<br />
              con sede a {data.datiCommittente.citta || 'Non specificato'} in {data.datiCommittente.via || 'Non specificato'}, n. {data.datiCommittente.numero || '___'} - CAP {data.datiCommittente.cap || '______'}<br />
              E-mail: {data.datiCommittente.email || 'Non specificato'}<br />
              PEC: {data.datiCommittente.pec || 'Non specificato'}<br />
              C.F./P.IVA: {data.datiCommittente.cfPiva || 'Non specificato'}<br />
              Nella persona del legale rappresentante {data.datiCommittente.legaleRappresentante || 'Non specificato'}, proprietario dell'impresa di seguito indicato come "Committente"
              <br /><br />
              E
              <br /><br />
              Azienda: Evoluzione Imprese S.r.l.<br />
              Sede: Via Lamarmora 161, Brescia<br />
              E-mail: info@evoluzioneimprese.com<br />
              PEC: evoluzioneimpresesrl@legalmail.com<br />
              P.IVA IT04636340988<br />
              Nella persona del legale rappresentante Zanibelli Filippo, di seguito indicato come "Evoluzione Imprese".
              <br /><br />
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

          {/* ART. 2 - OGGETTO DELLA PRESTAZIONE */}
          {data.articolo2Oggetto && (
            <div className="articolo">
              <div className="articolo-title">ART. 2 - OGGETTO DELLA PRESTAZIONE</div>
              <div className="articolo-content">{data.articolo2Oggetto}</div>
            </div>
          )}

          {/* ART. 2.1 - Sito Web */}
          {data.articolo2SitoWeb && (
            <div className="articolo">
              <div className="articolo-subtitle">2.1 Sito Web</div>
              <div className="articolo-content">{data.articolo2SitoWeb}</div>
            </div>
          )}

          {/* ART. 2.2 - Marketing */}
          {data.articolo2Marketing && (
            <div className="articolo">
              <div className="articolo-subtitle">2.2 Marketing</div>
              <div className="articolo-content">{data.articolo2Marketing}</div>
            </div>
          )}

          {/* ART. 2.3 - Link Building */}
          {data.articolo2Linkbuilding && (
            <div className="articolo">
              <div className="articolo-subtitle">2.3 Link Building</div>
              <div className="articolo-content">{data.articolo2Linkbuilding}</div>
            </div>
          )}

          {/* ART. 3 - MODALITÀ DI ESECUZIONE DELLA PRESTAZIONE PROFESSIONALE */}
          {data.articolo3Modalita && (
            <div className="articolo">
              <div className="articolo-title">ART. 3 - MODALITÀ DI ESECUZIONE DELLA PRESTAZIONE PROFESSIONALE</div>
              <div className="articolo-content">{data.articolo3Modalita}</div>
            </div>
          )}

          {/* ART. 4 - DURATA DEL CONTRATTO */}
          {data.articolo4Durata && (
            <div className="articolo">
              <div className="articolo-title">ART. 4 - DURATA DEL CONTRATTO</div>
              <div className="articolo-content">{data.articolo4Durata}</div>
            </div>
          )}

          {/* ART. 5 - COMPENSO E MODALITÀ DI PAGAMENTO */}
          {data.articolo5Compenso && (
            <div className="articolo">
              <div className="articolo-title">ART. 5 - COMPENSO E MODALITÀ DI PAGAMENTO</div>
              <div className="articolo-content">{data.articolo5Compenso}</div>
            </div>
          )}

          {/* ART. 6 - PROPRIETÀ E RISERVATEZZA DEI RISULTATI */}
          <div className="articolo">
            <div className="articolo-title">ART. 6 - PROPRIETÀ E RISERVATEZZA DEI RISULTATI</div>
            <div className="articolo-content">
              {data.articolo6Proprieta || `I contenuti prodotti sono di esclusiva proprietà del Committente. Pertanto Evoluzione Imprese non potrà pubblicarli su altri siti, blog o social network se non dietro espressa preventiva autorizzazione scritta del Committente.
Evoluzione Imprese potrà mostrare i contenuti e i risultati frutto dell'attività prestata in favore del Committente in occasione di presentazioni, corsi formativi, incontri con potenziali clienti propri, previa espressa e preventiva autorizzazione scritta da parte del Committente.
Resta inteso che tutti i dati e le informazioni di carattere tecnico-amministrativo di cui Evoluzione Imprese entrerà in possesso nello svolgimento dell'incarico professionale di cui trattasi dovranno considerarsi riservati.`}
            </div>
          </div>

          {/* ART. 7 - RESPONSABILITÀ */}
          <div className="articolo">
            <div className="articolo-title">ART. 7 - RESPONSABILITÀ</div>
            <div className="articolo-content">
              {data.articolo7Responsabilita || `Il Committente esonera Evoluzione Imprese da ogni responsabilità per danni indiretti o conseguenti derivanti dall'utilizzo dei contenuti pubblicati, salvo il caso di dolo o colpa grave.`}
            </div>
          </div>

          {/* ART. 8 - NORME DI RINVIO */}
          <div className="articolo">
            <div className="articolo-title">ART. 8 - NORME DI RINVIO</div>
            <div className="articolo-content">
              {data.articolo8NormeRinvio || `Per tutto quanto non espressamente disciplinato nel presente contratto, le Parti fanno riferimento alle disposizioni del Codice Civile in materia di contratto d'opera professionale e, in particolare, agli articoli 2222 e seguenti.
In caso di inadempimento di una delle Parti, si applicano le norme generali sulla risoluzione dei contratti previste dal Codice Civile, fatto salvo il diritto al risarcimento del danno eventualmente subito.`}
            </div>
          </div>

          {/* ART. 9 - FORO COMPETENTE */}
          <div className="articolo">
            <div className="articolo-title">ART. 9 - FORO COMPETENTE</div>
            <div className="articolo-content">
              {data.articolo9ForoCompetente || `Per le controversie che dovessero insorgere nell'interpretazione, esecuzione e validità del presente, sarà competente in via esclusiva il Foro di Brescia.`}
            </div>
          </div>

          {/* Note */}
          {data.note && (
            <div className="articolo">
              <div className="articolo-title">NOTE</div>
              <div className="articolo-content">{data.note}</div>
            </div>
          )}

          {/* Data e Firme */}
          <div className="articolo">
            <div className="articolo-content" style={{ textAlign: 'center', marginTop: '40px' }}>
              <p><strong>Data: __/__/_____</strong></p>
            </div>
          </div>

          {/* FIRME */}
          <div className="signature-section">
            <div className="signature-box">
              <p>Il Committente</p>
              <p>____________________________</p>
            </div>
            <div className="signature-box">
              <p>Evoluzione Imprese</p>
              <p>____________________________</p>
            </div>
          </div>

          {/* Accettazione Clausole */}
          <div className="articolo" style={{ marginTop: '40px' }}>
            <div className="articolo-content">
              <p><strong>Ai sensi e per gli effetti degli articoli 1341 e 1342 del codice civile si accettano espressamente i punti:</strong></p>
              <p>1) Rapporto</p>
              <p>2) Oggetto della prestazione</p>
              <p>3) Modalità di esecuzione della prestazione professionale</p>
              <p>4) Durata del contratto</p>
              <p>5) Compenso e modalità di pagamento</p>
              <p>6) Proprietà e riservatezza dei risultati</p>
              <p>7) Responsabilità</p>
              <p>8) Norme di rinvio</p>
              <p>9) Foro competente</p>
              <br />
              <p>La lettera di incarico redatta in duplice originale è stata sottoscritta dal cliente anche per ricevuta.</p>
            </div>
          </div>

          {/* Firme Finali */}
          <div className="signature-section" style={{ marginTop: '40px' }}>
            <div className="signature-box">
              <p>Il Committente</p>
              <p>____________________________</p>
            </div>
            <div className="signature-box">
              <p>Evoluzione Imprese</p>
              <p>____________________________</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
