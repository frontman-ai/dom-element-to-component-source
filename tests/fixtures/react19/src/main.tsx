import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { getElementSourceContext } from '../../../../src/browser'

//ts-ignore
if (typeof window !== 'undefined') {
  (window as any).getElementSourceContext = getElementSourceContext
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
