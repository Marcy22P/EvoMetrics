import React, { useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Lead, PipelineStage } from '../../services/salesApi';
import s from './pipeline.module.css';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 70) return '#1a7f37';
  if (score >= 40) return '#a85f00';
  return '#c0392b';
}

function initials(lead: Lead): string {
  const first = lead.first_name?.[0] || '';
  const last = lead.last_name?.[0] || '';
  if (first || last) return (first + last).toUpperCase();
  return lead.email[0].toUpperCase();
}

function formatFollowUp(iso?: string | null): { text: string; urgent: boolean } | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / 86400000);
    if (diffDays < 0) return { text: `${Math.abs(diffDays)}g fa`, urgent: true };
    if (diffDays === 0) return { text: 'Oggi', urgent: true };
    if (diffDays === 1) return { text: 'Domani', urgent: false };
    return { text: `fra ${diffDays}g`, urgent: false };
  } catch {
    return null;
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface LeadCardProps {
  lead: Lead;
  stages: PipelineStage[];
  draggingId: string | null;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onDragEnd: () => void;
  onMoveStage: (lead: Lead, newStage: string) => void;
  onMarkLost: (lead: Lead) => void;
  canEdit: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

const SWIPE_THRESHOLD = 70;
const SWIPE_MAX = 120;

const LeadCard: React.FC<LeadCardProps> = ({
  lead,
  stages,
  draggingId,
  onDragStart,
  onDragEnd,
  onMoveStage,
  onMarkLost,
  canEdit,
}) => {
  const navigate = useNavigate();
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const [swipeX, setSwipeX] = useState(0);
  const isDragging = draggingId === lead.id;

  // ── Swipe handlers ──────────────────────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.touches[0].clientY - touchStartY.current);
    if (dy > 20) return; // vertical scroll, ignore
    const clamped = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, dx));
    setSwipeX(clamped);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!canEdit) { setSwipeX(0); return; }
    if (swipeX > SWIPE_THRESHOLD) {
      // Advance stage
      const idx = stages.findIndex(s => s.key === lead.stage);
      const next = stages[idx + 1];
      if (next) onMoveStage(lead, next.key);
    } else if (swipeX < -SWIPE_THRESHOLD) {
      onMarkLost(lead);
    }
    setSwipeX(0);
  }, [swipeX, lead, stages, canEdit, onMoveStage, onMarkLost]);

  // ── Click ───────────────────────────────────────────────────────────────────
  const handleClick = () => {
    if (Math.abs(swipeX) > 5) return; // was a swipe
    if (draggingId) return;
    navigate(`/pipeline/lead/${lead.id}`);
  };

  // ── Computed ────────────────────────────────────────────────────────────────
  const score = lead.lead_score ?? 0;
  const followUp = formatFollowUp(lead.follow_up_date || lead.appointment_date);
  const assigneeUser = lead.assigned_to_user;
  const tag = lead.lead_tag;

  const cardStyle: React.CSSProperties = {
    transform: swipeX ? `translateX(${swipeX}px)` : undefined,
    transition: swipeX === 0 ? 'transform 200ms ease' : undefined,
  };

  const swipeDirection = swipeX > SWIPE_THRESHOLD ? 'right' : swipeX < -SWIPE_THRESHOLD ? 'left' : null;

  return (
    <div
      className={`${s.card}${isDragging ? ' ' + s.dragging : ''}${
        swipeDirection === 'right' ? ' ' + s.swipeRight :
        swipeDirection === 'left'  ? ' ' + s.swipeLeft  : ''
      }`}
      style={cardStyle}
      draggable={canEdit}
      onDragStart={canEdit ? e => onDragStart(e, lead.id) : undefined}
      onDragEnd={canEdit ? onDragEnd : undefined}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
    >
      {/* Swipe hints */}
      <span className={`${s.cardSwipeHint} ${s.right}${swipeDirection === 'right' ? ' ' + s.show : ''}`}>
        AVANZA →
      </span>
      <span className={`${s.cardSwipeHint} ${s.left}${swipeDirection === 'left' ? ' ' + s.show : ''}`}>
        ← PERSO
      </span>

      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={s.cardTitle}>
            {lead.azienda || 'Azienda non specificata'}
          </div>
          <div className={s.cardSub}>
            {[lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email}
          </div>
        </div>
        {tag && (
          <div
            className={s.cardTagDot}
            style={{ background: tag.hex_color || '#8c9196', marginTop: 4, flexShrink: 0 }}
            title={tag.label}
          />
        )}
      </div>

      {/* Meta row */}
      <div className={s.cardMeta}>
        {lead.source_channel && (
          <span className={s.cardSourceBadge}>
            {lead.source_channel.replace(' Ads', '')}
          </span>
        )}
        {lead.deal_value ? (
          <span className={s.cardSourceBadge} style={{ color: '#1a7f37', borderColor: '#c6e6cd', background: '#dff3e2' }}>
            €{Math.round(lead.deal_value / 100).toLocaleString('it-IT')}
          </span>
        ) : null}
        {assigneeUser && (
          <div className={s.cardAvatar} title={[assigneeUser.nome, assigneeUser.cognome].filter(Boolean).join(' ')}>
            {initials({ ...lead, first_name: assigneeUser.nome, last_name: assigneeUser.cognome })}
          </div>
        )}
      </div>

      {/* Footer: score bar + follow-up */}
      <div className={s.cardFooter}>
        <div className={s.cardScoreBar}>
          <div
            className={s.cardScoreFill}
            style={{ width: `${score}%`, background: scoreColor(score) }}
          />
        </div>
        {followUp && (
          <span className={`${s.cardFollowUp}${followUp.urgent ? ' ' + s.urgent : ''}`}>
            {followUp.text}
          </span>
        )}
      </div>
    </div>
  );
};

export default LeadCard;
