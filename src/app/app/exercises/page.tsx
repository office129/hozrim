import { getClientId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ExercisesList } from "@/components/client/ExercisesList";

export default async function ExercisesPage() {
  const clientId = (await getClientId())!;
  const exercises = await prisma.exercise.findMany({ where: { clientId }, orderBy: { number: "asc" } });

  return (
    <div className="p-6 md:p-0 pb-8 animate-fade-up">
      <div className="font-heading font-bold text-[19px] md:text-2xl text-ink mb-1">תרגולים אישיים</div>
      <div className="text-[13px] text-muted mb-4 md:mb-6">חומרים שנאספו עבורך בהתאם לתהליך</div>
      <ExercisesList
        exercises={exercises.map((ex) => ({
          id: ex.id,
          title: ex.title,
          hasAudio: !!ex.audioFileUrl,
          hasFile: !!ex.pdfFileUrl,
          audioUrl: ex.audioFileUrl,
          fileUrl: ex.pdfFileUrl,
          fileName: ex.pdfFileName,
        }))}
      />
    </div>
  );
}
