import { useState, useRef, useCallback } from 'react';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { useAppFeedback } from '../contexts/FeedbackContext';

interface Note {
  id: string;
  text: string;
  color: string;
  createdAt: string;
}

const COLORS = [
  { bg: 'bg-yellow-100 dark:bg-yellow-500/20', border: 'border-yellow-300 dark:border-yellow-500/50', label: '노랑', dot: 'bg-yellow-400' },
  { bg: 'bg-pink-100 dark:bg-pink-500/20', border: 'border-pink-300 dark:border-pink-500/50', label: '분홍', dot: 'bg-pink-400' },
  { bg: 'bg-blue-100 dark:bg-blue-500/20', border: 'border-blue-300 dark:border-blue-500/50', label: '파랑', dot: 'bg-blue-400' },
  { bg: 'bg-green-100 dark:bg-green-500/20', border: 'border-green-300 dark:border-green-500/50', label: '초록', dot: 'bg-green-400' },
  { bg: 'bg-purple-100 dark:bg-purple-500/20', border: 'border-purple-300 dark:border-purple-500/50', label: '보라', dot: 'bg-purple-400' },
];

interface StickyNotesProps {
  embedMode?: boolean;
}

export default function StickyNotes({ embedMode = false }: StickyNotesProps) {
  const [notes, setNotes] = useLocalStorageState<Note[]>('119helper-notes', []);
  const [selectedColor, setSelectedColor] = useState(0);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const { showUndo } = useAppFeedback();

  // 드래그 앤 드롭 상태
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);

  const addNote = () => {
    const newNote: Note = {
      id: Date.now().toString(),
      text: '',
      color: COLORS[selectedColor].bg,
      createdAt: new Date().toLocaleString('ko-KR'),
    };
    setNotes([newNote, ...notes]);
    setSelectedNoteId(newNote.id);
  };

  const updateNote = (id: string, text: string) => {
    setNotes(notes.map(n => n.id === id ? { ...n, text } : n));
  };

  const deleteNote = (id: string) => {
    const index = notes.findIndex(note => note.id === id);
    const removed = notes[index];
    if (!removed) return;

    const wasSelected = selectedNoteId === id;
    setNotes(current => current.filter(note => note.id !== id));
    if (selectedNoteId === id) setSelectedNoteId(null);
    showUndo({
      message: '메모를 삭제했습니다.',
      undo: () => {
        setNotes(current => {
          if (current.some(note => note.id === removed.id)) return current;
          const restored = [...current];
          restored.splice(Math.min(index, restored.length), 0, removed);
          return restored;
        });
        if (wasSelected) setSelectedNoteId(removed.id);
      },
    });
  };

  // 색상 클릭 — 선택된 메모가 있으면 색 변경, 없으면 새 메모용 색 선택
  const handleColorClick = (colorIndex: number) => {
    setSelectedColor(colorIndex);
    if (selectedNoteId) {
      setNotes(notes.map(n =>
        n.id === selectedNoteId ? { ...n, color: COLORS[colorIndex].bg } : n
      ));
    }
  };

  const getColorClasses = (bgClass: string) => {
    const color = COLORS.find(c => c.bg === bgClass);
    return color || COLORS[0];
  };

  // 메모 선택/해제
  const handleNoteClick = useCallback((id: string) => {
    setSelectedNoteId(prev => prev === id ? null : id);
  }, []);

  // === 드래그 앤 드롭 핸들러 ===
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    setDragId(id);
    dragNode.current = e.currentTarget as HTMLDivElement;
    e.dataTransfer.effectAllowed = 'move';
    // 약간의 딜레이로 드래그 중 원본 투명하게
    setTimeout(() => {
      if (dragNode.current) dragNode.current.style.opacity = '0.4';
    }, 0);
  };

  const handleDragEnd = () => {
    if (dragNode.current) dragNode.current.style.opacity = '1';
    setDragId(null);
    setDragOverId(null);
    dragNode.current = null;
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragId && id !== dragId) {
      setDragOverId(id);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;

    const newNotes = [...notes];
    const dragIdx = newNotes.findIndex(n => n.id === dragId);
    const targetIdx = newNotes.findIndex(n => n.id === targetId);
    if (dragIdx === -1 || targetIdx === -1) return;

    // 드래그한 아이템을 빼서 타겟 위치에 삽입
    const [dragged] = newNotes.splice(dragIdx, 1);
    newNotes.splice(targetIdx, 0, dragged);
    setNotes(newNotes);
    setDragId(null);
    setDragOverId(null);
  };

  const [showMemo, setShowMemo] = useState(true);

  // 선택된 메모의 색상 인덱스
  const selectedNote = notes.find(n => n.id === selectedNoteId);
  const selectedNoteColorIdx = selectedNote
    ? COLORS.findIndex(c => c.bg === selectedNote.color)
    : -1;

  const renderControls = () => (
    <div className="flex items-center gap-3">
      <div className="flex gap-1.5 hidden sm:flex">
        {COLORS.map((c, i) => {
          const isActive = selectedNoteId ? selectedNoteColorIdx === i : selectedColor === i;
          return (
            <button
              key={c.label}
              type="button"
              aria-label={selectedNoteId ? `메모 색상을 ${c.label}으로 변경` : `${c.label} 색 메모 만들기`}
              aria-pressed={isActive}
              data-compact-control
              onClick={() => handleColorClick(i)}
              title={selectedNoteId ? `메모 색상을 ${c.label}으로 변경` : `${c.label} 색 메모 만들기`}
              className={`w-7 h-7 rounded-full ${c.dot} border-2 transition-all duration-200 ${
                isActive
                  ? 'border-white scale-125 ring-2 ring-primary/50'
                  : 'border-transparent opacity-60 hover:opacity-100 hover:scale-110'
              }`}
            />
          );
        })}
      </div>
      <button
        type="button"
        onClick={addNote}
        className="ui-button ui-button--primary"
      >
        <span className="material-symbols-outlined text-base md:text-lg">add</span>
        새 메모
      </button>
    </div>
  );

  const renderContent = () => {
    if (notes.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant">
          <span className="material-symbols-outlined text-6xl opacity-30">sticky_note_2</span>
          <p className="mt-4 text-lg font-medium">메모가 없습니다</p>
          <p className="text-sm opacity-60">위의 "새 메모" 버튼을 눌러 메모를 추가하세요</p>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {notes.map(note => {
          const colorClass = getColorClasses(note.color);
          const isSelected = selectedNoteId === note.id;
          const isDragOver = dragOverId === note.id && dragId !== note.id;

          return (
            <div
              key={note.id}
              draggable
              onDragStart={(e) => handleDragStart(e, note.id)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, note.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, note.id)}
              onClick={() => handleNoteClick(note.id)}
              className={`
                ${colorClass.bg} ${colorClass.border} border rounded-xl p-4 flex flex-col gap-3
                group backdrop-blur-sm transition-all duration-200 cursor-grab active:cursor-grabbing
                ${isSelected ? 'ring-2 ring-primary shadow-lg shadow-primary/10 scale-[1.02]' : 'hover:scale-[1.01]'}
                ${isDragOver ? 'ring-2 ring-primary/60 scale-105 border-dashed' : ''}
              `}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-black/45 dark:text-white/55 cursor-grab active:cursor-grabbing">drag_indicator</span>
                  <span className="text-[10px] text-black/60 dark:text-white/70 font-medium">{note.createdAt}</span>
                </div>
                <div className="flex items-center gap-1">
                  {isSelected && (
                    <span className="text-[10px] text-primary font-bold px-1.5 py-0.5 bg-primary/10 rounded-full">선택됨</span>
                  )}
                  <button
                    type="button"
                    aria-label="메모 삭제"
                    onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-on-surface-variant opacity-100 transition-all hover:bg-error/10 hover:text-error sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus:opacity-100"
                  >
                    <span className="material-symbols-outlined text-lg">close</span>
                  </button>
                </div>
              </div>
              <textarea
                aria-label="메모 내용"
                value={note.text}
                onChange={(e) => updateNote(note.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onFocus={() => handleNoteClick(note.id)}
                placeholder="메모를 입력하세요..."
                className="bg-transparent border-none resize-none flex-1 min-h-[120px] text-sm font-medium text-black/90 dark:text-white placeholder:text-black/45 dark:placeholder:text-white/55 focus:outline-none focus:ring-0"
              />
            </div>
          );
        })}
      </div>
    );
  };

  if (embedMode) {
    return (
      <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden shadow-sm transition-all mb-6">
        <div className="flex items-center justify-between border-b border-outline-variant/10 p-3 md:p-4">
          <button 
            type="button"
            aria-expanded={showMemo}
            onClick={() => setShowMemo(!showMemo)}
            className="ui-section-toggle"
          >
            <span className="material-symbols-outlined text-pink-700 dark:text-pink-300 text-xl">sticky_note_2</span>
            <h3 className="text-lg font-extrabold text-on-surface font-headline hidden sm:block">메모장</h3>
            <span className={`material-symbols-outlined text-on-surface-variant transition-transform duration-300 ${showMemo ? 'rotate-180' : ''}`}>
              expand_more
            </span>
          </button>
          
          {showMemo && renderControls()}
        </div>
        
        {showMemo && (
          <div className="p-3 md:p-4 animate-slide-in-top bg-surface/30">
            {renderContent()}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center flex-wrap gap-3 justify-between">
        <div>
          <h2 className="ui-section-title">
            <span className="material-symbols-outlined">note_stack</span>
            메모장
          </h2>
          <p className="text-sm text-on-surface-variant mt-1">
            스티커 메모 — 브라우저에 자동 저장됩니다
            {selectedNoteId && <span className="ml-2 text-primary font-bold">• 색상을 클릭하면 선택된 메모의 색이 바뀝니다</span>}
          </p>
        </div>
        {renderControls()}
      </div>

      {renderContent()}
    </div>
  );
}
