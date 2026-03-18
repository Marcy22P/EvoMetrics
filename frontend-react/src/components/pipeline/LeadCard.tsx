import React, { useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Lead, PipelineStage } from '../../services/salesApi';
import s from './pipeline.module.css';

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

  // ── Swipe ──────────────────────────────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.touches[0].clientY - touchStartY.current);
    if (dy > 20) return;
    const clamped = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, dx));
    setSwipeX(clamped);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!canEdit) { setSwipeX(0); return; }
    if (swipeX > SWIPE_THRESHOLD) {
      const idx = stages.findIndex(st => st.key === lead.stage);
      const next = stages[idx + 1];
      if (next) onMoveStage(lead, next.key);
    } else if (swipeX < -SWIPE_THRESHOLD) {
      onMarkLost(lead);
    }
    setSwipeX(0);
  }, [swipeX, lead, stages, canEdit, onMoveStage, onMarkLost]);

  // ── Click ─────────────────────────────────────────────────────────────────
  const handleClick = () => {
    if (Math.abs(swipeX) > 5) return;
    if (draggingId) return;
    navigate(`/pipeline/lead/${lead.id}`);
  };

  // ── Computed ──────────────────────────────────────────────────────────────
  const nome = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email;

  const dealVal = lead.deal_value
    ? `€${Math.round(lead.deal_value / 100).toLocaleString('it-IT')}`
    : null;

  const dueDate = lead.appointment_date || lead.follow_up_date;
  const dueDateStr = dueDate
    ? new Date(dueDate).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  const assigneeUser = lead.assigned_to_user;

  const statusBadge = () => {
    const score = lead.lead_score ?? 0;
    const tag = lead.lead_tag?.label;
    if (tag) return { label: tag, color: '#d97706', bg: '#fef3c7' };
    if (score >= 70) return { label: 'On Track',        color: '#16a34a', bg: '#dcfce7' };
    if (score >= 40) return { label: 'Needs Attention', color: '#d97706', bg: '#fef3c7' };
    return           { label: 'At Risk',          color: '#dc2626', bg: '#fee2e2' };
  };

  const badge = statusBadge();

  return (
    <div
      className={`${s.card}${isDragging ? ' ' + s.dragging : ''}`}
      style={{ transform: swipeX ? `translateX(${swipeX}px)` : undefined, transition: swipeX === 0 ? 'transform 200ms ease' : undefined }}
      draggable={canEdit}
      onDragStart={canEdit ? e => onDragStart(e, lead.id) : undefined}
      onDragEnd={canEdit ? onDragEnd : undefined}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
    >
      {/* Deal name */}
      <div className={s.cardTitle}>{lead.azienda || nome}</div>

      {/* Contact sub-line */}
      {lead.azienda && (
        <div className={s.cardSub}>{nome}</div>
      )}

      {/* Value + date row */}
      {(dealVal || dueDateStr) && (
        <div className={s.cardValueRow}>
          {dealVal && <span className={s.cardValue}>{dealVal}</span>}
          {dueDateStr && <span className={s.cardDate}>· {dueDateStr}</span>}
        </div>
      )}

      {/* Footer: avatar + status badge */}
      <div className={s.cardFooter}>
        {assigneeUser ? (
          <div
            className={s.cardAvatar}
            title={[assigneeUser.nome, assigneeUser.cognome].filter(Boolean).join(' ')}
          >
            {([assigneeUser.nome?.[0], assigneeUser.cognome?.[0]].filter(Boolean).join('') || '?').toUpperCase()}
          </div>
        ) : <div />}

        <span className={s.cardBadge} style={{ color: badge.color, background: badge.bg }}>
          {badge.label}
        </span>
      </div>
    </div>
  );
};

export default LeadCard;
