type NoteData = {
  sessionId: string;
  number: number;
  title: string;
  notes: { id: string; text: string; createdAt: string }[];
};

export function NotesTab({ notes }: { notes: NoteData[] }) {
  if (notes.length === 0) {
    return <div className="text-center py-9 text-muted text-[13.5px]">הלקוח/ה עדיין לא כתב/ה הערות</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {notes.map((n) => (
        <div key={n.sessionId} className="bg-card border border-border rounded-2xl px-4 py-3.5">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-6 h-6 rounded-lg bg-brand-soft flex items-center justify-center text-[11.5px] font-bold text-brand shrink-0">
              {n.number}
            </div>
            <div className="text-[13px] font-semibold text-brand">{n.title}</div>
          </div>
          <div className="flex flex-col gap-2">
            {n.notes.map((note) => (
              <div key={note.id} className="bg-tile rounded-xl px-3 py-2.5">
                <div className="text-[13.5px] text-ink leading-relaxed whitespace-pre-wrap">{note.text}</div>
                <div className="text-[11px] text-muted-2 mt-1.5">
                  {new Date(note.createdAt).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
