import React, { useRef } from 'react';
import { PrintIcon, DownloadIcon } from '../Icons/AssessmentIcons';
import { toast } from '../../utils/toast';
import { convertServiziToArray, groupServiziByTable, calculateTableTotals, formatCurrency, formatDateItalian, generateEcommerceDescription, generateVideoPostDescription, generateMetaAdsDescription, generateGoogleAdsDescription, generateSeoDescription, generateEmailMarketingDescription, generateDefaultTerminiCondizioni } from '../../utils/preventivoUtils';

interface PreventivoPreviewProps {
  data: any;
  totali: any;
}

export const PreventivoPreview: React.FC<PreventivoPreviewProps> = ({ data, totali }) => {
  const documentRef = useRef<HTMLDivElement>(null);
  
  // Debug: log dei dati ricevuti
  console.log('🔍 PreventivoPreview - Data received:', data);
  console.log('🔍 PreventivoPreview - Totali received:', totali);
  console.log('🔍 PreventivoPreview - Servizi:', data?.servizi);
  console.log('🔍 PreventivoPreview - Prezzi:', data?.prezzi);

      // Genera le descrizioni delle tipologie di intervento
  const ecommerceDescription = generateEcommerceDescription(data.servizi, data.prezzi);
  const videoPostDescription = generateVideoPostDescription(data.servizi, data.prezzi);
  const metaAdsDescription = generateMetaAdsDescription(data.servizi, data.prezzi);
  const googleAdsDescription = generateGoogleAdsDescription(data.servizi, data.prezzi);
  const seoDescription = generateSeoDescription(data.servizi, data.prezzi);
  const emailMarketingDescription = generateEmailMarketingDescription(data.servizi, data.prezzi);
  const hasEcommerceServices = (data.servizi?.ecommerce || []).length > 0;
  const hasVideoPostServices = (data.servizi?.videoPost || []).length > 0;
  const hasMetaAdsServices = (data.servizi?.metaAds || []).length > 0;
  const hasGoogleAdsServices = (data.servizi?.googleAds || []).length > 0;
  const hasSeoServices = (data.servizi?.seo || []).length > 0;
  const hasEmailMarketingServices = (data.servizi?.emailMarketing || []).length > 0;

      // Costanti per la gestione delle pagine
      const pageBottomMargin = 30; // Spazio di sicurezza dalla fine pagina (30px)
  
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

    // Crea l'HTML completo per la stampa
    const printHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Preventivo ${data.numero || 'N/A'}</title>
          <style>
            body { 
              margin: 0;
              padding: 0;
              font-family: Arial, sans-serif;
              background: white;
            }
            .preventivo-document {
              width: 210mm;
              min-height: 297mm;
              margin: 0 auto;
              background: white;
              color: #333333;
              font-family: 'Arial', sans-serif;
              position: relative;
            }
            /* HEADER - Identico all'export vettoriale */
          .header-section {
            height: 80mm;
            background: #000000;
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: white;
            overflow: hidden;
          }
            .logo-area {
              position: relative;
              z-index: 2;
              margin-bottom: 10px;
            }
            .logo-area img {
              height: 18mm;
              width: auto;
              max-width: 100%;
            }
            .header-content {
              position: relative;
              z-index: 2;
              text-align: center;
            }
            .header-content h1 {
              font-size: 22px;
              font-weight: bold;
              margin: 0 0 5px 0;
            }
            .preventivo-number {
              font-size: 16px;
              font-weight: normal;
              margin: 0;
            }
            /* CONTENUTO PRINCIPALE */
            .main-content {
              padding: 15mm;
            }
            .info-section {
              display: flex;
              justify-content: space-between;
              margin-bottom: 30px;
              padding: 0 0 20px 0;
              border-bottom: 1px solid #eee;
            }
            .company-info h2 {
              font-size: 14px;
              font-weight: bold;
              color: #333333;
              margin: 0 0 6px 0;
            }
            .company-info p {
              font-size: 11px;
              margin: 0 0 6px 0;
              color: #333333;
            }
            .client-info p {
              font-size: 11px;
              margin: 0 0 6px 0;
              color: #333333;
              text-align: right;
            }
            /* SEZIONI */
            .section {
              margin-bottom: 20px;
              text-align: center;
              padding: 0 20px;
            }
              .section-title {
                font-size: 13px;
                font-weight: bold;
                color: #000000;
                margin-bottom: 8px;
              }
            .section-content {
              font-size: 11px;
              color: #333333;
              line-height: 1.4;
              white-space: pre-line;
            }
            /* TABELLA DETTAGLI */
            .dettagli-table {
              width: 100%;
              border-collapse: collapse;
              margin: 10px auto 0 auto;
              max-width: 600px;
            }
            .dettagli-table thead {
              background-color: #f5f5f5;
            }
              .dettagli-table th {
                font-size: 11px;
                font-weight: bold;
                color: #000000;
                padding: 8px 2px;
                text-align: left;
                border-bottom: 1px solid #000000;
              }
            .dettagli-table td {
              font-size: 11px;
              padding: 8px 2px;
              border-bottom: 1px solid #eee;
              vertical-align: top;
            }
            .dettagli-table tbody tr:nth-child(even) {
              background-color: #f9f9f9;
            }
            .dettagli-table tbody tr:nth-child(odd) {
              background-color: #ffffff;
            }
            .servizio-categoria {
              font-weight: bold;
              margin-bottom: 2px;
            }
            .servizio-descrizione {
              font-size: 10px;
              color: #666;
              line-height: 1.3;
            }
            .prezzo-cell {
              text-align: right;
              font-weight: 500;
            }
            /* TOTALI - Allineati a destra come nell'export */
            .totali-section {
              display: flex;
              justify-content: flex-end;
              margin: 20px 0;
            }
            .totali-box {
              width: 100mm;
              background-color: #f8f9fa;
              border: 1px solid #ddd;
              padding: 8px;
            }
            .totale-row {
              display: flex;
              justify-content: space-between;
              font-size: 11px;
              margin-bottom: 7px;
              color: #333333;
            }
            .totale-finale {
              font-size: 12px;
              font-weight: bold;
              color: #007acc;
              border-top: 1px solid #ddd;
              padding-top: 7px;
              margin-top: 7px;
            }
            /* FOOTER */
            .footer {
              position: absolute;
              bottom: 5mm;
              left: 15mm;
              right: 15mm;
              text-align: center;
              font-size: 8px;
              color: #999;
              border-top: 1px solid #eee;
              padding-top: 5px;
            }
            @media print {
              body { margin: 0; padding: 0; }
              .preventivo-document { box-shadow: none; margin: 0; width: 100%; }
            }
          </style>
        </head>
        <body>
          ${documentContent.outerHTML}
        </body>
      </html>
    `;

    printWindow.document.write(printHTML);
    printWindow.document.close();

    // Stampa dopo un breve delay per permettere il caricamento
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 100);
  };

  const handleExportPDF = async () => {
    await handleVectorExport();
  };

  const handleVectorExport = async () => {
    try {
      toast.loading('📄 Generazione PDF vettoriale...');

      // Import dinamico di jsPDF
      const { default: jsPDF } = await import('jspdf');
      
      // Crea nuovo documento PDF A4
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // Colori - Palette Nero e Bianco per il brand
      const primaryColor = '#000000';  // Nero principale
      const textColor = '#000000';     // Nero per il testo

      // Dimensioni pagina A4 (210mm x 297mm)
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 15;
      const contentWidth = pageWidth - (margin * 2);
      
      // Funzione per calcolare altezza testo (rimossa perché non utilizzata)
      
      // Funzione per controllare se c'è spazio per titolo + primo rigo
      const hasSpaceForTitleAndFirstLine = (titleHeight: number, firstLineHeight: number, currentY: number) => {
        const currentPageHeight = doc.internal.pageSize.height;
        const safeZone = currentPageHeight - pageBottomMargin;
        const totalMinHeight = titleHeight + firstLineHeight + 10; // +10 per spacing
        return (currentY + totalMinHeight) <= safeZone;
      };
      
      // Funzione per scrivere sezione con logica intelligente
      const writeSectionWithSmartPagination = (title: string, content: string, x: number, y: number, maxWidth: number, titleFontSize: number = 13, contentFontSize: number = 11) => {
        const currentPageHeight = doc.internal.pageSize.height;
        const safeZone = currentPageHeight - pageBottomMargin;
        const lineHeight = contentFontSize * 0.4;
        
        // Calcola altezza titolo
        const titleHeight = 8; // Spacing dopo titolo
        
        // Calcola altezza primo rigo del contenuto
        const contentLines = doc.splitTextToSize(content, maxWidth);
        const firstLineHeight = lineHeight;
        
        // Controlla se c'è spazio per titolo + primo rigo
        if (!hasSpaceForTitleAndFirstLine(titleHeight, firstLineHeight, y)) {
          doc.addPage();
          pageNumber++; // Incrementa contatore pagina
          y = addLogoHeader(); // Reset posizione Y con logo header
        }
        
        // Scrivi il titolo in grassetto e più grande
        doc.setTextColor(primaryColor);
        doc.setFontSize(titleFontSize);
        doc.setFont('helvetica', 'bold');
        doc.text(title, x, y);
        y += titleHeight;
        
        // Scrivi il contenuto in normale e più piccolo
        doc.setTextColor(textColor);
        doc.setFontSize(contentFontSize);
        doc.setFont('helvetica', 'normal');
        
        // Scrivi il contenuto riga per riga con controllo intelligente
        let currentY = y;
        let remainingLines = [...contentLines];
        
        while (remainingLines.length > 0) {
          // Controlla se la prossima riga entra nella safe zone
          if (currentY + lineHeight > safeZone) {
            // Vai a nuova pagina per il resto del contenuto
            doc.addPage();
            pageNumber++; // Incrementa contatore pagina
            currentY = addLogoHeader(); // Reset posizione Y con logo header
            // Ripristina il font per il contenuto
            doc.setTextColor(textColor);
            doc.setFontSize(contentFontSize);
            doc.setFont('helvetica', 'normal');
          }
          
          // Scrivi la riga corrente
          doc.text(remainingLines[0], x, currentY);
          currentY += lineHeight;
          remainingLines.shift();
        }
        
        return currentY;
      };
      
      // Funzione per controllare se c'è spazio sufficiente (per termini e condizioni)
      const hasSpaceForText = (textHeight: number, currentY: number) => {
        const currentPageHeight = doc.internal.pageSize.height;
        const safeZone = currentPageHeight - pageBottomMargin;
        return (currentY + textHeight) <= safeZone;
      };

      // Variabile per tracciare il numero di pagina
      let pageNumber = 1;

      // Funzione per aggiungere logo header alle pagine successive
      const addLogoHeader = () => {
        try {
          // Aggiungi il logo solo se non è la prima pagina
          if (pageNumber > 1) {
            // Dimensioni logo ottimizzate per il nuovo file logo_black_300x300.png
            // Proporzioni originali 300x300, scalato a 40x40 (mantiene proporzione 1:1)
            const logoWidth = 40; // Larghezza scalata (proporzione 1:1)
            const logoHeight = 40; // Altezza scalata (proporzione 1:1)
            const logoX = (pageWidth - logoWidth) / 2; // Centrato
            const logoY = 0; // 0px dal top (spostato 10px sopra)
            
            // Aggiungi il nuovo logo con proporzioni corrette
            doc.addImage('/logo_black_300x300.png', 'PNG', logoX, logoY, logoWidth, logoHeight);
            
            // Ritorna la posizione Y invadendo 5px dell'area del logo (essendo PNG centrato)
            return logoY + logoHeight - 5; // Logo - 5px di invasione (invasione ridotta)
          }
          return 15; // Posizione normale per la prima pagina
        } catch (error) {
          console.warn('Errore nel caricamento del logo:', error);
          return 15; // Fallback alla posizione normale
        }
      };

      // Funzione per caricare immagini
      const loadImage = (src: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
          img.src = src;
        });
      };



      // HEADER con immagine di sfondo (80mm di altezza)
      const headerHeight = 80;
      
      // Immagine di sfondo header
      try {
        const headerPaths = [
          './header-preventivi.png',
          '/header-preventivi.png',
          'header-preventivi.png'
        ];
        
        let headerLoaded = false;
        for (const path of headerPaths) {
          try {
            const headerImg = await loadImage(path);
            doc.addImage(headerImg, 'PNG', 0, 0, pageWidth, headerHeight);
            headerLoaded = true;
            break;
          } catch (e) {
            continue;
          }
        }
        
        if (!headerLoaded) {
          doc.setFillColor(0, 0, 0);  // Nero per l'header
          doc.rect(0, 0, pageWidth, headerHeight, 'F');
        }
      } catch (error) {
        console.log('Header image not found, using fallback');
        doc.setFillColor(0, 0, 0);  // Nero per l'header
        doc.rect(0, 0, pageWidth, headerHeight, 'F');
      }
      
      // Logo nel header
      try {
        const logoPaths = [
          './assets/logo-evoluzione-white.png',
          '/assets/logo-evoluzione-white.png',
          'assets/logo-evoluzione-white.png'
        ];
        
        let logoLoaded = false;
        for (const path of logoPaths) {
          try {
            const logoImg = await loadImage(path);
            
            // Calcola le dimensioni mantenendo le proporzioni originali
            const originalWidth = logoImg.width;
            const originalHeight = logoImg.height;
            const aspectRatio = originalWidth / originalHeight;
            
            // Altezza fissa di 18mm, larghezza proporzionale
            const logoHeight = 18;
            const logoWidth = logoHeight * aspectRatio;
            
            // Centra il logo orizzontalmente
            const logoX = (pageWidth - logoWidth) / 2;
            const logoY = 10;
            
            doc.addImage(logoImg, 'PNG', logoX, logoY, logoWidth, logoHeight);
            logoLoaded = true;
            break;
          } catch (e) {
            continue;
          }
        }
        
        if (!logoLoaded) {
          throw new Error('Logo not found');
        }
      } catch (error) {
        console.log('Logo not found, using text fallback');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('EVOLUZIONE IMPRESE', pageWidth / 2, 20, { align: 'center' });
      }
      
      // Titolo "PREVENTIVO" nel header
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('PREVENTIVO', pageWidth / 2, 35, { align: 'center' });
      
      // Numero preventivo nel header
      const numeroPreventivo = data.numero || `PREV-${Date.now()}`;
      doc.setFontSize(16);
      doc.setFont('helvetica', 'normal');
      doc.text(`N. ${numeroPreventivo}`, pageWidth / 2, 45, { align: 'center' });

      // CONTENUTO PRINCIPALE
      let yPosition = headerHeight + 15;
      
      // Due colonne: Azienda a sinistra, Cliente a destra
      const leftColumnX = margin;
      const rightColumnX = pageWidth - margin - 80;
      
      // Informazioni azienda (a sinistra)
      doc.setTextColor(textColor);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('EVOLUZIONE IMPRESE S.R.L.', leftColumnX, yPosition);
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text('P.IVA: 04636340988', leftColumnX, yPosition + 6);
      doc.text('SDI: JI3TXCE', leftColumnX, yPosition + 12);
      doc.text('Email: info@evoluzioneimprese.com', leftColumnX, yPosition + 18);
      
      // Informazioni cliente (a destra)
      doc.text(`DATA: ${formatDateItalian(data.data || new Date())}`, rightColumnX, yPosition);
      
      // Gestione lunghezza testo cliente con wrapping automatico
      const clienteText = `CLIENTE: ${data.cliente}`;
      const rightColumnWidth = 80; // Larghezza colonna destra
      const clienteLines = doc.splitTextToSize(clienteText, rightColumnWidth);
      doc.text(clienteLines, rightColumnX, yPosition + 6);
      
      // Aggiorna yPosition per il campo cliente (font size 11)
      const clienteHeight = clienteLines.length * 5.5;
      if (clienteHeight > 6) {
        // Se il cliente va su più righe, sposta anche la validità
        doc.text(`VALIDITÀ: ${formatDateItalian(data.validita) || '30 giorni'}`, rightColumnX, yPosition + 6 + clienteHeight);
      } else {
        doc.text(`VALIDITÀ: ${formatDateItalian(data.validita) || '30 giorni'}`, rightColumnX, yPosition + 12);
      }
      
      yPosition += 30;
      
      // Sezione Oggetto
      // Gestione sezione con logica intelligente (titolo + primo rigo)
      const oggettoText = data.oggetto || 'Preventivo per servizi digitali';
      yPosition = writeSectionWithSmartPagination('Oggetto', oggettoText, leftColumnX, yPosition, contentWidth, 13, 11);
      yPosition += 15; // Spacing dopo la sezione
      
      // Sezione Tipologia di intervento
      // Gestione sezione con logica intelligente (titolo + primo rigo)
      const tipologiaText = data.tipologiaIntervento || 'Servizi digitali e consulenza specializzata';
      yPosition = writeSectionWithSmartPagination('Tipologia di intervento', tipologiaText, leftColumnX, yPosition, contentWidth, 13, 11);
      yPosition += 15; // Spacing dopo la sezione

      // Sezione Descrizione E-commerce
      if (hasEcommerceServices) {
        const ecommerceText = data.tipologiaInterventoEcommerce || ecommerceDescription;
        yPosition = writeSectionWithSmartPagination('Dettagli E-commerce', ecommerceText, leftColumnX, yPosition, contentWidth, 13, 10);
        yPosition += 10; // Spacing dopo la sezione
      }

      // Sezione Video e Post
      if (hasVideoPostServices) {
        const videoPostText = data.tipologiaInterventoVideoPost || videoPostDescription;
        yPosition = writeSectionWithSmartPagination('Dettagli Video e Post', videoPostText, leftColumnX, yPosition, contentWidth, 13, 10);
        yPosition += 10; // Spacing dopo la sezione
      }

      // Sezione Meta Ads
      if (hasMetaAdsServices) {
        const metaAdsText = data.tipologiaInterventoMetaAds || metaAdsDescription;
        yPosition = writeSectionWithSmartPagination('Dettagli Meta Ads', metaAdsText, leftColumnX, yPosition, contentWidth, 13, 10);
        yPosition += 10; // Spacing dopo la sezione
      }

      // Sezione Google Ads
      if (hasGoogleAdsServices) {
        const googleAdsText = data.tipologiaInterventoGoogleAds || googleAdsDescription;
        yPosition = writeSectionWithSmartPagination('Dettagli Google Ads', googleAdsText, leftColumnX, yPosition, contentWidth, 13, 10);
        yPosition += 10; // Spacing dopo la sezione
      }

      // Sezione SEO
      if (hasSeoServices) {
        const seoText = data.tipologiaInterventoSeo || seoDescription;
        yPosition = writeSectionWithSmartPagination('Dettagli SEO', seoText, leftColumnX, yPosition, contentWidth, 13, 10);
        yPosition += 10; // Spacing dopo la sezione
      }

      // Sezione Email Marketing
      if (hasEmailMarketingServices) {
        const emailMarketingText = data.tipologiaInterventoEmailMarketing || emailMarketingDescription;
        yPosition = writeSectionWithSmartPagination('Dettagli Email Marketing', emailMarketingText, leftColumnX, yPosition, contentWidth, 13, 10);
        yPosition += 10; // Spacing dopo la sezione
      }
      
      yPosition += 10;

      // DETTAGLIO PREVENTIVO - Rimosso per evitare pagine bianche

      // Header tabella rimosso - le tabelle iniziano direttamente con i servizi

      // Righe servizi - Converte dal formato frontend al formato array e raggruppa in 2 tabelle
      const serviziArray = convertServiziToArray(data);
      const serviziGrouped = groupServiziByTable(serviziArray);
      const tableTotals = calculateTableTotals(serviziGrouped);
      let subtotale = 0;
      let itemIndex = 0;
      
      // Costanti per la gestione delle pagine
      const tableHeaderHeight = 20; // Altezza header tabella
      
      if (serviziArray.length > 0) {
        Object.entries(serviziGrouped).forEach(([tabella, servizi], tabellaIndex) => {
          // Spazio extra prima di ogni tabella (eccetto la prima)
          if (tabellaIndex > 0) {
            yPosition += 12; // Spazio maggiore tra tabelle
          }
          
          // LOGICA SEQUENZIALE COME I PARAGRAFI
          // Controllo solo se c'è spazio per header + prima riga
          const firstServizio = servizi[0];
          const firstServizioText = `${firstServizio.nome || 'Servizio'}\n${firstServizio.descrizione || ''}`;
          const firstServizioLines = doc.splitTextToSize(firstServizioText, 160);
          const firstServizioHeight = Math.max(12, firstServizioLines.length * 4 + 6);
          
          const minTableHeight = tableHeaderHeight + firstServizioHeight + 10; // Header + prima riga + padding
          
          // Per le tabelle usiamo un padding specifico di 10px dal margine inferiore
          const tableBottomMargin = 10; // Padding specifico per tabelle
          
          if (yPosition + minTableHeight > pageHeight - tableBottomMargin) {
            doc.addPage();
            pageNumber++; // Incrementa contatore pagina
            yPosition = addLogoHeader(); // Reset posizione Y con logo header
          }
          
          // Background per header tabella
          doc.setFillColor(248, 248, 248);  // Grigio chiaro
          doc.rect(leftColumnX, yPosition - 6, contentWidth, 12, 'F');
          
          // Bordo per header tabella
          doc.setDrawColor(224, 224, 224);  // Grigio medio
          doc.rect(leftColumnX, yPosition - 6, contentWidth, 12);
          
          doc.setTextColor(primaryColor);
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.text(tabella.toUpperCase(), leftColumnX + 4, yPosition + 2);
          yPosition += 12; // Spazio maggiore dopo header
          
          // Servizi della tabella
          servizi.forEach((servizio) => {
            const prezzo = servizio.prezzo || 0;
            subtotale += prezzo;

            // Calcola l'altezza della riga prima di disegnarla
            const nome = servizio.nome || 'Servizio';
            const descrizione = servizio.descrizione || '';
            const fullText = `${nome}\n${descrizione}`;
            const maxWidth = 160;
            const lines = doc.splitTextToSize(fullText, maxWidth);
            const rowHeight = Math.max(12, lines.length * 4 + 6);
            
            // Controllo sequenziale per ogni riga (come i paragrafi)
            if (yPosition + rowHeight > pageHeight - tableBottomMargin) {
              doc.addPage();
              pageNumber++; // Incrementa contatore pagina
              yPosition = addLogoHeader(); // Reset posizione Y con logo header
            }

            // Alternanza colori righe con migliore contrasto
            if (itemIndex % 2 === 0) {
              doc.setFillColor(255, 255, 255);  // Bianco
            } else {
              doc.setFillColor(248, 248, 248);  // Grigio chiaro
            }
            
            doc.rect(leftColumnX, yPosition - 4, contentWidth, rowHeight, 'F');

            doc.setTextColor(textColor);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');
            
            // Nome del servizio in grassetto
            doc.setFont('helvetica', 'bold');
            doc.text(nome, leftColumnX + 4, yPosition + 2);
            
            // Descrizione del servizio in normale
            if (descrizione) {
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(10);
              doc.setTextColor(102, 102, 102); // Grigio per la descrizione
              const descLines = doc.splitTextToSize(descrizione, 160);
              doc.text(descLines, leftColumnX + 4, yPosition + 6);
            }

            yPosition += rowHeight + 2; // Spazio extra tra righe
            itemIndex++;
          });
          
          // Totali della tabella - Stile identico al totale generale
          if (tableTotals[tabella]) {
            const tabellaTotals = tableTotals[tabella];
            
            // Spazio prima dei totali della tabella
            yPosition += 15;
            
            // Controllo preventivo per il tabellino totali (logica sequenziale)
            const tabellinoHeight = 30 + 15; // Altezza box + spazio extra
            if (yPosition + tabellinoHeight > pageHeight - tableBottomMargin) {
              doc.addPage();
              pageNumber++; // Incrementa contatore pagina
              yPosition = addLogoHeader(); // Reset posizione Y con logo header
            }
            
            // Rettangolo per totali con stile identico al totale generale
            const totalBoxY = yPosition;
            const totalBoxHeight = 30; // Altezza del box totali
            const totalBoxWidth = 110; // Larghezza maggiore come il totale generale
            const totalBoxX = pageWidth - margin - totalBoxWidth;
            
            // Background con gradiente simulato (identico al totale generale)
            doc.setFillColor(248, 248, 248);  // Grigio chiaro
            doc.rect(totalBoxX, totalBoxY, totalBoxWidth, totalBoxHeight, 'F');
            
            // Bordo più spesso (identico al totale generale)
            doc.setDrawColor(0, 0, 0);  // Nero
            doc.setLineWidth(0.5);
            doc.rect(totalBoxX, totalBoxY, totalBoxWidth, totalBoxHeight);

            // Testo totali con migliore spaziatura (identico al totale generale)
            doc.setTextColor(textColor);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');
            
            // Determina il testo per il subtotale in base alla tabella
            const subtotaleText = tabella === 'MARKETING' ? 'Totale mensilità:' : 'Subtotale:';
            
            // Subtotale tabella
            doc.text(subtotaleText, totalBoxX + 6, totalBoxY + 8);
            doc.text(formatCurrency(tabellaTotals.subtotale), totalBoxX + 75, totalBoxY + 8);
            
            // IVA tabella
            doc.text('IVA (22%):', totalBoxX + 6, totalBoxY + 16);
            doc.text(formatCurrency(tabellaTotals.iva), totalBoxX + 75, totalBoxY + 16);
            
            // Linea separatrice (identica al totale generale)
            doc.setDrawColor(200, 200, 200);
            doc.line(totalBoxX + 5, totalBoxY + 20, totalBoxX + totalBoxWidth - 5, totalBoxY + 20);
            
            // Totale tabella (identico al totale generale)
            doc.setTextColor(primaryColor);
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('TOTALE:', totalBoxX + 6, totalBoxY + 26);
            doc.text(formatCurrency(tabellaTotals.totale), totalBoxX + 75, totalBoxY + 26);
            
            yPosition += totalBoxHeight + 15; // Spazio maggiore dopo i totali
          }
          
          // Spazio extra dopo ogni tabella
          yPosition += 8;
        });
      } else {
        // Nessun servizio
        doc.setTextColor(102, 102, 102);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'italic');
        doc.text('Nessun servizio selezionato', leftColumnX + 2, yPosition);
        yPosition += 8;
      }

      // Totale generale rimosso - solo totali per singola sezione

      // TERMINI E CONDIZIONI
      // Calcola altezza totale necessaria per i termini
      const terminiTesto = data.terminiCondizioni || generateDefaultTerminiCondizioni(data.data);
      
      const termini = terminiTesto.split('\n');
      const terminiHeight = termini.reduce((total: number, termine: string) => {
        const indent = termine.startsWith(termine.match(/^\d+\./) ? termine.match(/^\d+\./)![0] : '') ? 0 : 8;
        const lines = doc.splitTextToSize(termine, contentWidth - indent);
        return total + (lines.length * 5 + 6);
      }, 0) + 20; // +20 per header e spacing
      
      // Controlla se c'è spazio per tutta la sezione termini
      if (!hasSpaceForText(terminiHeight, yPosition)) {
        doc.addPage();
        pageNumber++; // Incrementa contatore pagina
        yPosition = addLogoHeader(); // Reset posizione Y con logo header
      }
      
      // Background per sezione termini
      doc.setFillColor(248, 248, 248);  // Grigio chiaro
      doc.rect(leftColumnX, yPosition - 4, contentWidth, 8, 'F');
      
      doc.setTextColor(primaryColor);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Termini e Condizioni', leftColumnX + 2, yPosition + 2);
      
      yPosition += 12; // Spazio maggiore dopo il titolo
      doc.setTextColor(textColor);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      
      // Scrivi i termini
      termini.forEach((termine: string) => {
        // Indentazione per i punti
        const indent = termine.startsWith(termine.match(/^\d+\./) ? termine.match(/^\d+\./)![0] : '') ? 0 : 8;
        
        // Gestione lunghezza testo con wrapping automatico
        const termineLines = doc.splitTextToSize(termine, contentWidth - indent);
        doc.text(termineLines, leftColumnX + indent, yPosition);
        // Calcolo corretto yPosition per font size 9 (line height ~5)
        yPosition += termineLines.length * 5 + 6; // Spazio maggiore tra le righe
      });

      // FIRMA E DATA PER ACCETTAZIONE PREVENTIVO
      yPosition += 20; // Spazio extra prima della sezione firma
      
      // Controlla se c'è spazio per la sezione firma
      const firmaHeight = 60; // Altezza stimata per la sezione firma
      if (!hasSpaceForText(firmaHeight, yPosition)) {
        doc.addPage();
        pageNumber++;
        yPosition = addLogoHeader();
      }

      // Titolo sezione firma
      doc.setTextColor(primaryColor);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Firma e data per accettazione preventivo', leftColumnX, yPosition);
      
      yPosition += 20; // Spazio dopo il titolo
      
      // FIRMA E DATA - Centrati perfettamente
      const firmaY = yPosition;
      const dataY = yPosition;
      const lineLength = 60; // Linea più corta per migliore centratura
      
      // Calcolo semplice e preciso per centratura
      const pageCenter = pageWidth / 2;
      const fieldSpacing = 80; // Spazio tra i due campi
      const dataX = pageCenter - fieldSpacing - 10; // Data a sinistra del centro - 10px
      const firmaX = pageCenter + 20 - 10; // Firma a destra del centro - 10px
      
      // Linea per la data (sinistra)
      doc.setTextColor(textColor);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('Data:', dataX, dataY);
      doc.line(dataX + 15, dataY + 5, dataX + 15 + lineLength, dataY + 5);
      
      // Linea per la firma (destra)
      doc.text('Firma:', firmaX, firmaY);
      doc.line(firmaX + 15, firmaY + 5, firmaX + 15 + lineLength, firmaY + 5);
      
      yPosition += 30; // Spazio dopo le linee

      // FOOTER
      const footerY = pageHeight - 15;
      doc.setTextColor(102, 102, 102);  // Grigio scuro
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('Evoluzione Imprese S.R.L. - P.IVA: 04636340988 - info@evoluzioneimprese.com', pageWidth / 2, footerY, { align: 'center' });

      // Salva il PDF
      const fileName = `Preventivo_${numeroPreventivo}_${data.cliente.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      doc.save(fileName);

      toast.success('✅ PDF vettoriale generato con successo!', fileName);
      
    } catch (error) {
      console.error('Errore durante la generazione del PDF vettoriale:', error);
      const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
      toast.error('❌ Errore nella generazione PDF vettoriale', errorMessage);
    }
  };



  return (
    <div className="preventivo-preview">
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
      <div ref={documentRef} className="preventivo-document">
        <style>{`
          .preventivo-document {
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
            .preventivo-document {
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
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.2s;
          }

          .toolbar-button:hover {
            background: #333333;
          }

          /* HEADER - Identico all'export vettoriale */
          .header-section {
            height: 80mm;
            background: #000000;
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: white;
            overflow: hidden;
          }

          .header-section::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-image: url('./header-preventivi.png');
            background-size: cover;
            background-position: center;
            opacity: 0.8;
            z-index: 1;
          }

          .header-content {
            position: relative;
            z-index: 2;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
          }

          .logo-area {
            position: relative;
            z-index: 2;
            margin-bottom: 15px;
            padding: 0;
            border: none;
            background: none;
            box-shadow: none;
          }

          .logo-area img {
            height: 18mm;
            width: auto;
            max-width: 100%;
            border: none;
            background: none;
            box-shadow: none;
            outline: none;
            display: block;
          }

          .header-content h1 {
            font-size: 22px;
            font-weight: bold;
            margin: 0 0 10px 0;
            text-align: center;
            text-shadow: 0 2px 4px rgba(0,0,0,0.3);
          }

          .preventivo-number {
            font-size: 16px;
            font-weight: normal;
            margin: 0;
            text-align: center;
          }

          /* CONTENUTO PRINCIPALE */
          .main-content {
            padding: 15mm 0;
            max-width: 800px;
            margin: 0 auto;
          }

          .info-section {
            display: flex;
            justify-content: center;
            gap: 60px;
            margin-bottom: 30px;
            padding: 0 20px 20px 20px;
            border-bottom: 1px solid #eee;
          }

          .company-info h2 {
            font-size: 14px;
            font-weight: bold;
            color: #333333;
            margin: 0 0 6px 0;
          }

          .company-info p {
            font-size: 11px;
            margin: 0 0 6px 0;
            color: #333333;
          }

          .client-info p {
            font-size: 11px;
            margin: 0 0 6px 0;
            color: #333333;
            text-align: right;
          }

          /* SEZIONI */
          .section {
            margin-bottom: 20px;
          }

          .section-title {
            font-size: 13px;
            font-weight: bold;
            color: #000000;
            margin-bottom: 8px;
          }

          .section-content {
            font-size: 11px;
            color: #333333;
            line-height: 1.4;
            white-space: pre-line;
          }

          /* TABELLA DETTAGLI */
          .dettagli-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }

          .dettagli-table thead {
            background-color: #f8f8f8;
          }

          .dettagli-table th {
            font-size: 11px;
            font-weight: bold;
            color: #000000;
            padding: 8px 2px;
            text-align: left;
            border-bottom: 1px solid #000000;
            width: 100%;
          }

          .dettagli-table td {
            font-size: 11px;
            padding: 8px 2px;
            border-bottom: 1px solid #eee;
            vertical-align: top;
            width: 100%;
          }

          .dettagli-table tbody tr:nth-child(even) {
            background-color: #f8f8f8;
          }

          .dettagli-table tbody tr:nth-child(odd) {
            background-color: #ffffff;
          }

          .servizio-categoria {
            font-weight: bold;
            margin-bottom: 2px;
          }

          .servizio-descrizione {
            font-size: 10px;
            color: #666;
            line-height: 1.3;
          }


          /* TOTALI - Allineati a destra come nell'export */
          .totali-section {
            display: flex;
            justify-content: flex-end;
            margin: 20px 0;
          }

          .totali-box {
            width: 100mm;
            background-color: #f8f8f8;
            border: 1px solid #000000;
            padding: 8px;
          }

          .totale-row {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            margin-bottom: 3px;
            color: #333333;
            padding: 2px 0;
          }

          .totale-finale {
            font-size: 12px;
            font-weight: bold;
            color: #000000;
            border-top: 1px solid #000000;
            padding-top: 5px;
            margin-top: 5px;
            margin-bottom: 0;
          }

          /* FOOTER */
          .footer {
            position: absolute;
            bottom: 5mm;
            left: 15mm;
            right: 15mm;
            text-align: center;
            font-size: 8px;
            color: #999;
            border-top: 1px solid #eee;
            padding-top: 5px;
          }
        `}</style>

        {/* HEADER - Identico all'export vettoriale */}
        <div className="header-section">
          <div className="header-content">
            <div className="logo-area">
              <img 
                src="/assets/logo-evoluzione-white.png" 
                alt="Evoluzione Imprese" 
                className="logo"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
            </div>
            <h1>PREVENTIVO</h1>
            <div className="preventivo-number">N. {data.numero || `PREV-${Date.now()}`}</div>
          </div>
        </div>

        {/* CONTENUTO PRINCIPALE */}
        <div className="main-content">
          {/* Informazioni azienda e cliente */}
          <div className="info-section">
              <div className="company-info">
              <h2>EVOLUZIONE IMPRESE S.R.L.</h2>
              <p>P.IVA: 04636340988</p>
              <p>SDI: JI3TXCE</p>
              <p>Email: info@evoluzioneimprese.com</p>
                </div>
              <div className="client-info">
              <p><strong>DATA:</strong> {formatDateItalian(data.data || new Date())}</p>
              <p><strong>CLIENTE:</strong> {data.cliente}</p>
              <p><strong>VALIDITÀ:</strong> {formatDateItalian(data.validita) || '30 giorni'}</p>
            </div>
          </div>

          {/* Sezione Oggetto */}
          <div className="section">
            <div className="section-title">Oggetto</div>
            <div className="section-content">
              {data.oggetto || 'Preventivo per servizi digitali'}
            </div>
          </div>

          {/* Sezione Tipologia di intervento */}
          <div className="section">
            <div className="section-title">Tipologia di intervento</div>
            <div className="section-content">
              {data.tipologiaIntervento || 'Servizi digitali e consulenza specializzata'}
            </div>
          </div>

          {/* Sezione Descrizione E-commerce */}
          {hasEcommerceServices && (
            <div className="section">
              <div className="section-title">Dettagli E-commerce</div>
              <div className="section-content" style={{ 
                whiteSpace: 'pre-line',
                lineHeight: '1.6',
                fontSize: '12px'
              }}>
                {data.tipologiaInterventoEcommerce || ecommerceDescription}
              </div>
            </div>
          )}

          {/* Sezione Descrizione Video e Post */}
          {hasVideoPostServices && (
            <div className="section">
              <div className="section-title">Dettagli Video e Post</div>
              <div className="section-content" style={{ 
                whiteSpace: 'pre-line',
                lineHeight: '1.6',
                fontSize: '12px'
              }}>
                {data.tipologiaInterventoVideoPost || videoPostDescription}
              </div>
            </div>
          )}

          {/* Sezione Descrizione Meta Ads */}
          {hasMetaAdsServices && (
            <div className="section">
              <div className="section-title">Dettagli Meta Ads</div>
              <div className="section-content" style={{ 
                whiteSpace: 'pre-line',
                lineHeight: '1.6',
                fontSize: '12px'
              }}>
                {data.tipologiaInterventoMetaAds || metaAdsDescription}
              </div>
            </div>
          )}

          {/* Sezione Descrizione Google Ads */}
          {hasGoogleAdsServices && (
            <div className="section">
              <div className="section-title">Dettagli Google Ads</div>
              <div className="section-content" style={{ 
                whiteSpace: 'pre-line',
                lineHeight: '1.6',
                fontSize: '12px'
              }}>
                {data.tipologiaInterventoGoogleAds || googleAdsDescription}
              </div>
            </div>
          )}

          {/* Sezione Descrizione SEO */}
          {hasSeoServices && (
            <div className="section">
              <div className="section-title">Dettagli SEO</div>
              <div className="section-content" style={{ 
                whiteSpace: 'pre-line',
                lineHeight: '1.6',
                fontSize: '12px'
              }}>
                {data.tipologiaInterventoSeo || seoDescription}
              </div>
            </div>
          )}

          {/* Sezione Descrizione Email Marketing */}
          {hasEmailMarketingServices && (
            <div className="section">
              <div className="section-title">Dettagli Email Marketing</div>
              <div className="section-content" style={{ 
                whiteSpace: 'pre-line',
                lineHeight: '1.6',
                fontSize: '12px'
              }}>
                {data.tipologiaInterventoEmailMarketing || emailMarketingDescription}
              </div>
            </div>
          )}


          {/* Dettaglio Preventivo - Rimosso per evitare pagine bianche */}
          <div className="section" style={{ marginTop: '20px' }}>
            <table className="dettagli-table" style={{
              width: '100%',
              borderCollapse: 'collapse',
              border: '1px solid #ddd',
              borderTop: 'none',
              marginTop: '0'
            }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f8f8' }}>
                  <th style={{
                    width: '100%',
                    padding: '12px 16px',
                    textAlign: 'left',
                    borderBottom: '2px solid #000000',
                    color: '#000000',
                    fontSize: '14px',
                    fontWeight: 'bold'
                  }}>
                    Descrizione
                  </th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Converte i servizi dal formato frontend al formato array
                  const serviziArray = convertServiziToArray(data);
                  console.log('🔍 Rendering servizi convertiti:', serviziArray);
                  
                  if (serviziArray.length > 0) {
                    // Raggruppa i servizi in 2 tabelle: E-commerce e Marketing
                    const serviziGrouped = groupServiziByTable(serviziArray);
                    const tableTotals = calculateTableTotals(serviziGrouped);
                    
                    return Object.entries(serviziGrouped).map(([tabella, servizi], tabellaIndex) => (
                      <React.Fragment key={tabella}>
                        {/* Spazio extra tra tabelle (eccetto la prima) */}
                        {tabellaIndex > 0 && (
                          <tr>
                            <td colSpan={1} style={{ height: '16px', backgroundColor: 'transparent' }}></td>
                          </tr>
                        )}
                        
                        {/* Header tabella con styling migliorato */}
                        <tr style={{ backgroundColor: '#f8f8f8', fontWeight: 'bold' }}>
                          <td colSpan={1} style={{ 
                            padding: '12px 8px', 
                            color: '#000000', 
                            fontSize: '12px',
                            border: '1px solid #e0e0e0',
                            borderBottom: '2px solid #000000'
                          }}>
                            {tabella.toUpperCase()}
                          </td>
                        </tr>
                        
                        {/* Servizi della tabella */}
                        {servizi.map((servizio, index) => (
                          <tr key={`${tabella}-${index}`} style={{
                            backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8f8f8'
                          }}>
                            <td style={{ padding: '8px 12px' }}>
                              <div style={{ lineHeight: '1.4' }}>
                                {/* Nome del servizio in grassetto */}
                                <div style={{ 
                                  fontWeight: 'bold', 
                                  fontSize: '12px', 
                                  color: '#000000',
                                  marginBottom: '2px'
                                }}>
                                  {servizio.nome || 'Servizio'}
                                </div>
                                {/* Descrizione del servizio */}
                                <div style={{ 
                                  fontSize: '10px', 
                                  color: '#666666',
                                  lineHeight: '1.3'
                                }}>
                                  {servizio.descrizione || ''}
                                  {servizio.quantita && servizio.quantita > 1 && ` (Qty: ${servizio.quantita})`}
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                        
                        {/* Totali della tabella - Stile identico al totale generale */}
                        {tableTotals[tabella] && (
                          <tr>
                            <td colSpan={1} style={{ padding: '0' }}>
                              <div style={{ 
                                display: 'flex', 
                                justifyContent: 'flex-end',
                                margin: '20px 0'
                              }}>
                                <div style={{
                                  backgroundColor: '#f8f8f8',
                                  border: '1px solid #000000',
                                  borderRadius: '4px',
                                  padding: '12px 16px',
                                  minWidth: '200px',
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                }}>
                                  <div style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    marginBottom: '8px',
                                    fontSize: '14px',
                                    color: '#333'
                                  }}>
                                    <span>{tabella === 'MARKETING' ? 'Totale mensilità:' : 'Subtotale:'}</span>
                                    <span style={{ fontWeight: '500' }}>{formatCurrency(tableTotals[tabella].subtotale)}</span>
                                  </div>
                                  
                                  <div style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    marginBottom: '8px',
                                    fontSize: '14px',
                                    color: '#333'
                                  }}>
                                    <span>IVA (22%):</span>
                                    <span style={{ fontWeight: '500' }}>{formatCurrency(tableTotals[tabella].iva)}</span>
                                  </div>
                                  
                                  {/* Linea separatrice */}
                                  <div style={{ 
                                    borderTop: '1px solid #c8c8c8', 
                                    margin: '8px 0',
                                    height: '1px'
                                  }}></div>
                                  
                                  <div style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between',
                                    fontSize: '16px',
                                    fontWeight: 'bold',
                                    color: '#000000',
                                    marginTop: '8px'
                                  }}>
                                    <span>TOTALE:</span>
                                    <span>{formatCurrency(tableTotals[tabella].totale)}</span>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        
                        {/* Spazio extra dopo ogni tabella */}
                        <tr>
                          <td colSpan={1} style={{ height: '8px', backgroundColor: 'transparent' }}></td>
                        </tr>
                      </React.Fragment>
                    ));
                  } else {
                    // Nessun servizio
                    return (
                      <tr>
                        <td colSpan={1} style={{textAlign: 'center', color: '#666', fontStyle: 'italic'}}>
                          Nessun servizio selezionato
                        </td>
                      </tr>
                    );
                  }
                })()}
              </tbody>
            </table>
          </div>

          {/* Totale generale rimosso - solo totali per singola sezione */}

          {/* Termini e condizioni - Stile identico al PDF */}
          <div className="section" style={{ marginTop: '30px' }}>
            <div className="section-title" style={{
              backgroundColor: '#f8f8f8',
              padding: '8px 12px',
              border: '1px solid #e0e0e0',
              borderBottom: '2px solid #000000',
              marginBottom: '12px',
              fontSize: '16px',
              fontWeight: 'bold',
              color: '#000000'
            }}>
              Termini e Condizioni
            </div>
            <div className="section-content" style={{ 
              fontSize: '12px',
              lineHeight: '1.6',
              color: '#333'
            }}>
              <div style={{ whiteSpace: 'pre-line' }}>
                {data.terminiCondizioni || generateDefaultTerminiCondizioni(data.data)}
              </div>
              {data.terminiPagamento && (
                <div style={{
                  marginTop: '12px', 
                  padding: '10px', 
                  backgroundColor: '#f8f9fa', 
                  border: '1px solid #ddd', 
                  borderRadius: '4px',
                  fontSize: '11px'
                }}>
                  <strong>Termini di pagamento:</strong> {data.terminiPagamento}
                </div>
              )}
            </div>
          </div>

          {/* Note aggiuntive */}
          {data.note && (
            <div className="section">
              <div className="section-title">Note Aggiuntive</div>
              <div className="section-content">
                {data.note}
              </div>
            </div>
          )}

          {/* Firma e data per accettazione preventivo */}
          <div className="section" style={{ marginTop: '30px' }}>
            <div className="section-title">Firma e data per accettazione preventivo</div>
            <div className="section-content" style={{ 
              display: 'flex', 
              justifyContent: 'center',
              gap: '80px',
              marginTop: '20px',
              padding: '20px 0'
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ 
                  borderBottom: '1px solid #333', 
                  height: '30px',
                  marginBottom: '10px'
                }}></div>
                <div style={{ fontSize: '12px', color: '#666' }}>Data</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ 
                  borderBottom: '1px solid #333', 
                  height: '30px',
                  marginBottom: '10px'
                }}></div>
                <div style={{ fontSize: '12px', color: '#666' }}>Firma</div>
              </div>
            </div>
          </div>
          </div>

        {/* Footer */}
        <div className="footer">
          <p>Evoluzione Imprese S.R.L. - P.IVA: 04636340988 - info@evoluzioneimprese.com</p>
          </div>

      </div>
    </div>
  );
};
