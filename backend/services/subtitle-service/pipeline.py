"""
Pipeline di elaborazione sottotitoli.

Steps:
1. Download video da Drive
2. Multi-estrazione audio (3 strategie: standard, enhanced, fallback)
3. Trascrizione con Whisper per tutte le varianti
4. Rating interno e selezione migliore
5. Segmentazione timing (max 2 righe, 42 caratteri per riga)
6. Export SRT / LRC / ASS / dump.json
7. Upload su Drive (WebApp/Clienti/{nome_azienda}/Sottotitoli/)
8. Aggiornamento DB (status=GENERATED, drive refs in SubtitleVersion v1)

Vincoli:
- Sottotitoli fedeli all'audio: nessun "miglioramento linguistico"
- Solo punteggiatura minima se prevista
- Job idempotente: se stesso input e stesso job completato, evita duplicazioni
"""

import os
import io
import json
import time
import uuid
import tempfile
import subprocess
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple

from models import (
    SubtitleSegment,
    TranscriptionResult,
    PipelineResult,
    PipelineStepResult,
    JobStatus,
    EventType,
)

# Timeout massimo per l'intera pipeline (30 minuti)
PIPELINE_TIMEOUT_SECONDS = 30 * 60

# Costanti per segmentazione
MAX_LINE_LENGTH = 42
MAX_LINES_PER_SEGMENT = 2

# Retry massimi
MAX_RETRY_COUNT = 3


# ========================
# AUDIO EXTRACTION
# ========================

def extract_audio_standard(video_path: str, output_path: str) -> bool:
    """Estrazione audio standard con ffmpeg (default codec, default bitrate)"""
    try:
        cmd = [
            "ffmpeg", "-y", "-i", video_path,
            "-vn", "-acodec", "pcm_s16le",
            "-ar", "16000", "-ac", "1",
            output_path
        ]
        result = subprocess.run(
            cmd, capture_output=True, text=True,
            timeout=300  # 5 minuti max
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, Exception) as e:
        print(f"❌ Estrazione audio standard fallita: {e}")
        return False


def extract_audio_enhanced(video_path: str, output_path: str) -> bool:
    """
    Estrazione audio con filtri leggeri per migliorare chiarezza voce.
    - highpass 80Hz: rimuove rumble basso senza tagliare voci maschili
    - lowpass 8000Hz: mantiene tutto lo spettro vocale
    - afftdn leggero: riduzione rumore minima per non distorcere
    """
    try:
        cmd = [
            "ffmpeg", "-y", "-i", video_path,
            "-vn", "-acodec", "pcm_s16le",
            "-ar", "16000", "-ac", "1",
            "-af", "highpass=f=80,lowpass=f=8000,afftdn=nf=-20",
            output_path
        ]
        result = subprocess.run(
            cmd, capture_output=True, text=True,
            timeout=300
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, Exception) as e:
        print(f"❌ Estrazione audio enhanced fallita: {e}")
        return False


def extract_audio_fallback(video_path: str, output_path: str) -> bool:
    """
    Estrazione audio fallback con normalizzazione loudness.
    Usa loudnorm per portare il volume a livelli standard (-16 LUFS)
    senza distorcere. Utile per video con volume troppo basso/alto.
    """
    try:
        cmd = [
            "ffmpeg", "-y", "-i", video_path,
            "-vn", "-acodec", "pcm_s16le",
            "-ar", "16000", "-ac", "1",
            "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
            output_path
        ]
        result = subprocess.run(
            cmd, capture_output=True, text=True,
            timeout=300
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, Exception) as e:
        print(f"❌ Estrazione audio fallback fallita: {e}")
        return False


def extract_multi_audio(video_path: str, temp_dir: str) -> Dict[str, Optional[str]]:
    """
    Esegue 3 strategie di estrazione audio.
    Ritorna dict {strategy_name: audio_path_or_None}.
    """
    strategies = {
        "standard": extract_audio_standard,
        "enhanced": extract_audio_enhanced,
        "fallback": extract_audio_fallback,
    }
    results = {}
    for name, func in strategies.items():
        output_path = os.path.join(temp_dir, f"audio_{name}.wav")
        success = func(video_path, output_path)
        if success and os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            results[name] = output_path
            print(f"✅ Audio {name}: {output_path} ({os.path.getsize(output_path)} bytes)")
        else:
            results[name] = None
            print(f"⚠️ Audio {name}: fallita")
    return results


# ========================
# TRASCRIZIONE
# ========================

def transcribe_with_whisper(audio_path: str, model_name: str = "large-v3") -> Optional[Dict[str, Any]]:
    """
    Trascrive audio con OpenAI Whisper (locale).
    Ritorna dict con segments e info.
    Fallback a whisper API se il modello locale non e' disponibile.
    """
    try:
        import whisper
        model = whisper.load_model(model_name)
        result = model.transcribe(
            audio_path,
            language="it",
            task="transcribe",
            verbose=False,
            word_timestamps=True,
            initial_prompt="Trascrizione fedele in italiano di un video social media. Mantieni punteggiatura e maiuscole corrette.",
        )
        return result
    except ImportError:
        print("⚠️ Whisper locale non installato, uso OpenAI Whisper API...")
        return transcribe_with_openai_api(audio_path)
    except Exception as e:
        print(f"❌ Errore trascrizione Whisper locale: {e}")
        return transcribe_with_openai_api(audio_path)


def transcribe_with_openai_api(audio_path: str) -> Optional[Dict[str, Any]]:
    """
    Trascrizione usando OpenAI Whisper API.
    Richiede OPENAI_API_KEY nell'ambiente.
    
    Ottimizzazioni per qualita' italiana:
    - language="it" forzato (evita confusione con spagnolo/portoghese)
    - prompt di contesto per guidare la trascrizione
    - temperature=0 per output deterministico e piu' accurato
    
    NOTA: Usa httpx direttamente per evitare conflitti Pydantic.
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("❌ OPENAI_API_KEY non configurata, trascrizione non possibile")
        return None

    try:
        import httpx

        with open(audio_path, "rb") as audio_file:
            file_size = os.path.getsize(audio_path)
            print(f"📤 Invio audio a OpenAI Whisper API ({file_size} bytes)...")

            file_name = os.path.basename(audio_path)

            # Prompt di contesto: guida Whisper a produrre trascrizioni italiane
            # piu' accurate. Il prompt NON viene inserito nell'output, ma condiziona
            # il vocabolario e lo stile del modello.
            prompt = (
                "Trascrizione fedele in italiano di un video per social media. "
                "Mantieni punteggiatura corretta, maiuscole a inizio frase, "
                "nomi propri e termini tecnici. Non tradurre parole straniere "
                "usate nel parlato. Usa virgole e punti dove il parlante fa pausa."
            )

            response = httpx.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {api_key}"},
                files={"file": (file_name, audio_file, "audio/wav")},
                data={
                    "model": "whisper-1",
                    "language": "it",
                    "response_format": "verbose_json",
                    "timestamp_granularities[]": "segment",
                    "prompt": prompt,
                    "temperature": "0",
                },
                timeout=300.0,
            )

        if response.status_code != 200:
            print(f"❌ OpenAI API errore HTTP {response.status_code}: {response.text[:200]}")
            return None

        data = response.json()

        result = {
            "text": data.get("text", ""),
            "segments": [],
            "language": data.get("language", "it"),
        }

        for seg in data.get("segments", []):
            result["segments"].append({
                "id": seg.get("id", 0),
                "start": seg.get("start", 0.0),
                "end": seg.get("end", 0.0),
                "text": seg.get("text", ""),
                "avg_logprob": seg.get("avg_logprob", -0.5),
                "no_speech_prob": seg.get("no_speech_prob", 0.0),
            })

        print(f"✅ Trascrizione OpenAI API completata: {len(result['segments'])} segmenti, lingua: {result['language']}")
        return result
    except httpx.TimeoutException:
        print("❌ Timeout trascrizione OpenAI API (>5 min)")
        return None
    except Exception as e:
        print(f"❌ Errore trascrizione OpenAI API: {e}")
        import traceback
        traceback.print_exc()
        return None


def parse_whisper_result(whisper_result: Dict[str, Any], strategy: str) -> TranscriptionResult:
    """Converte risultato Whisper in TranscriptionResult standardizzato."""
    segments = []
    total_confidence = 0.0
    word_count = 0
    duration = 0.0

    raw_segments = whisper_result.get("segments", [])
    for i, seg in enumerate(raw_segments):
        text = seg.get("text", "").strip()
        if not text:
            continue

        start = float(seg.get("start", 0))
        end = float(seg.get("end", 0))

        # avg_logprob e' negativo: -0.0 = perfetto, -1.0 = pessimo
        # Convertiamo in scala 0.0-1.0
        avg_logprob = seg.get("avg_logprob", -0.5)
        confidence = max(0.0, min(1.0, 1.0 + avg_logprob))

        segments.append(SubtitleSegment(
            index=i + 1,
            start_time=start,
            end_time=end,
            text=text,
            confidence=round(confidence, 3),
        ))

        total_confidence += confidence
        word_count += len(text.split())
        duration = max(duration, end)

    confidence_avg = total_confidence / len(segments) if segments else 0.0

    return TranscriptionResult(
        strategy=strategy,
        segments=segments,
        confidence_avg=round(confidence_avg, 3),
        word_count=word_count,
        duration_seconds=round(duration, 2),
    )


# ========================
# RATING
# ========================

def rate_transcription(result: TranscriptionResult) -> float:
    """
    Calcola un punteggio di qualita' per la trascrizione.
    Considera: confidence media, copertura parole, consistenza.
    Scala 0.0-1.0.
    """
    if not result.segments:
        return 0.0

    # Peso 1: Confidence media (0.0-1.0)
    confidence_score = result.confidence_avg

    # Peso 2: Copertura parole (stima: almeno 2 parole al secondo)
    expected_words = result.duration_seconds * 2.0 if result.duration_seconds > 0 else 1
    coverage_ratio = min(1.0, result.word_count / expected_words)

    # Peso 3: Consistenza segmenti (gap massimo tra segmenti)
    consistency_score = 1.0
    if len(result.segments) > 1:
        max_gap = 0.0
        for i in range(1, len(result.segments)):
            gap = result.segments[i].start_time - result.segments[i - 1].end_time
            max_gap = max(max_gap, gap)
        # Penalizza gap > 5 secondi
        if max_gap > 5.0:
            consistency_score = max(0.5, 1.0 - (max_gap - 5.0) / 30.0)

    # Peso composito
    score = (
        confidence_score * 0.5 +
        coverage_ratio * 0.3 +
        consistency_score * 0.2
    )

    return round(min(1.0, max(0.0, score)), 3)


# ========================
# SEGMENTAZIONE
# ========================

def segment_for_subtitles(segments: List[SubtitleSegment]) -> List[SubtitleSegment]:
    """
    Segmenta il testo rispettando:
    - Max 2 righe per segmento
    - Max 42 caratteri per riga
    - Timing preservato
    Nessun miglioramento linguistico: solo spezzatura righe.
    """
    result = []
    index = 1

    for seg in segments:
        text = seg.text.strip()
        if not text:
            continue

        lines = split_text_into_lines(text, MAX_LINE_LENGTH, MAX_LINES_PER_SEGMENT)

        # Se il testo e' troppo lungo per 2 righe, dividi in piu' segmenti
        # distribuendo il tempo proporzionalmente
        if len(lines) <= MAX_LINES_PER_SEGMENT:
            result.append(SubtitleSegment(
                index=index,
                start_time=seg.start_time,
                end_time=seg.end_time,
                text=text,
                confidence=seg.confidence,
                line1=lines[0] if len(lines) >= 1 else None,
                line2=lines[1] if len(lines) >= 2 else None,
            ))
            index += 1
        else:
            # Testo troppo lungo: suddividi in chunk di 2 righe
            total_chars = len(text)
            duration = seg.end_time - seg.start_time
            processed_chars = 0

            for chunk_start in range(0, len(lines), MAX_LINES_PER_SEGMENT):
                chunk_lines = lines[chunk_start:chunk_start + MAX_LINES_PER_SEGMENT]
                chunk_text = " ".join(chunk_lines)
                chunk_chars = len(chunk_text)

                # Distribuzione proporzionale del tempo
                time_ratio_start = processed_chars / total_chars if total_chars > 0 else 0
                time_ratio_end = (processed_chars + chunk_chars) / total_chars if total_chars > 0 else 1

                result.append(SubtitleSegment(
                    index=index,
                    start_time=round(seg.start_time + duration * time_ratio_start, 3),
                    end_time=round(seg.start_time + duration * time_ratio_end, 3),
                    text=chunk_text,
                    confidence=seg.confidence,
                    line1=chunk_lines[0] if len(chunk_lines) >= 1 else None,
                    line2=chunk_lines[1] if len(chunk_lines) >= 2 else None,
                ))
                index += 1
                processed_chars += chunk_chars

    return result


def split_text_into_lines(text: str, max_length: int, max_lines: int) -> List[str]:
    """Spezza un testo in righe di max_length caratteri."""
    words = text.split()
    lines = []
    current_line = ""

    for word in words:
        test_line = f"{current_line} {word}".strip() if current_line else word
        if len(test_line) <= max_length:
            current_line = test_line
        else:
            if current_line:
                lines.append(current_line)
            current_line = word

    if current_line:
        lines.append(current_line)

    return lines


# ========================
# EXPORT FORMATI
# ========================

def format_srt_time(seconds: float) -> str:
    """Converte secondi in formato SRT (HH:MM:SS,mmm)"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def format_lrc_time(seconds: float) -> str:
    """Converte secondi in formato LRC ([MM:SS.xx])"""
    minutes = int(seconds // 60)
    secs = seconds % 60
    return f"[{minutes:02d}:{secs:05.2f}]"


def format_ass_time(seconds: float) -> str:
    """Converte secondi in formato ASS (H:MM:SS.cc)"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    centisecs = int((seconds % 1) * 100)
    return f"{hours}:{minutes:02d}:{secs:02d}.{centisecs:02d}"


def export_srt(segments: List[SubtitleSegment]) -> str:
    """Genera contenuto SRT (SubRip)"""
    lines = []
    for seg in segments:
        lines.append(str(seg.index))
        lines.append(f"{format_srt_time(seg.start_time)} --> {format_srt_time(seg.end_time)}")
        # Usa line1/line2 se disponibili, altrimenti il testo pieno
        if seg.line1 and seg.line2:
            lines.append(seg.line1)
            lines.append(seg.line2)
        elif seg.line1:
            lines.append(seg.line1)
        else:
            lines.append(seg.text)
        lines.append("")  # Riga vuota tra segmenti
    return "\n".join(lines)


def export_lrc(segments: List[SubtitleSegment]) -> str:
    """Genera contenuto LRC (Lyrics)"""
    lines = [
        "[ti:Subtitles]",
        "[by:EvoMetrics Subtitle Service]",
        "",
    ]
    for seg in segments:
        text = seg.text
        lines.append(f"{format_lrc_time(seg.start_time)}{text}")
    return "\n".join(lines)


def export_ass(segments: List[SubtitleSegment], video_name: str = "Video") -> str:
    """
    Genera contenuto ASS (Advanced SubStation Alpha) compatibile CapCut.
    Stile ottimizzato per social media / video editing.
    """
    header = f"""[Script Info]
Title: {video_name}
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: None
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,56,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"""

    events = []
    for seg in segments:
        start = format_ass_time(seg.start_time)
        end = format_ass_time(seg.end_time)
        # In ASS, il newline e' rappresentato da \N
        if seg.line1 and seg.line2:
            text = f"{seg.line1}\\N{seg.line2}"
        elif seg.line1:
            text = seg.line1
        else:
            text = seg.text
        events.append(f"Dialogue: 0,{start},{end},Default,,0,0,0,,{text}")

    return header + "\n" + "\n".join(events) + "\n"


def export_dump(segments: List[SubtitleSegment], pipeline_info: Dict[str, Any]) -> str:
    """Genera dump JSON consultabile con tutti i dettagli"""
    dump = {
        "generated_at": datetime.utcnow().isoformat(),
        "generator": "EvoMetrics Subtitle Service v1",
        "pipeline_info": pipeline_info,
        "segments_count": len(segments),
        "segments": [
            {
                "index": seg.index,
                "start_time": seg.start_time,
                "end_time": seg.end_time,
                "duration": round(seg.end_time - seg.start_time, 3),
                "text": seg.text,
                "confidence": seg.confidence,
                "line1": seg.line1,
                "line2": seg.line2,
            }
            for seg in segments
        ],
    }
    return json.dumps(dump, indent=2, ensure_ascii=False)


# ========================
# DRIVE UPLOAD
# ========================

def upload_subtitle_files_to_drive(
    drive_service,
    drive_structure,
    cliente_name: str,
    video_name: str,
    version: int,
    srt_content: str,
    lrc_content: str,
    ass_content: str,
    dump_content: str,
) -> Dict[str, Optional[str]]:
    """
    Upload dei file sottotitoli su Drive nella struttura corretta.
    Path: WebApp/Clienti/{nome_azienda}/Sottotitoli/{video_name}_v{version}.{ext}

    Ritorna dict con drive_file_id per ogni formato.
    """
    result = {
        "drive_srt_file_id": None,
        "drive_lrc_file_id": None,
        "drive_ass_file_id": None,
        "drive_dump_file_id": None,
    }

    if not drive_service or not drive_service.is_ready():
        print("❌ Drive service non disponibile per upload sottotitoli")
        return result

    # Ottieni o crea cartella cliente
    cliente_folder_id = drive_structure.get_or_create_cliente_folder(cliente_name)
    if not cliente_folder_id:
        print(f"❌ Impossibile ottenere cartella cliente '{cliente_name}'")
        return result

    # Cerca o crea sottocartella "Sottotitoli"
    sottotitoli_folder_id = drive_service.search_folder("Sottotitoli", parent_id=cliente_folder_id)
    if not sottotitoli_folder_id:
        sottotitoli_folder_id = drive_service.create_folder("Sottotitoli", parent_id=cliente_folder_id)
        if sottotitoli_folder_id:
            print(f"✅ Cartella Sottotitoli creata per cliente '{cliente_name}'")
        else:
            print(f"❌ Impossibile creare cartella Sottotitoli per cliente '{cliente_name}'")
            return result

    # Sanitizza nome video per filename
    safe_name = "".join(c for c in video_name if c.isalnum() or c in (' ', '-', '_', '.')).strip()
    safe_name = safe_name.replace(' ', '_')
    # Rimuovi estensione se presente
    if '.' in safe_name:
        safe_name = safe_name.rsplit('.', 1)[0]

    version_suffix = f"v{version}" if version < 99 else "final"

    # Upload SRT
    files_to_upload = [
        (f"{safe_name}_{version_suffix}.srt", srt_content, "text/plain", "drive_srt_file_id"),
        (f"{safe_name}_{version_suffix}.lrc", lrc_content, "text/plain", "drive_lrc_file_id"),
        (f"{safe_name}_{version_suffix}.ass", ass_content, "text/plain", "drive_ass_file_id"),
        (f"{safe_name}_{version_suffix}_dump.json", dump_content, "application/json", "drive_dump_file_id"),
    ]

    for filename, content, mime_type, result_key in files_to_upload:
        try:
            uploaded = drive_service.upload_file(
                file_content=content.encode("utf-8"),
                file_name=filename,
                folder_id=sottotitoli_folder_id,
                mime_type=mime_type,
            )
            if uploaded:
                result[result_key] = uploaded.get("id")
                print(f"✅ Upload {filename}: {uploaded.get('id')}")
            else:
                print(f"⚠️ Upload {filename} fallito (nessun risultato)")
        except Exception as e:
            print(f"❌ Errore upload {filename}: {e}")

    return result


# ========================
# PIPELINE PRINCIPALE
# ========================

async def process_subtitle_job(
    job_id: str,
    drive_file_id: str,
    cliente_name: str,
    drive_service_instance,
    drive_structure_instance,
    update_job_callback,
    add_event_callback,
    save_version_callback,
):
    """
    Pipeline principale per elaborazione sottotitoli.

    Args:
        job_id: ID del job
        drive_file_id: ID del file video su Drive
        cliente_name: Nome del cliente (per struttura Drive)
        drive_service_instance: Istanza DriveService
        drive_structure_instance: Istanza DriveStructureManager
        update_job_callback: async fn(job_id, **fields) per aggiornare il job nel DB
        add_event_callback: async fn(job_id, event_type, user_id, details) per audit log
        save_version_callback: async fn(job_id, version, segments, drive_refs, user_id) per salvare versione

    Returns:
        PipelineResult
    """
    import asyncio

    steps = []
    pipeline_start = time.time()

    try:
        # =======================================
        # STEP 1: Download video da Drive
        # =======================================
        await update_job_callback(job_id, status="processing", progress=5)
        await add_event_callback(job_id, EventType.PROCESSING_STARTED, None, {"step": "download"})

        step_start = time.time()
        video_stream = None
        video_name = "video"

        try:
            stream, content_type, filename = drive_service_instance.download_file_stream(drive_file_id)
            video_stream = stream
            video_name = filename or "video"
            steps.append(PipelineStepResult(
                step="download_video",
                success=True,
                duration_ms=int((time.time() - step_start) * 1000),
                details={"filename": video_name, "content_type": content_type},
            ))
        except Exception as e:
            steps.append(PipelineStepResult(
                step="download_video", success=False, error=str(e),
                duration_ms=int((time.time() - step_start) * 1000),
            ))
            raise RuntimeError(f"Download video fallito: {e}")

        await update_job_callback(job_id, progress=15)

        # =======================================
        # STEP 2: Multi-estrazione audio
        # =======================================
        step_start = time.time()
        await add_event_callback(job_id, EventType.AUDIO_EXTRACTED, None, {"step": "audio_extraction"})

        with tempfile.TemporaryDirectory(prefix="subtitle_") as temp_dir:
            # Salva video in file temporaneo
            video_path = os.path.join(temp_dir, video_name)
            with open(video_path, "wb") as f:
                f.write(video_stream.read())

            # Esecuzione in thread pool (ffmpeg e' bloccante)
            loop = asyncio.get_event_loop()
            audio_paths = await loop.run_in_executor(
                None, extract_multi_audio, video_path, temp_dir
            )

            successful_extractions = {k: v for k, v in audio_paths.items() if v is not None}

            if not successful_extractions:
                steps.append(PipelineStepResult(
                    step="audio_extraction", success=False, error="Tutte le estrazioni audio fallite",
                    duration_ms=int((time.time() - step_start) * 1000),
                ))
                raise RuntimeError("Nessuna estrazione audio riuscita")

            steps.append(PipelineStepResult(
                step="audio_extraction",
                success=True,
                duration_ms=int((time.time() - step_start) * 1000),
                details={
                    "strategies_attempted": list(audio_paths.keys()),
                    "strategies_succeeded": list(successful_extractions.keys()),
                },
            ))

            await update_job_callback(job_id, progress=30)

            # =======================================
            # STEP 3: Trascrizione per tutte le varianti
            # =======================================
            step_start = time.time()
            transcription_results: List[TranscriptionResult] = []

            for strategy, audio_path in successful_extractions.items():
                try:
                    whisper_result = await loop.run_in_executor(
                        None, transcribe_with_whisper, audio_path
                    )
                    if whisper_result:
                        tr = parse_whisper_result(whisper_result, strategy)
                        transcription_results.append(tr)
                        print(f"✅ Trascrizione {strategy}: {tr.word_count} parole, confidence {tr.confidence_avg}")
                except Exception as e:
                    print(f"❌ Errore trascrizione {strategy}: {e}")

            if not transcription_results:
                steps.append(PipelineStepResult(
                    step="transcription", success=False, error="Tutte le trascrizioni fallite",
                    duration_ms=int((time.time() - step_start) * 1000),
                ))
                raise RuntimeError("Nessuna trascrizione riuscita")

            await add_event_callback(job_id, EventType.TRANSCRIPTION_COMPLETED, None, {
                "strategies_transcribed": [tr.strategy for tr in transcription_results],
                "word_counts": {tr.strategy: tr.word_count for tr in transcription_results},
            })

            steps.append(PipelineStepResult(
                step="transcription",
                success=True,
                duration_ms=int((time.time() - step_start) * 1000),
                details={"transcription_count": len(transcription_results)},
            ))

            await update_job_callback(job_id, progress=55)

            # =======================================
            # STEP 4: Rating e selezione migliore
            # =======================================
            step_start = time.time()

            for tr in transcription_results:
                tr.score = rate_transcription(tr)
                print(f"📊 Rating {tr.strategy}: {tr.score}")

            # Ordina per score decrescente
            transcription_results.sort(key=lambda x: x.score, reverse=True)
            best = transcription_results[0]

            is_uncertain = best.confidence_avg < 0.8

            await add_event_callback(job_id, EventType.RATING_COMPLETED, None, {
                "best_strategy": best.strategy,
                "best_score": best.score,
                "is_uncertain": is_uncertain,
                "ratings": {tr.strategy: tr.score for tr in transcription_results},
            })

            steps.append(PipelineStepResult(
                step="rating",
                success=True,
                duration_ms=int((time.time() - step_start) * 1000),
                details={"best_strategy": best.strategy, "best_score": best.score},
            ))

            await update_job_callback(job_id, progress=65)

            # =======================================
            # STEP 5: Segmentazione timing
            # =======================================
            step_start = time.time()

            segmented = segment_for_subtitles(best.segments)

            await add_event_callback(job_id, EventType.SEGMENTS_GENERATED, None, {
                "original_segments": len(best.segments),
                "segmented_count": len(segmented),
            })

            steps.append(PipelineStepResult(
                step="segmentation",
                success=True,
                duration_ms=int((time.time() - step_start) * 1000),
                details={"segments_count": len(segmented)},
            ))

            await update_job_callback(job_id, progress=75)

            # =======================================
            # STEP 6: Export SRT / LRC / ASS / dump
            # =======================================
            step_start = time.time()

            srt_content = export_srt(segmented)
            lrc_content = export_lrc(segmented)
            ass_content = export_ass(segmented, video_name=video_name)

            pipeline_info = {
                "best_strategy": best.strategy,
                "best_score": best.score,
                "is_uncertain": is_uncertain,
                "strategies_tried": [tr.strategy for tr in transcription_results],
                "ratings": {tr.strategy: tr.score for tr in transcription_results},
                "total_duration_seconds": best.duration_seconds,
                "total_words": best.word_count,
            }
            dump_content = export_dump(segmented, pipeline_info)

            await add_event_callback(job_id, EventType.EXPORT_COMPLETED, None, {
                "formats": ["srt", "lrc", "ass", "dump"],
            })

            steps.append(PipelineStepResult(
                step="export",
                success=True,
                duration_ms=int((time.time() - step_start) * 1000),
            ))

            await update_job_callback(job_id, progress=85)

            # =======================================
            # STEP 7: Skip Drive Upload (export solo via download diretto)
            # I sottotitoli vengono salvati nel DB e scaricati on-demand.
            # Nessuna cartella "Sottotitoli" creata nel Drive del cliente.
            # =======================================
            drive_refs = {
                "drive_srt_file_id": None,
                "drive_lrc_file_id": None,
                "drive_ass_file_id": None,
                "drive_dump_file_id": None,
            }

            steps.append(PipelineStepResult(
                step="drive_upload",
                success=True,
                duration_ms=0,
                details={"mode": "db_only", "note": "Export disponibile via download diretto"},
            ))

            await update_job_callback(job_id, progress=95)

            # =======================================
            # STEP 8: Salva versione v1 nel DB
            # =======================================
            segments_json = [seg.model_dump() for seg in segmented]

            await save_version_callback(
                job_id=job_id,
                version=1,
                segments=segments_json,
                drive_refs=drive_refs,
                user_id=None,  # AI-generated
                notes=f"Generato automaticamente. Strategia: {best.strategy}, Score: {best.score}",
            )

            # =======================================
            # STEP 9: Aggiorna job a GENERATED
            # =======================================
            metadata_update = {
                "pipeline_duration_ms": int((time.time() - pipeline_start) * 1000),
                "best_strategy": best.strategy,
                "best_score": best.score,
                "is_uncertain": is_uncertain,
                "segments_count": len(segmented),
            }

            await update_job_callback(
                job_id,
                status="generated",
                progress=100,
                metadata=json.dumps(metadata_update),
            )
            await add_event_callback(job_id, EventType.JOB_GENERATED, None, metadata_update)

            return PipelineResult(
                job_id=job_id,
                best_strategy=best.strategy,
                best_score=best.score,
                is_uncertain=is_uncertain,
                segments=segmented,
                transcription_results=transcription_results,
                steps=steps,
                srt_content=srt_content,
                lrc_content=lrc_content,
                ass_content=ass_content,
                dump_content=dump_content,
            )

    except Exception as e:
        # Gestione errore globale pipeline
        print(f"❌ Pipeline fallita per job {job_id}: {e}")

        error_msg = str(e)[:500]  # Limita lunghezza errore
        await update_job_callback(
            job_id,
            status="error",
            error_message=error_msg,
        )
        await add_event_callback(job_id, EventType.ERROR_OCCURRED, None, {
            "error": error_msg,
            "step": steps[-1].step if steps else "unknown",
            "pipeline_duration_ms": int((time.time() - pipeline_start) * 1000),
        })

        raise
