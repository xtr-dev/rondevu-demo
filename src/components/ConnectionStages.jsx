import React from 'react';

const STAGES = [
  { id: 'signaling', emoji: '📡', text: 'Signaling' },
  { id: 'checking', emoji: '⛸️', text: 'Ice skating' },
  { id: 'connected', emoji: '🔗', text: 'Data channel' },
];

export default function ConnectionStages({ currentStage }) {
  const stageIndex = STAGES.findIndex(s => s.id === currentStage);

  return (
    <div className="connection-stages">
      {STAGES.map((stage, i) => {
        const isDone = i < stageIndex || (i === stageIndex && stage.id === 'connected');
        const isActive = i === stageIndex;

        return (
          <div key={stage.id} className={`stage ${isDone ? 'done' : ''} ${isActive && !isDone ? 'active' : ''}`}>
            <span className="stage-emoji">{stage.emoji}</span>
            <span className="stage-text">{stage.text}</span>
          </div>
        );
      })}
    </div>
  );
}

export function getStageText(stage) {
  switch (stage) {
    case 'signaling': return 'Signaling...';
    case 'checking': return 'Ice skating...';
    case 'connected': return 'Connecting data channel...';
    default: return 'Starting...';
  }
}
