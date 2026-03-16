import React, { useState } from 'react';
import type { Lead, PipelineStage } from '../../services/salesApi';
import LeadCard from './LeadCard';
import s from './pipeline.module.css';

// ─── Props ────────────────────────────────────────────────────────────────────

interface PipelineTimelineProps {
  leads: Lead[];
  stages: PipelineStage[];
  draggingId: string | null;
  canEdit: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>, stageKey: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, stageKey: string) => void;
  onMoveStage: (lead: Lead, newStage: string) => void;
  onLeadsUpdated?: (updatedLeads: Lead[]) => void;
  dragOverStage: string | null;
}

// ─── Lost confirmation snackbar ───────────────────────────────────────────────

interface LostConfirmProps {
  lead: Lead;
  onConfirm: () => void;
  onCancel: () => void;
}

const LostConfirm: React.FC<LostConfirmProps> = ({ lead, onConfirm, onCancel }) => (
  <div className={s.swipeConfirm}>
    <span>
      Segnare <strong>{lead.azienda || lead.email}</strong> come perso?
    </span>
    <button className={`${s.swipeConfirmBtn} ${s.yes}`} onClick={onConfirm}>
      Conferma
    </button>
    <button className={`${s.swipeConfirmBtn} ${s.no}`} onClick={onCancel}>
      Annulla
    </button>
  </div>
);

// ─── Component ────────────────────────────────────────────────────────────────

const PipelineTimeline: React.FC<PipelineTimelineProps> = ({
  leads,
  stages,
  draggingId,
  canEdit,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onMoveStage,
  dragOverStage,
}) => {
  const [pendingLost, setPendingLost] = useState<Lead | null>(null);

  const handleMarkLost = (lead: Lead) => {
    setPendingLost(lead);
  };

  const confirmLost = () => {
    if (!pendingLost) return;
    onMoveStage(pendingLost, 'trattativa_persa');
    setPendingLost(null);
  };

  return (
    <>
      <div className={s.timeline}>
        {stages.map(stage => {
          const stageLeads = leads.filter(l => l.stage === stage.key);
          const totalValue = stageLeads.reduce((sum, l) => {
            const v = (l.deal_value ?? 0);
            return sum + (v > 10000 ? v / 100 : v);
          }, 0);
          const isDragOver = dragOverStage === stage.key;

          return (
            <div
              key={stage.key}
              className={`${s.stageCol}${isDragOver ? ' ' + s.dragOver : ''}`}
              onDragOver={e => onDragOver(e, stage.key)}
              onDragLeave={onDragLeave}
              onDrop={e => onDrop(e, stage.key)}
            >
              {/* Stage header */}
              <div className={s.stageHead}>
                <div className={s.stageHeadRow}>
                  <span className={s.stageHeadLabel}>{stage.label}</span>
                  <span className={s.stageHeadCount}>{stageLeads.length}</span>
                </div>
                {totalValue > 0 && (
                  <div className={s.stageHeadValue}>
                    €{totalValue.toLocaleString('it-IT', { maximumFractionDigits: 0 })}
                  </div>
                )}
              </div>

              {/* Cards */}
              <div className={s.stageCards}>
                {stageLeads.length === 0 ? (
                  <div className={s.empty} style={{ padding: '20px 8px' }}>
                    Nessun lead
                  </div>
                ) : (
                  stageLeads.map(lead => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      stages={stages}
                      draggingId={draggingId}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      onMoveStage={onMoveStage}
                      onMarkLost={handleMarkLost}
                      canEdit={canEdit}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Lost confirmation snackbar */}
      {pendingLost && (
        <LostConfirm
          lead={pendingLost}
          onConfirm={confirmLost}
          onCancel={() => setPendingLost(null)}
        />
      )}
    </>
  );
};

export default PipelineTimeline;
