import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  StatUnit,
} from 'my-v0-project'

export function Basic() {
  return (
    <div style={{ width: '380px' }}>
      <Card>
        <CardHeader>
          <CardTitle>Upper B · Push</CardTitle>
          <CardDescription>6 exercises · 18 sets</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline" style={{ gap: '28px' }}>
            <StatUnit value="21.8K" unit="LB" label="VOLUME" />
            <StatUnit value="48" unit="MIN" label="DURATION" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function WithAction() {
  return (
    <div style={{ width: '380px' }}>
      <Card>
        <CardHeader>
          <CardTitle>Deload Week</CardTitle>
          <CardDescription>Volume reduced for 7 days</CardDescription>
          <CardAction>
            <Button size="sm" variant="ghost">
              Edit
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Sets are halved and weights pre-filled at ~72% of your working
            weights.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export function WithFooter() {
  return (
    <div style={{ width: '380px' }}>
      <Card>
        <CardHeader>
          <CardTitle>Send workouts to cloud</CardTitle>
          <CardDescription>3 workouts pending on this device</CardDescription>
        </CardHeader>
        <CardFooter className="flex gap-3">
          <Button size="sm">Send now</Button>
          <Button size="sm" variant="ghost">
            Later
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
