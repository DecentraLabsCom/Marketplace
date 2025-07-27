"use client";
import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'

/**
 * Wrapper component to prevent SSR/client hydration mismatches
 * Ensures children are only rendered on the client side after mounting
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components to render after mounting
 * @param {React.ReactNode} [props.fallback=null] - Fallback content to show during server-side rendering
 * @returns {JSX.Element} Children after mounting, or fallback during SSR
 */
// Component to prevent hydration mismatches
export default function ClientOnly({ children, fallback = null }) {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return fallback;
  }

  return children;
}

ClientOnly.propTypes = {
  children: PropTypes.node.isRequired,
  fallback: PropTypes.node
}

ClientOnly.defaultProps = {
  fallback: null
}
