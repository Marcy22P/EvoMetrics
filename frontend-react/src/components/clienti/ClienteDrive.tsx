import React, { useState, useEffect, useRef } from 'react';
import { LegacyCard, BlockStack, Button, InlineStack, Box, Text, IndexTable, Spinner, Banner, EmptyState, Icon, Modal, TextField, FormLayout } from '@shopify/polaris';
import { FolderIcon, FileIcon, UploadIcon, ExternalIcon, PlusIcon, NoteIcon } from '@shopify/polaris-icons';
import { clientiApi, type DriveFile } from '../../services/clientiApi';
import { toast } from 'react-hot-toast';

interface ClienteDriveProps {
  clienteId: string;
  folderId?: string; // Se null, prova a usare quello salvato nel cliente
  clienteName?: string;
}

interface BreadcrumbItem {
  id: string;
  name: string;
}

const ClienteDrive: React.FC<ClienteDriveProps> = ({ clienteId, folderId: initialFolderId, clienteName }) => {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(initialFolderId);
  const [rootFolderId, setRootFolderId] = useState<string | undefined>();
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Create Folder Modal State
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (clienteId) {
        // Se è il primo caricamento e non abbiamo un folderId, carichiamo la root
        // Se abbiamo un folderId iniziale (es. passato da props), lo usiamo
        loadFiles(currentFolderId);
    }
  }, [clienteId, currentFolderId]);

  const loadFiles = async (fId?: string) => {
    try {
        setLoading(true);
        setError(null);
        const res = await clientiApi.listDriveFiles(clienteId, fId);
        
        if (res.message === "Cartella non inizializzata") {
            setFiles([]);
            setRootFolderId(undefined);
        } else {
            setFiles(res.files);
            
            const rootName = clienteName || 'Home';
            
            // Logica Breadcrumbs base
            // Se siamo alla root (o prima chiamata senza ID), salviamo l'ID come root
            if (!rootFolderId && res.current_folder_id) {
                setRootFolderId(res.current_folder_id);
                setBreadcrumbs([{ id: res.current_folder_id, name: rootName }]);
            } else if (fId && fId !== rootFolderId) {
                // Se stiamo navigando in una sottocartella, aggiungiamo breadcrumb (semplificato)
                // In una implementazione completa, il backend dovrebbe restituire tutto il path
                // Qui facciamo una gestione locale ottimistica
                if (!breadcrumbs.find(b => b.id === fId)) {
                   // Cerchiamo il nome della cartella appena cliccata (era nei file precedenti?)
                   // Limitazione: se ricarichi la pagina perdi la history locale
                   setBreadcrumbs(prev => [...prev, { id: fId || '', name: '...' }]); 
                }
            } else if (fId === rootFolderId) {
                setBreadcrumbs([{ id: rootFolderId || '', name: rootName }]);
            }

            if (res.current_folder_id) setCurrentFolderId(res.current_folder_id);
        }
    } catch (err: any) {
        console.error("Drive load error:", err);
        setError("Impossibile caricare i file da Drive. Verifica la connessione.");
    } finally {
        setLoading(false);
    }
  };

  const handleInitFolder = async () => {
      try {
          setInitializing(true);
          const res = await clientiApi.initDriveFolder(clienteId);
          toast.success("Cartella Drive creata/collegata!");
          setRootFolderId(res.folder_id);
          setCurrentFolderId(res.folder_id); // Questo triggera useEffect -> loadFiles
      } catch (err: any) {
          toast.error("Errore creazione cartella Drive");
          setError(err.message);
      } finally {
          setInitializing(false);
      }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
          setUploading(true);
          await clientiApi.uploadDriveFile(clienteId, file, currentFolderId);
          toast.success("File caricato su Drive!");
          loadFiles(currentFolderId); // Reload
      } catch (err: any) {
          console.error("Upload error:", err);
          toast.error("Errore caricamento file");
      } finally {
          setUploading(false);
          // Reset input
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
  };
  
  const handleCreateFolder = async () => {
      if (!newFolderName.trim() || !currentFolderId) return;
      
      try {
          setIsCreatingFolder(true);
          await clientiApi.createDriveFolder(clienteId, newFolderName, currentFolderId);
          toast.success("Cartella creata!");
          setIsCreateFolderModalOpen(false);
          setNewFolderName('');
          loadFiles(currentFolderId);
      } catch (err: any) {
          toast.error("Errore creazione cartella");
          console.error(err);
      } finally {
          setIsCreatingFolder(false);
      }
  };

  const openInDrive = () => {
      if (currentFolderId) {
          window.open(`https://drive.google.com/drive/folders/${currentFolderId}`, '_blank');
      }
  };

  // Helper per icona e tipo
  const getFileIcon = (mimeType: string) => {
      if (mimeType === 'application/vnd.google-apps.folder') return FolderIcon;
      if (mimeType.includes('image')) return FileIcon; // TODO: ImageIcon
      if (mimeType.includes('pdf')) return NoteIcon;
      return FileIcon;
  };

  const handleRowClick = (file: DriveFile) => {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
          // Naviga dentro
          // Aggiorna breadcrumbs (optimistic)
          setBreadcrumbs(prev => [...prev, { id: file.id, name: file.name }]);
          setCurrentFolderId(file.id);
      } else {
          window.open(file.webViewLink, '_blank');
      }
  };
  
  const handleBreadcrumbClick = (id: string) => {
      // Taglia breadcrumbs fino a questo ID
      const index = breadcrumbs.findIndex(b => b.id === id);
      if (index !== -1) {
          setBreadcrumbs(breadcrumbs.slice(0, index + 1));
          setCurrentFolderId(id);
      }
  };

  if (loading && !files.length && !error) return (
      <div style={{ padding: '16px', minHeight: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spinner size="large" />
      </div>
  );

  return (
    <LegacyCard title="Google Drive" sectioned>
      <BlockStack gap="400">
        
        {/* Toolbar */}
        <InlineStack align="space-between">
            <InlineStack gap="200">
                {currentFolderId && (
                    <Button icon={ExternalIcon} onClick={openInDrive}>Apri su Drive</Button>
                )}
                 {currentFolderId && rootFolderId && currentFolderId !== rootFolderId && (
                    <Button onClick={() => {
                        // Go up logic
                        if (breadcrumbs.length > 1) {
                            handleBreadcrumbClick(breadcrumbs[breadcrumbs.length - 2].id);
                        } else {
                            handleBreadcrumbClick(rootFolderId);
                        }
                    }}>Indietro</Button>
                 )}
            </InlineStack>
            <InlineStack gap="200">
                <Button icon={PlusIcon} onClick={() => setIsCreateFolderModalOpen(true)} disabled={!currentFolderId}>Nuova Cartella</Button>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    style={{display: 'none'}} 
                    onChange={handleFileUpload} 
                />
                <Button 
                    variant="primary" 
                    icon={UploadIcon} 
                    loading={uploading}
                    disabled={!currentFolderId}
                    onClick={() => fileInputRef.current?.click()}
                >
                    Carica File
                </Button>
            </InlineStack>
        </InlineStack>
        
        {/* Breadcrumbs (Visual Only for now) */}
        {breadcrumbs.length > 0 && (
            <Box paddingBlockEnd="200">
                <Text as="p" tone="subdued">
                    {breadcrumbs.map((b, i) => (
                        <span key={b.id} style={{cursor: 'pointer', textDecoration: 'underline'}} onClick={() => handleBreadcrumbClick(b.id)}>
                            {b.name} {i < breadcrumbs.length - 1 ? ' > ' : ''}
                        </span>
                    ))}
                </Text>
            </Box>
        )}

        {error ? (
            <Banner tone="critical">{error}</Banner>
        ) : !currentFolderId ? (
            <EmptyState
                heading="Nessuna cartella Drive collegata"
                action={{
                    content: 'Crea Cartella Cliente',
                    onAction: handleInitFolder,
                    loading: initializing
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
                <p>Collega questo cliente a una cartella Google Drive per gestire i file.</p>
            </EmptyState>
        ) : files.length > 0 ? (
            <IndexTable
                resourceName={{ singular: 'file', plural: 'files' }}
                itemCount={files.length}
                headings={[
                    { title: 'Nome' },
                    { title: 'Data' },
                    { title: 'Dimensione' }
                ]}
                selectable={false}
            >
                {files.map((file, index) => (
                    <IndexTable.Row id={file.id} key={file.id} position={index} onClick={() => handleRowClick(file)}>
                        <IndexTable.Cell>
                            <InlineStack gap="200" blockAlign="center">
                                <Icon source={getFileIcon(file.mimeType)} tone="base" />
                                <Text as="span" variant="bodyMd" fontWeight="bold">
                                    {file.name}
                                </Text>
                            </InlineStack>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                            {file.createdTime ? new Date(file.createdTime).toLocaleDateString() : '-'}
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                            {file.size ? `${(parseInt(file.size) / 1024 / 1024).toFixed(2)} MB` : '-'}
                        </IndexTable.Cell>
                    </IndexTable.Row>
                ))}
            </IndexTable>
        ) : (
            <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                <Text as="p" alignment="center" tone="subdued">Cartella vuota.</Text>
            </Box>
        )}
      </BlockStack>
      
      {/* Create Folder Modal */}
      <Modal
        open={isCreateFolderModalOpen}
        onClose={() => setIsCreateFolderModalOpen(false)}
        title="Crea Nuova Cartella"
        primaryAction={{
            content: 'Crea',
            onAction: handleCreateFolder,
            loading: isCreatingFolder,
            disabled: !newFolderName.trim()
        }}
        secondaryActions={[{
            content: 'Annulla',
            onAction: () => setIsCreateFolderModalOpen(false)
        }]}
      >
          <Modal.Section>
              <FormLayout>
                  <TextField
                    label="Nome Cartella"
                    value={newFolderName}
                    onChange={(v) => setNewFolderName(v)}
                    autoComplete="off"
                  />
              </FormLayout>
          </Modal.Section>
      </Modal>
    </LegacyCard>
  );
};

export default ClienteDrive;
