"use client";
import React from 'react'

/**
 * FMU upload from Marketplace is disabled by architecture.
 * Providers must provision .fmu files directly on Lab Station/Lab Gateway.
 */
export default function FmuUploadSection() {
  return (
    <div className="rounded-lg border border-[#2a2f33] bg-[#111417] p-3 text-sm text-neutral-300">
      FMU upload from Marketplace is disabled. Provision the .fmu file directly on Lab Station and register it by accessKey.
    </div>
  )
}
