'use client'

import { config } from '@fortawesome/fontawesome-svg-core'

// Font Awesome's runtime CSS injection creates a <style> element without the
// request nonce. The stylesheet is loaded statically by the root layout.
config.autoAddCss = false

export default function FontAwesomeConfig() {
  return null
}
