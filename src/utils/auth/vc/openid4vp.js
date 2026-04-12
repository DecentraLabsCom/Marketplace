export function buildOpenID4VPRequest({ nonce, state }) {
  return {
    client_id: 'marketplace',
    response_type: 'vp_token',
    nonce,
    state,
    presentation_definition: {
      id: 'marketplace-eudi-wallet',
      input_descriptors: [],
    },
  }
}

export default {
  buildOpenID4VPRequest,
}
