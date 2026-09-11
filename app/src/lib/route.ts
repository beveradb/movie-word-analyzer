import { useEffect, useState } from 'react'

export interface Route {
  path: string[]
  params: URLSearchParams
}

function parse(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '')
  const [pathPart, queryPart] = hash.split('?')
  return {
    path: pathPart.split('/').filter(Boolean),
    params: new URLSearchParams(queryPart ?? ''),
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const onChange = () => setRoute(parse())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(to: string) {
  window.location.hash = to
}
