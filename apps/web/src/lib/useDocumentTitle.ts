import { useEffect } from 'react'
import { PRODUCT_NAME } from '../config'

/** Sets the browser tab's title, so staff with several tabs open can tell them apart. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · ${PRODUCT_NAME}`
    return () => {
      document.title = PRODUCT_NAME
    }
  }, [title])
}
