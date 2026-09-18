import { TriangleAlert } from 'lucide-react'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { Button } from '@/components/ui/button'

export function RouteError() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  const message = notFound
    ? "This page doesn't exist."
    : error instanceof Error
      ? error.message
      : 'Something went wrong.'

  return (
    <div className="pt-safe mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-muted text-warning">
        <TriangleAlert className="size-7" aria-hidden />
      </span>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">{notFound ? 'Page not found' : 'Something went wrong'}</h1>
        <p className="text-sm text-muted-foreground">{message} Your data is safe on this device.</p>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" className="h-11" onClick={() => window.location.assign('/')}>
          Go home
        </Button>
        {!notFound ? (
          <Button className="h-11" onClick={() => window.location.reload()}>
            Reload
          </Button>
        ) : null}
      </div>
    </div>
  )
}
