"use client";
import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'

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
