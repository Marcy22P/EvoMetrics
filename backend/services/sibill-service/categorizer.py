"""
Categorizzatore automatico per transazioni bancarie.
Usa pattern matching euristico per categorizzare le spese secondo le regole fiscali italiane.
"""
from typing import Dict, Optional, Tuple
import re

# Definizione categorie con pattern di riconoscimento
EXPENSE_CATEGORIES = {
    "beni_strumentali": {
        "label": "Spese per beni strumentali",
        "deductibility": "100% o ammortamento annuale",
        "type": "Deducibilità",
        "description": "Beni durevoli, ad esempio computer, mobili e macchinari",
        "patterns": [
            r"computer|pc|laptop|notebook|desktop",
            r"mobile|mobili|sedia|tavolo|scrivania",
            r"macchinari|macchina|attrezzatura|equipaggiamento",
            r"stampante|scanner|monitor|display",
            r"hardware|server|workstation"
        ]
    },
    "canoni_locazione": {
        "label": "Canoni di locazione",
        "deductibility": "100%",
        "type": "Deducibilità",
        "description": "Affitti per locali commerciali e uffici",
        "patterns": [
            r"affitto|locazione|canone|rent|leasing immobiliare",
            r"ufficio|locale commerciale|negozio"
        ]
    },
    "utenze": {
        "label": "Utenze (luce, gas, telefono, internet)",
        "deductibility": "100% o percentuale per uso promiscuo",
        "type": "Deducibilità",
        "description": "Se utilizzate solo per attività aziendale sono deducibili al 100%",
        "patterns": [
            r"luce|elettricit|energia elettrica|enel|edison",
            r"gas|metano|gpl",
            r"telefono|telecom|tim|vodafone|wind|tre",
            r"internet|fibra|adsl|connessione|banda",
            r"bolletta|utenza|fornitura"
        ]
    },
    "spese_rappresentanza": {
        "label": "Spese di rappresentanza",
        "deductibility": "Massimo 1,5% dei ricavi",
        "type": "Deducibilità",
        "description": "Spese per omaggi, cene con clienti ed eventi",
        "patterns": [
            r"cena|pranzo|ristorante|pizzeria|trattoria",
            r"omaggio|regalo|gift",
            r"evento|convegno|conferenza|meeting"
        ]
    },
    "pubblicita_marketing": {
        "label": "Costi per pubblicità e marketing",
        "deductibility": "100%",
        "type": "Deducibilità",
        "description": "Inserzioni pubblicitarie, advertising online e produzione di contenuti promozionali",
        "patterns": [
            r"pubblicit|advertising|marketing|promozione",
            r"google ads|facebook ads|instagram ads|linkedin ads",
            r"stampa|volantino|brochure|depliant|catalogo",
            r"social media|seo|sem|content marketing",
            r"agenzia pubblicitaria|grafica pubblicitaria"
        ]
    },
    "compensi_amministratori": {
        "label": "Compensi amministratori",
        "deductibility": "100%",
        "type": "Deducibilità",
        "description": "Retribuzioni agli amministratori della società",
        "patterns": [
            r"amministratore|consigliere|socio|compenso amministratore",
            r"tfr amministratore|indennità amministratore"
        ]
    },
    "stipendi_contributi": {
        "label": "Stipendi e contributi dipendenti",
        "deductibility": "100%",
        "type": "Deducibilità",
        "description": "Tutti i costi legati al personale, compresi contributi INPS, TFR e IRAP",
        "patterns": [
            r"stipendio|salario|retribuzione|paga",
            r"contributi|inps|inail|tfr",
            r"dipendente|collaboratore|prestazione lavoro",
            r"busta paga|cedolino"
        ]
    },
    "formazione_personale": {
        "label": "Formazione del personale",
        "deductibility": "100%",
        "type": "Deducibilità",
        "description": "Spese per corsi, aggiornamenti, master e formazione",
        "patterns": [
            r"formazione|corso|master|aggiornamento|training",
            r"scuola|università|istituto|accademia",
            r"certificazione|qualifica|abilitazione"
        ]
    },
    "consulenza": {
        "label": "Spese di consulenza",
        "deductibility": "100%",
        "type": "Deducibilità",
        "description": "Onorari di commercialisti, avvocati, consulenti marketing, IT e altri professionisti",
        "patterns": [
            r"consulenza|consulente|onorario",
            r"commercialista|ragioniere|dottore commercialista",
            r"avvocato|studio legale|notaio",
            r"consulente marketing|consulente it|consulente hr"
        ]
    },
    "autoveicoli_aziendali": {
        "label": "Spese per autoveicoli aziendali",
        "deductibility": "Dal 20% al 70%",
        "type": "Deducibilità",
        "description": "La percentuale deducibile varia in base all'utilizzo",
        "patterns": [
            r"auto|automobile|veicolo|vettura",
            r"leasing auto|noleggio auto|acquisto auto"
        ]
    },
    "carburante_manutenzione": {
        "label": "Carburante e manutenzione auto",
        "deductibility": "Dal 20% al 70%",
        "type": "Deducibilità",
        "description": "Spese per carburante, manutenzione e gestione dei veicoli",
        "patterns": [
            r"benzina|diesel|gasolio|carburante|fuel",
            r"officina|gommista|carrozzeria|manutenzione auto",
            r"tagliando|revisione|bollo auto|assicurazione auto"
        ]
    },
    "alberghiere_ristorazione": {
        "label": "Spese alberghiere e ristorazione",
        "deductibility": "75%",
        "type": "Deducibilità",
        "description": "Spese per hotel e ristoranti deducibili al 75%",
        "patterns": [
            r"hotel|albergo|b&b|bed and breakfast",
            r"ristorante|trattoria|osteria|pizzeria",
            r"viaggio|trasferta|pernottamento"
        ]
    },
    "telefoniche_cellulari": {
        "label": "Spese telefoniche (cellulari)",
        "deductibility": "80%",
        "type": "Deducibilità",
        "description": "Spese per telefoni cellulari intestati alla società",
        "patterns": [
            r"cellulare|smartphone|iphone|samsung",
            r"ricarica|abbonamento telefono|piano tariffario"
        ]
    },
    "software_licenze": {
        "label": "Software e licenze",
        "deductibility": "100%",
        "type": "Deducibilità",
        "description": "Costi per software gestionali, servizi SaaS e licenze d'uso",
        "patterns": [
            r"software|licenza|saas|cloud|subscription",
            r"office|adobe|autocad|photoshop",
            r"gestionale|erp|crm|accounting software",
            r"microsoft|google workspace|slack|zoom"
        ]
    },
    "bancarie_assicurative": {
        "label": "Spese bancarie e assicurative",
        "deductibility": "100%",
        "type": "Deducibilità",
        "description": "Canoni bancari, interessi passivi e premi per polizze assicurative",
        "patterns": [
            r"banca|canone bancario|commissione|interesse passivo",
            r"assicurazione|polizza|premio assicurativo",
            r"imposta di bollo|spese bancarie"
        ]
    },
    "imposte_tasse": {
        "label": "Imposte e tasse",
        "deductibility": "Variabile",
        "type": "Deducibilità",
        "description": "L'IMU non è deducibile. L'IRAP è solo parzialmente deducibile",
        "patterns": [
            r"imu|irap|imposta|tassa",
            r"diritti camerali|diritto camerale",
            r"imposta di bollo|bollo"
        ]
    },
    "omaggi_clienti": {
        "label": "Omaggi a clienti",
        "deductibility": "Fino a 50 euro per unità, deducibili al 100%",
        "type": "Deducibilità",
        "description": "Omaggi di modico valore fino a 50 euro per singola unità",
        "patterns": [
            r"omaggio|regalo cliente|gift|presente"
        ]
    },
    "fiere_eventi": {
        "label": "Spese per fiere ed eventi",
        "deductibility": "100%",
        "type": "Deducibilità",
        "description": "Costi per partecipare a fiere, esposizioni ed eventi",
        "patterns": [
            r"fiera|expo|salone|mostra|esposizione",
            r"evento|convegno|conferenza|workshop|seminar"
        ]
    },
    "ammortamenti_immateriali": {
        "label": "Ammortamenti immateriali",
        "deductibility": "Secondo aliquota",
        "type": "Deducibilità",
        "description": "Costi relativi a beni immateriali, come brevetti, marchi, know how",
        "patterns": [
            r"brevetto|marchio|trademark|patent",
            r"know how|avviamento|goodwill"
        ]
    },
    "ricerca_sviluppo": {
        "label": "Spese di ricerca e sviluppo",
        "deductibility": "100% più eventuali crediti d'imposta",
        "type": "Deducibilità",
        "description": "Spese per attività di ricerca e sviluppo",
        "patterns": [
            r"ricerca|sviluppo|r&d|research|development",
            r"innovazione|prototipo|sperimentazione"
        ]
    },
    "altro": {
        "label": "Altro",
        "deductibility": "Da verificare",
        "type": "Deducibilità",
        "description": "Categoria generica per spese non categorizzate",
        "patterns": []
    }
}


def categorize_transaction(description: str, amount: float, counterpart_name: Optional[str] = None) -> Tuple[str, str]:
    """
    Categorizza una transazione basandosi sulla descrizione e sul nome della controparte.
    
    Args:
        description: Descrizione della transazione
        amount: Importo (sempre positivo per le uscite)
        counterpart_name: Nome della controparte (opzionale)
    
    Returns:
        Tuple (category_key, deductibility_percentage)
    """
    if not description:
        return "altro", "Da verificare"
    
    desc_lower = description.lower()
    counterpart_lower = (counterpart_name or "").lower()
    combined_text = f"{desc_lower} {counterpart_lower}"
    
    best_match = None
    best_score = 0
    
    # Scorri tutte le categorie (escluso "altro")
    for cat_key, cat_data in EXPENSE_CATEGORIES.items():
        if cat_key == "altro":
            continue
        
        score = 0
        patterns = cat_data.get("patterns", [])
        
        # Controlla pattern nella descrizione
        for pattern in patterns:
            if re.search(pattern, desc_lower, re.IGNORECASE):
                score += 10
            if re.search(pattern, combined_text, re.IGNORECASE):
                score += 5  # Bonus se trovato anche nel counterpart
        
        if score > best_score:
            best_score = score
            best_match = cat_key
    
    # Se non c'è match, usa "altro"
    if best_match is None or best_score == 0:
        return "altro", "Da verificare"
    
    deductibility = EXPENSE_CATEGORIES[best_match]["deductibility"]
    return best_match, deductibility


def get_category_info(category_key: str) -> Dict:
    """Restituisce le informazioni complete di una categoria."""
    return EXPENSE_CATEGORIES.get(category_key, EXPENSE_CATEGORIES["altro"])



