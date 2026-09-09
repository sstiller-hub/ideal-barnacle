import { TranscriptionHeader } from 'my-v0-project'

const noop = () => {}

export function MidWorkout() {
  return (
    <div style={{ width: '520px' }}>
      <TranscriptionHeader
        workoutName="Upper B · Push"
        exerciseOrdinal={3}
        exerciseTotal={6}
        checkedSets={7}
        totalSets={18}
        onClose={noop}
      />
    </div>
  )
}

export function JustStarted() {
  return (
    <div style={{ width: '520px' }}>
      <TranscriptionHeader
        workoutName="Lower A · Squat Focus"
        exerciseOrdinal={1}
        exerciseTotal={5}
        checkedSets={0}
        totalSets={15}
        onClose={noop}
      />
    </div>
  )
}

export function Complete() {
  return (
    <div style={{ width: '520px' }}>
      <TranscriptionHeader
        workoutName="Upper B · Push"
        exerciseOrdinal={6}
        exerciseTotal={6}
        checkedSets={18}
        totalSets={18}
        onClose={noop}
      />
    </div>
  )
}
