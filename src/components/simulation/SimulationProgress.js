"use client";
import React from 'react'
import PropTypes from 'prop-types'

/**
 * SimulationProgress — progress bar shown during streaming simulation.
 *
 * @param {Object} props
 * @param {number} props.elapsedSeconds - Elapsed time from the last heartbeat
 * @param {number|null} props.chunkIndex - Current data chunk index (null if no data yet)
 * @param {number|null} props.totalChunks - Total expected chunks
 */
export default function SimulationProgress({ elapsedSeconds = 0, chunkIndex = null, totalChunks = null }) {
  const hasChunkProgress = chunkIndex !== null && totalChunks !== null && totalChunks > 0
  const percent = hasChunkProgress ? Math.round(((chunkIndex + 1) / totalChunks) * 100) : null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-sm text-neutral-300">
        <span className="animate-spin inline-block w-4 h-4 border-2 border-brand border-t-transparent rounded-full" />
        <span>
          Simulating&hellip; {elapsedSeconds.toFixed(1)}s
          {percent !== null && ` — receiving data ${percent}%`}
        </span>
      </div>

      {/* Progress track */}
      <div className="h-1.5 bg-[#1f2426] rounded-full overflow-hidden">
        {hasChunkProgress ? (
          <div
            className="h-full bg-brand rounded-full transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        ) : (
          <div className="h-full bg-brand/60 rounded-full animate-pulse w-1/3" />
        )}
      </div>
    </div>
  )
}

SimulationProgress.propTypes = {
  elapsedSeconds: PropTypes.number,
  chunkIndex: PropTypes.number,
  totalChunks: PropTypes.number,
}
