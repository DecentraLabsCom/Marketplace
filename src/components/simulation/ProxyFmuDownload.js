'use client'

import { Download, FileBox, ExternalLink, Wifi } from 'lucide-react'
import useSimulationGatewaySession from './hooks/useSimulationGatewaySession'
import useProxyFmuDownload from './hooks/useProxyFmuDownload'

export default function ProxyFmuDownload({ lab, reservationKey }) {
  const { fetchGateway } = useSimulationGatewaySession({ lab, reservationKey })
  const { state, message, triggerDownload } = useProxyFmuDownload({
    fetchGateway,
    lab,
    reservationKey,
    hasFmuMetadata: true,
    twinAsset: null,
    twinAssetState: 'ready',
  })
  const preparing = state === 'idle' || state === 'running'

  return (
    <section className="mx-auto my-8 w-full max-w-3xl overflow-hidden rounded-3xl border border-primary-200/20 bg-background-surface shadow-xl sm:my-12" aria-labelledby="proxy-fmu-title">
      <div className="border-b border-primary-200/15 bg-linear-to-br from-brand/40 via-primary-900/30 to-transparent px-6 py-8 sm:px-10">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary-200/30 bg-primary-200/10 text-primary-200">
          <FileBox size={28} aria-hidden="true" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary-200">Remote FMU</p>
        <h1 id="proxy-fmu-title" className="mt-2 wrap-break-word text-3xl font-bold tracking-tight text-header-bg sm:text-4xl">{lab.name || 'FMU laboratory'}</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-200">Your reservation connects your FMI tool to this remote model.</p>
      </div>

      <div className="space-y-6 px-6 py-8 sm:px-10">
        <div>
          <h2 className="text-xl font-semibold text-header-bg">Use this FMU in your own tool</h2>
          <ol className="mt-5 space-y-5 text-sm leading-relaxed text-neutral-200">
            <li className="flex gap-3">
              <Download className="mt-0.5 shrink-0 text-primary-200" size={20} aria-hidden="true" />
              <span><strong className="text-white">Get your proxy FMU.</strong> The download of <code className="rounded bg-primary-200/10 px-1.5 py-0.5 text-primary-100">proxy.fmu</code> should start automatically. Check your browser&apos;s downloads; the filename may include the laboratory ID.</span>
            </li>
            <li className="flex gap-3">
              <ExternalLink className="mt-0.5 shrink-0 text-primary-200" size={20} aria-hidden="true" />
              <span><strong className="text-white">Open your preferred FMI tool.</strong> Import the downloaded .fmu file into an FMI-compatible tool, then configure and run your simulation there.</span>
            </li>
            <li className="flex gap-3">
              <Wifi className="mt-0.5 shrink-0 text-primary-200" size={20} aria-hidden="true" />
              <span><strong className="text-white">Stay connected.</strong> Keep an internet connection while you simulate: the model runs remotely, and access is valid only during your reservation.</span>
            </li>
          </ol>
        </div>

        <div className="rounded-2xl border border-primary-200/20 bg-primary-950/30 p-4">
          <p role={state === 'error' ? 'alert' : 'status'} className={`text-sm ${state === 'error' ? 'text-error-text' : 'text-neutral-200'}`}>
            {preparing ? 'Preparing your proxy FMU…' : state === 'success' ? 'Your proxy FMU download should have started.' : message}
          </p>
          {!preparing && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {state === 'success' && <p className="text-xs text-neutral-300">If the download did not start, try again.</p>}
              <button type="button" onClick={() => void triggerDownload()} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-hover-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-200">
                <Download size={16} aria-hidden="true" />
                {state === 'error' ? 'Try download again' : 'Download again'}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
