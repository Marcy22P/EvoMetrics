import React, { useState, useEffect, useRef } from 'react';
import { 
    Page, Layout, Card, Text, BlockStack, Button, Box, InlineStack, 
    IndexTable, Icon, Spinner, Modal, TextField, Banner, Tooltip
} from '@shopify/polaris';
import { 
    ExternalIcon, LogoGoogleIcon, FolderIcon, FileIcon, NoteIcon, 
    ImageIcon, ArrowLeftIcon, PlusIcon, UploadIcon, ImportIcon
} from '@shopify/polaris-icons';
import { useAuth } from '../hooks/useAuth';
import { getServiceUrl } from '../utils/apiConfig';
import { clientiApi } from '../services/clientiApi';
import { toast } from '../utils/toast';

interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    webViewLink: string;
    iconLink?: string;
    size?: string;
}

const GlobalDriveBrowser: React.FC = () => {
    const CLIENTI_SERVICE_URL = getServiceUrl('clienti');

    const [files, setFiles] = useState<DriveFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(undefined);
    const [breadcrumbs, setBreadcrumbs] = useState<{id: string, name: string}[]>([]);
    
    // Search
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    // Create Folder Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    
    // Upload
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    // Error Banner
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Debounce Search Effect
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const fetchFiles = async (folderId?: string, query?: string) => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const token = localStorage.getItem('auth_token');
            const url = new URL(`${CLIENTI_SERVICE_URL}/api/drive/files`);
            if (folderId) url.searchParams.append('folder_id', folderId);
            if (query) url.searchParams.append('q', query);
            
            const response = await fetch(url.toString(), {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                setFiles(data.files);
                // Se è una ricerca, non aggiorniamo breadcrumbs o folder ID per evitare confusione
                if (!query) {
                    setCurrentFolderId(data.current_folder_id);
                }
                // Mostra messaggio se presente (es. struttura non inizializzata)
                if (data.message) {
                    setErrorMsg(data.message);
                }
            } else {
                setErrorMsg("Errore caricamento file");
            }
        } catch (error) {
            console.error("Error fetching files:", error);
            setErrorMsg("Errore di connessione");
        } finally {
            setLoading(false);
        }
    };

    // Reload when folder or search changes
    useEffect(() => {
        // Se c'è una ricerca attiva, ignoriamo folderId e cerchiamo globalmente (o nella cartella corrente se backend lo supportasse in combo, 
        // ma la nostra logica backend usa folderId O query.
        // Se vogliamo cercare DENTRO la cartella corrente, dovremmo passare entrambi.
        // Attuale logica Backend: if folder_id ... elif query ...
        // Quindi la ricerca è globale se non c'è folder_id, oppure è ignorata se c'è folder_id.
        // FIX Backend richiesto se vogliamo cercare OVUNQUE o DENTRO cartella.
        // La mia modifica backend usa: if folder_id ... elif not q ...
        // E POI if q -> append. Quindi supporta entrambi!
        
        // Se cerchiamo, rimaniamo nella "vista" corrente ma filtriamo
        fetchFiles(currentFolderId, debouncedSearch);
    }, [debouncedSearch, currentFolderId]);

    const handleFolderClick = (folderId: string, folderName: string) => {
        setSearchTerm(""); // Reset search on navigation
        setBreadcrumbs([...breadcrumbs, { id: folderId, name: folderName }]);
        setCurrentFolderId(folderId); // Triggera useEffect
    };

    const handleBackClick = () => {
        setSearchTerm("");
        const newBreadcrumbs = [...breadcrumbs];
        newBreadcrumbs.pop();
        setBreadcrumbs(newBreadcrumbs);
        
        const parentId = newBreadcrumbs.length > 0 ? newBreadcrumbs[newBreadcrumbs.length - 1].id : undefined;
        setCurrentFolderId(parentId);
    };

    const handleCreateFolder = async () => {
        if (!newFolderName) return;
        try {
            const token = localStorage.getItem('auth_token');
            const formData = new FormData();
            formData.append('name', newFolderName);
            if (currentFolderId) formData.append('parent_id', currentFolderId);

            const res = await fetch(`${CLIENTI_SERVICE_URL}/api/drive/folder`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (res.ok) {
                setNewFolderName("");
                setIsModalOpen(false);
                fetchFiles(currentFolderId);
            } else {
                setErrorMsg("Impossibile creare cartella qui. Assicurati di essere in una cartella condivisa.");
            }
        } catch (e) {
            console.error(e);
            setErrorMsg("Errore creazione cartella");
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setUploading(true);
        setErrorMsg(null);
        try {
            const token = localStorage.getItem('auth_token');
            const formData = new FormData();
            formData.append('file', file);
            if (currentFolderId) formData.append('folder_id', currentFolderId);

            const res = await fetch(`${CLIENTI_SERVICE_URL}/api/drive/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (res.ok) {
                fetchFiles(currentFolderId);
            } else {
                const data = await res.json();
                console.error(data);
                if (res.status === 500 && JSON.stringify(data).includes("storageQuotaExceeded")) {
                     setErrorMsg("Errore Quota: Non puoi caricare file nella Root del Service Account. Entra prima in una cartella condivisa.");
                } else {
                     setErrorMsg("Errore upload file. Assicurati di avere i permessi.");
                }
            }
        } catch (e) {
            console.error(e);
            setErrorMsg("Errore upload file");
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleDownload = async (fileId: string, fileName: string) => {
        try {
            const token = localStorage.getItem('auth_token');
            // Costruisci URL per download diretto (triggera download nativo browser)
            const downloadUrl = `${CLIENTI_SERVICE_URL}/api/drive/download/${fileId}?token=${token}`;
            
            // Usa window.open o location.href per attivare il download manager
            // Questo evita il buffering in memoria di fetch/blob che rallenta tutto
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = fileName; // Suggerisce nome file (anche se backend manda header)
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
        } catch (e) {
            console.error(e);
            alert("Errore download");
        }
    };

    const getFileIcon = (mimeType: string) => {
        if (mimeType.includes('folder')) return FolderIcon;
        if (mimeType.includes('image')) return ImageIcon;
        if (mimeType.includes('pdf')) return NoteIcon;
        return FileIcon;
    };

    const formatSize = (bytes?: string) => {
        if (!bytes) return '-';
        const b = parseInt(bytes);
        if (b < 1024) return b + ' B';
        if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
        return (b / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const resourceName = { singular: 'file', plural: 'files' };
    const rowMarkup = files.map(
        ({ id, name, mimeType, webViewLink, size }, index) => (
            <IndexTable.Row id={id} key={id} position={index}>
                <IndexTable.Cell>
                    <InlineStack gap="200" align="start" blockAlign="center">
                        <div style={{ color: mimeType.includes('folder') ? '#5C6AC4' : 'inherit' }}>
                             <Icon source={getFileIcon(mimeType)} tone={mimeType.includes('folder') ? "base" : "subdued"} />
                        </div>
                        {mimeType === 'application/vnd.google-apps.folder' ? (
                            <Button variant="plain" onClick={() => handleFolderClick(id, name)}>{name}</Button>
                        ) : (
                            <a href={webViewLink} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
                                <Text as="span" variant="bodyMd">{name}</Text>
                            </a>
                        )}
                    </InlineStack>
                </IndexTable.Cell>
                <IndexTable.Cell>{mimeType.includes('folder') ? 'Cartella' : formatSize(size)}</IndexTable.Cell>
                <IndexTable.Cell>
                    <InlineStack gap="200">
                        {!mimeType.includes('folder') && (
                            <Tooltip content="Scarica File">
                                <Button 
                                    icon={ImportIcon} 
                                    variant="plain" 
                                    onClick={() => handleDownload(id, name)}
                                />
                            </Tooltip>
                        )}
                        <Tooltip content="Apri su Drive">
                            <Button 
                                icon={ExternalIcon} 
                                variant="plain" 
                                url={webViewLink} 
                                target="_blank"
                            />
                        </Tooltip>
                    </InlineStack>
                </IndexTable.Cell>
            </IndexTable.Row>
        ),
    );

    const isRoot = !currentFolderId;

    return (
        <Card>
            <Box padding="400">
                <BlockStack gap="400">
                    {errorMsg && (
                        <Banner tone="critical" onDismiss={() => setErrorMsg(null)}>
                            <p>{errorMsg}</p>
                        </Banner>
                    )}

                    <InlineStack align="space-between">
                        <InlineStack gap="200" align="center">
                            {breadcrumbs.length > 0 && (
                                <Button icon={ArrowLeftIcon} onClick={handleBackClick}>Indietro</Button>
                            )}
                            <Text as="h2" variant="headingMd">
                                {breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].name : 'WebApp Drive'}
                            </Text>
                        </InlineStack>
                        
                        <div style={{ minWidth: '300px' }}>
                            <TextField 
                                label="Cerca file" 
                                labelHidden 
                                placeholder="Cerca file o cartelle..." 
                                value={searchTerm} 
                                onChange={setSearchTerm}
                                autoComplete="off"
                                clearButton
                                onClearButtonClick={() => setSearchTerm("")}
                                prefix={<Icon source={NoteIcon} />}
                            />
                        </div>

                        <InlineStack gap="200">
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                style={{ display: 'none' }} 
                                onChange={handleFileUpload}
                            />
                             <Tooltip content={isRoot ? "Entra in una cartella condivisa per caricare file" : "Carica File"}>
                                <Button 
                                    icon={UploadIcon} 
                                    onClick={() => fileInputRef.current?.click()} 
                                    loading={uploading}
                                    disabled={isRoot}
                                >
                                    Carica File
                                </Button>
                            </Tooltip>
                            <Tooltip content={isRoot ? "Entra in una cartella condivisa per creare sottocartelle" : "Nuova Cartella"}>
                                <Button 
                                    icon={PlusIcon} 
                                    onClick={() => setIsModalOpen(true)}
                                    disabled={isRoot}
                                >
                                    Nuova Cartella
                                </Button>
                            </Tooltip>
                        </InlineStack>
                    </InlineStack>

                    {isRoot && (
                        <Banner tone="info">
                            <p>Sei nella cartella principale <strong>WebApp</strong>. Le cartelle visibili dipendono dai tuoi permessi. Per caricare file o creare cartelle, entra prima in una sottocartella.</p>
                        </Banner>
                    )}

                    {loading ? (
                        <Box padding="800"><InlineStack align="center"><Spinner /></InlineStack></Box>
                    ) : (
                        <IndexTable
                            resourceName={resourceName}
                            itemCount={files.length}
                            headings={[
                                { title: 'Nome' },
                                { title: 'Dimensione' },
                                { title: 'Azioni' },
                            ]}
                            selectable={false}
                        >
                            {rowMarkup}
                        </IndexTable>
                    )}
                </BlockStack>
            </Box>

            <Modal
                open={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="Crea Nuova Cartella"
                primaryAction={{
                    content: 'Crea',
                    onAction: handleCreateFolder,
                }}
                secondaryActions={[{
                    content: 'Annulla',
                    onAction: () => setIsModalOpen(false),
                }]}
            >
                <Modal.Section>
                    <TextField
                        label="Nome Cartella"
                        value={newFolderName}
                        onChange={setNewFolderName}
                        autoComplete="off"
                    />
                </Modal.Section>
            </Modal>
        </Card>
    );
};

const DrivePage: React.FC = () => {
    // URL Backend Clienti Service
    const CLIENTI_SERVICE_URL = getServiceUrl('clienti');
    
    const { user } = useAuth();
    const [isConnected, setIsConnected] = useState<boolean | null>(null);
    
    // Drive Structure
    const [driveStructure, setDriveStructure] = useState<any>(null);
    const [isInitializingStructure, setIsInitializingStructure] = useState(false);

    const checkStatus = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            console.log("Checking Drive Status... Token present:", !!token);
            
            const response = await fetch(`${CLIENTI_SERVICE_URL}/api/drive/status`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log("Drive Status Response:", data);
                setIsConnected(data.connected);
            } else {
                const text = await response.text();
                console.error("Drive Status Error:", response.status, text);
                setIsConnected(false); // Fallback
            }
        } catch (e) {
            console.error("Error checking drive status (Network/CORS):", e);
            setIsConnected(false);
        }
    };

    const loadDriveStructure = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`${CLIENTI_SERVICE_URL}/api/drive/structure`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setDriveStructure(data);
            }
        } catch (error) {
            console.error('Errore caricamento struttura Drive:', error);
        }
    };

    const handleInitStructure = async () => {
        setIsInitializingStructure(true);
        try {
            const result = await clientiApi.initDriveStructure();
            setDriveStructure(result);
            toast.success('Struttura WebApp inizializzata con successo!');
        } catch (error: any) {
            toast.error(error.message || 'Errore durante l\'inizializzazione della struttura');
        } finally {
            setIsInitializingStructure(false);
        }
    };

    useEffect(() => {
        checkStatus();
        loadDriveStructure();
    }, []);

    const handleConnectDrive = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`${CLIENTI_SERVICE_URL}/api/drive/google/login`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                alert("Errore generazione URL login");
            }
        } catch (e) {
            console.error(e);
            alert("Errore connessione backend");
        }
    };

    if (isConnected === null) {
        return <Page fullWidth><Box padding="800"><InlineStack align="center"><Spinner size="large"/></InlineStack></Box></Page>;
    }

    if (isConnected) {
        return (
            <Page title="Google Drive Aziendale" fullWidth>
                <Layout>
                    <Layout.Section>
                        {(user?.role === 'admin' || user?.role === 'superadmin') && (
                            <Card>
                                <Box padding="400">
                                    <BlockStack gap="300">
                                        {!driveStructure?.folders?.webapp?.id ? (
                                            <Banner tone="info">
                                                <p>
                                                    <strong>Struttura WebApp non inizializzata.</strong> Inizializza la struttura per organizzare automaticamente i file in cartelle dedicate (Clienti, Preventivi, Contratti, Procedure).
                                                </p>
                                                <Box paddingBlockStart="300">
                                                    <Button 
                                                        onClick={handleInitStructure}
                                                        loading={isInitializingStructure}
                                                        variant="primary"
                                                    >
                                                        Inizializza Struttura WebApp
                                                    </Button>
                                                </Box>
                                            </Banner>
                                        ) : (
                                            <Banner tone="success">
                                                <p>
                                                    <strong>Struttura WebApp attiva.</strong> Le cartelle sono organizzate in: 
                                                    {driveStructure?.folders?.clienti?.url && (
                                                        <a href={driveStructure.folders.clienti.url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: '8px' }}>
                                                            Clienti
                                                        </a>
                                                    )}
                                                    {driveStructure?.folders?.preventivi?.url && (
                                                        <a href={driveStructure.folders.preventivi.url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: '8px' }}>
                                                            Preventivi
                                                        </a>
                                                    )}
                                                    {driveStructure?.folders?.contratti?.url && (
                                                        <a href={driveStructure.folders.contratti.url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: '8px' }}>
                                                            Contratti
                                                        </a>
                                                    )}
                                                    {driveStructure?.folders?.procedure?.url && (
                                                        <a href={driveStructure.folders.procedure.url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: '8px' }}>
                                                            Procedure
                                                        </a>
                                                    )}
                                                </p>
                                            </Banner>
                                        )}
                                    </BlockStack>
                                </Box>
                            </Card>
                        )}
                        <Box paddingBlockStart="400">
                            <GlobalDriveBrowser />
                        </Box>
                    </Layout.Section>
                </Layout>
            </Page>
        );
    }

    return (
        <Page title="Google Drive Aziendale" fullWidth>
            <Layout>
                <Layout.Section>
                    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                        <Card>
                            <Box padding="600">
                                <BlockStack gap="600" align="center">
                                    <div style={{ textAlign: 'center' }}>
                                        <Text as="h2" variant="headingLg" alignment="center">
                                            Gestione Documentale Centralizzata
                                        </Text>
                                        <Box paddingBlockStart="200">
                                            <Text as="p" variant="bodyLg" tone="subdued" alignment="center">
                                                Gestisci tutti i file aziendali in un'unica interfaccia integrata.
                                            </Text>
                                        </Box>
                                    </div>
                                    
                                    <BlockStack gap="400">
                                        {(user?.role === 'admin' || user?.role === 'superadmin') ? (
                                            <>
                                                <Banner tone="warning">
                                                    <p>Drive non connesso. Connetti l'account Google "info@evoluzioneimprese.com" per abilitare il servizio per tutti gli utenti.</p>
                                                </Banner>

                                                <InlineStack align="center" gap="400">
                                                    <Button 
                                                        variant="primary" 
                                                        size="large"
                                                        icon={LogoGoogleIcon} 
                                                        onClick={handleConnectDrive}
                                                    >
                                                        Connetti Google Drive (Admin)
                                                    </Button>
                                                </InlineStack>
                                            </>
                                        ) : (
                                            <Banner tone="critical">
                                                <p>Il sistema Drive non è attualmente connesso. Contatta l'amministratore per attivare il servizio.</p>
                                            </Banner>
                                        )}
                                        
                                        <InlineStack align="center">
                                            <Button 
                                                icon={ExternalIcon} 
                                                size="large"
                                                onClick={() => window.open('https://drive.google.com', '_blank')}
                                            >
                                                Apri Drive Esterno
                                            </Button>
                                        </InlineStack>
                                    </BlockStack>
                                </BlockStack>
                            </Box>
                        </Card>
                    </div>
                </Layout.Section>
            </Layout>
        </Page>
    );
};

export default DrivePage;