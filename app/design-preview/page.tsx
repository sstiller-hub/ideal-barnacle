import { ExerciseCardPreview } from "@/components/exercise-card-preview"

export default function DesignPreviewPage() {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Exercise Card Design Comparison</h1>
          <p className="text-sm text-muted-foreground mt-1">Comparing current design with space-saving proposals</p>
        </div>
        <ExerciseCardPreview />
      </div>
    </div>
  )
}
