import { VolumeControls } from 'my-v0-project'

const noop = () => {}

export function Default() {
  return (
    <div className="max-w-sm">
      <VolumeControls
        timeRange="8W"
        aggregation="week"
        typeFilter="All"
        onTimeRangeChange={noop}
        onAggregationChange={noop}
        onTypeFilterChange={noop}
      />
    </div>
  )
}

export function LongRangeByMonth() {
  return (
    <div className="max-w-sm">
      <VolumeControls
        timeRange="1Y"
        aggregation="month"
        typeFilter="Upper"
        onTimeRangeChange={noop}
        onAggregationChange={noop}
        onTypeFilterChange={noop}
      />
    </div>
  )
}

export function WithoutTypeFilter() {
  return (
    <div className="max-w-sm">
      <VolumeControls
        timeRange="4W"
        aggregation="session"
        typeFilter="All"
        showTypeFilter={false}
        onTimeRangeChange={noop}
        onAggregationChange={noop}
        onTypeFilterChange={noop}
      />
    </div>
  )
}
