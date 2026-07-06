import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide whitespace-nowrap',
  {
    variants: {
      tone: {
        good: 'bg-good-tint text-good-ink',
        warn: 'bg-warn-tint text-warn-ink',
        neutral: 'bg-ink-08 text-ink-70',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
)

function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ tone, className }))}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
