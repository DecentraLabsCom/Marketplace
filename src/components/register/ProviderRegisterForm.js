import React, { useState, useEffect } from 'react'
import { z } from 'zod'
import { IoPerson } from 'react-icons/io5'
import ReactFlagsSelect from 'react-flags-select'
import { useUser } from '@/context/UserContext'
import { useAddProvider } from '@/hooks/user/useUsers'
import { useSaveProviderRegistration } from '@/hooks/provider/useProvider'
import AccessControl from '@/components/auth/AccessControl'
import devLog from '@/utils/dev/logger'

const providerSchema = z.object({
  name: z.string().min(1, 'Provider name is required'),
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  wallet: z.string().min(1, 'Wallet address is required').refine(
    (val) => /^0x[a-fA-F0-9]{40}$/.test(val),
    'Wallet address must start with 0x followed by 40 alphanumeric characters'
  ),
  country: z.string().min(2, 'Country is required'),
});

/**
 * Form for manual provider registration (non-SSO flow)
 */
export default function ProviderRegisterForm() {
  const { user, isSSO, isProvider, address } = useUser()
  const addProviderMutation = useAddProvider()
  const saveRegistrationMutation = useSaveProviderRegistration()
  const [formData, setFormData] = useState({ name: '', email: '', wallet: '', country: '' })
  const [errors, setErrors] = useState({})
  const [isSuccess, setIsSuccess] = useState(false)

  useEffect(() => {
    if (isSuccess) window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSuccess])

  function handleKeyDown(e) {
    if (e.key === 'Escape' || e.key === 'Enter') setIsSuccess(false)
  }

  function setSelected(country) {
    setFormData(prev => ({ ...prev, country }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormData(prev => ({ ...prev, wallet: address }))
    const validation = providerSchema.safeParse(formData)
    if (!validation.success) {
      setErrors(validation.error.flatten().fieldErrors)
      return
    }

    try {
      // Use the atomic mutation directly - let React Query handle optimistic updates
      await addProviderMutation.mutateAsync({
        name: formData.name,
        account: formData.wallet,
        email: formData.email,
        country: formData.country
      })
      
      setIsSuccess(true)
      setErrors({})
      setFormData({ name: '', email: '', wallet: '', country: '' })
    } catch (err) {
      setErrors({ general: [err.message || 'Try again later.'] })
    }
  }

  if (isProvider) return <p className="text-center">You are already registered as a provider.</p>

  return (
    <AccessControl message="Please log in to view and make reservations.">
      <form onSubmit={handleSubmit} className="max-w-sm mx-auto space-y-6">
        {/* Name, Email, Country fields with errors & success modal */}
        {/* ...existing form JSX... */}
      </form>
    </AccessControl>
  )
}
