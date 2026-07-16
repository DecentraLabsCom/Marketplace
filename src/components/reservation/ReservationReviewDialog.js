import React, { useEffect, useRef } from 'react'
import PropTypes from 'prop-types'

const safeTermsUrl = (value) => {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password
      ? parsed.toString()
      : null
  } catch {
    return null
  }
}

export default function ReservationReviewDialog({
  review,
  onConfirm,
  onCancel,
  isConfirming = false,
}) {
  const confirmButtonRef = useRef(null)
  const termsUrl = safeTermsUrl(review?.termsUrl)

  useEffect(() => {
    confirmButtonRef.current?.focus()
  }, [])

  if (!review) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isConfirming) onCancel()
      }}
    >
      <section
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-600 bg-slate-900 p-6 text-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reservation-review-title"
        aria-describedby="reservation-review-description"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !isConfirming) onCancel()
        }}
      >
        <h2 id="reservation-review-title" className="text-xl font-bold">Review reservation</h2>
        <p id="reservation-review-description" className="mt-1 text-sm text-slate-300">
          Confirm these details before your institutional passkey is requested.
        </p>

        <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <ReviewItem label="Laboratory" value={review.labName} />
          <ReviewItem label="Provider" value={review.provider} />
          <ReviewItem label="Lab time" value={review.labTime} />
          <ReviewItem label="Your local time" value={review.userTime} />
          <ReviewItem label="Duration" value={review.duration} />
          <ReviewItem label="Unit price" value={review.unitPrice} />
          <ReviewItem label="Credits to be held" value={review.totalCost} />
          <ReviewItem label="Estimated institutional credit balance after reservation" value={review.creditBalanceAfter} />
        </dl>

        <div className="mt-5 space-y-3 rounded-lg border border-slate-700 bg-slate-800 p-4 text-sm">
          <p>
            <span className="font-semibold">Cancellation policy: </span>
            {review.cancellationPolicy}
          </p>
          <p>
            <span className="font-semibold">Lab conditions: </span>
            {termsUrl ? (
              <a
                className="text-brand underline hover:text-brand-light"
                href={termsUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Read lab terms and conditions"
              >
                Read lab terms and conditions
              </a>
            ) : (
              'No lab-specific terms were published.'
            )}
          </p>
          <p className="text-slate-300">
            The institutional backend validates availability and the authoritative credit amount before creating the reservation.
          </p>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isConfirming}
            className="rounded-md border border-slate-500 px-4 py-2 text-sm font-medium hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-hover-dark disabled:cursor-wait disabled:opacity-60"
          >
            {isConfirming ? 'Preparing reservation...' : 'Confirm reservation'}
          </button>
        </div>
      </section>
    </div>
  )
}

function ReviewItem({ label, value }) {
  return (
    <div>
      <dt className="text-slate-400">{label}</dt>
      <dd className="mt-1 font-medium">{value || 'Not available'}</dd>
    </div>
  )
}

ReviewItem.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string,
}

ReservationReviewDialog.propTypes = {
  review: PropTypes.shape({
    labName: PropTypes.string,
    provider: PropTypes.string,
    labTime: PropTypes.string,
    userTime: PropTypes.string,
    duration: PropTypes.string,
    unitPrice: PropTypes.string,
    totalCost: PropTypes.string,
    creditBalanceAfter: PropTypes.string,
    cancellationPolicy: PropTypes.string,
    termsUrl: PropTypes.string,
  }),
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  isConfirming: PropTypes.bool,
}
