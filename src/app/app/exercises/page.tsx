import { getClientId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ExercisesList } from "@/components/client/ExercisesList";

function toExercise(ex: {
  id: string;
  title: string;
  audioFileUrl: string | null;
  pdfFileUrl: string | null;
  pdfFileName: string | null;
}) {
  return {
    id: ex.id,
    title: ex.title,
    hasAudio: !!ex.audioFileUrl,
    hasFile: !!ex.pdfFileUrl,
    audioUrl: ex.audioFileUrl,
    fileUrl: ex.pdfFileUrl,
    fileName: ex.pdfFileName,
  };
}

export default async function ExercisesPage() {
  const clientId = (await getClientId())!;
  const [exercises, folders] = await Promise.all([
    prisma.exercise.findMany({ where: { clientId, folderId: null }, orderBy: { number: "asc" } }),
    prisma.exerciseFolder.findMany({
      where: { clientId },
      orderBy: { order: "asc" },
      include: { items: { orderBy: { number: "asc" } } },
    }),
  ]);

  return (
    <div className="p-6 md:p-0 pb-8 animate-fade-up">
      <div className="font-heading font-bold text-[19px] md:text-2xl text-ink mb-1">תרגולים אישיים</div>
      <div className="text-[13px] text-muted mb-4 md:mb-6">חומרים שנאספו עבורך בהתאם לתהליך</div>
      <ExercisesList
        exercises={exercises.map(toExercise)}
        folders={folders.map((f) => ({ id: f.id, title: f.title, items: f.items.map(toExercise) }))}
      />
    </div>
  );
}
