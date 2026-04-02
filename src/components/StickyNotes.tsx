import { useState, useEffect } from 'react';

interface Note {
  id: string;
  text: string;
  color: string;
  createdAt: string;
}

const COLORS = [
  { bg: 'bg-yellow-400/20', border: 'border-yellow-400/30', label: '노랑' },
  { bg: 'bg-pink-400/20', border: 'border-pink-400/30', label: '분홍' },
  { bg: 'bg-blue-400/20', border: 'border-blue-400/30', label: '파랑' },
  { bg: 'bg-green-400/20', border: 'border-green-400/30', label: '초록' },
  { bg: 'bg-purple-400/20', border: 'border-purple-400/30', label: '보라' },
];

export default function StickyNotes() {
  const [notes, setNotes] = useState<Note[]>(() => {
    try {
      const saved = localStorage.getItem('119helper-notes');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [selectedColor, setSelectedColor] = useState(0);

  useEffect(() => {
    localStorage.setItem('119helper-notes', JSON.stringify(notes));
  }, [notes]);

  const addNote = () => {
    const newNote: Note = {
      id: Date.now().toString(),
      text: '',
      color: COLORS[selectedColor].bg,
      createdAt: new Date().toLocaleString('ko-KR'),
    };
    setNotes([newNote, ...notes]);
  };

  const updateNote = (id: string, text: string) => {
    setNotes(notes.map(n => n.id === id ? { ...n, text } : n));
  };

  const deleteNote = (id: string) => {
    setNotes(notes.filter(n => n.id !== id));
  };

  const getColorClasses = (bgClass: string) => {
    const color = COLORS.find(c => c.bg === bgClass);
    return color || COLORS[0];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-on-surface font-headline">📝 메모장</h2>
          <p className="text-sm text-on-surface-variant mt-1">스티커 메모 — 브라우저에 자동 저장됩니다</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            {COLORS.map((c, i) => (
              <button
                key={c.label}
                onClick={() => setSelectedColor(i)}
                className={`w-6 h-6 rounded-full ${c.bg} border-2 ${selectedColor === i ? 'border-white scale-110' : c.border} transition-all`}
              />
            ))}
          </div>
          <button
            onClick={addNote}
            className="bg-primary hover:bg-primary/80 text-on-primary px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            새 메모
          </button>
        </div>
      </div>

      {notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant">
          <span className="material-symbols-outlined text-6xl opacity-30">sticky_note_2</span>
          <p className="mt-4 text-lg font-medium">메모가 없습니다</p>
          <p className="text-sm opacity-60">위의 "새 메모" 버튼을 눌러 메모를 추가하세요</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {notes.map(note => {
            const colorClass = getColorClasses(note.color);
            return (
              <div
                key={note.id}
                className={`${colorClass.bg} ${colorClass.border} border rounded-xl p-4 flex flex-col gap-3 group backdrop-blur-sm transition-all hover:scale-[1.02]`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-on-surface-variant">{note.createdAt}</span>
                  <button
                    onClick={() => deleteNote(note.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-on-surface-variant hover:text-error"
                  >
                    <span className="material-symbols-outlined text-lg">close</span>
                  </button>
                </div>
                <textarea
                  value={note.text}
                  onChange={(e) => updateNote(note.id, e.target.value)}
                  placeholder="메모를 입력하세요..."
                  className="bg-transparent border-none resize-none flex-1 min-h-[120px] text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-0"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
