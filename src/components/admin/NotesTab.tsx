type NoteData = { sessionId: string; number: number; title: string; text: string | null };

export function NotesTab({ notes }: { notes: NoteData[] }) {
  if (notes.length === 0) {
    return <div className="text-center py-9 text-muted text-[13.5px]">הלקוח/ה עדיין לא כתב/ה הערות</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {notes.map((n) => (
        <div key={n.sessionId} className="bg-card border border-border rounded-2xl px-4 py-3.5">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-6 h-6 rounded-lg bg-brand-soft flex items-center justify-center text-[11.5px] font-bold text-brand shrink-0">
              {n.number}
            </div>
            <div className="text-[13px] font-semibold text-brand">{n.title}</div>
          </div>
          <div className="text-[13.5px] text-ink leading-relaxed whitespace-pre-wrap">{n.text}</div>
        </div>
      ))}
    </div>
  );
}
